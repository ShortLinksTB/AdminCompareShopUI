import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ProductsPage } from './ProductsPage';
import type { AdminProduct, AdminRequest } from './products-api';

const first: AdminProduct = { id: 42, slug: 'phone-a', name: 'Phone A', brand: 'Brand A', description: null, seoTitle: null, seoDescription: null, categoryId: 7, isActive: true };
const second = { ...first, id: 43, slug: 'phone-b', name: 'Phone B', brand: null, categoryId: 8, isActive: false };
const third = { ...first, id: 44, slug: 'phone-c', name: 'Phone C', categoryId: 9 };
const response = (items = [first], pageNumber = 1, pageSize = 20, totalItems = items.length) => Response.json({ items, pageNumber, pageSize, totalItems });

afterEach(cleanup);

describe('ProductsPage', () => {
  it('loads contract fields and excludes mock-derived offers, prices, and timestamps', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(response());
    render(<ProductsPage requestAdmin={requestAdmin} />);

    expect(screen.getByRole('heading', { name: 'Products' })).toBeInTheDocument();
    expect(await screen.findByText('Phone A')).toBeInTheDocument();
    expect(screen.getByText('Brand A · ID 42')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByText(/Lowest price|Offers|Updated/)).not.toBeInTheDocument();
    expect(requestAdmin).toHaveBeenCalledWith('/admin/products?page=1&pageSize=20', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('shows a loading state before the request resolves and then shows the empty state', async () => {
    let resolve!: (value: Response) => void;
    const requestAdmin = vi.fn<AdminRequest>().mockReturnValue(new Promise(done => { resolve = done; }));
    render(<ProductsPage requestAdmin={requestAdmin} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading products');
    resolve(response([], 1, 20, 0));
    expect(await screen.findByText('No products found')).toBeInTheDocument();
  });

  it('shows retryable errors without rendering stale or mock rows', async () => {
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(response([first]));
    render(<ProductsPage requestAdmin={requestAdmin} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('status 500');
    expect(screen.queryByText('Phone A')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Phone A')).toBeInTheDocument();
  });

  it('uses the response pagination values for the next request and status/search filters', async () => {
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(response([first, second], 1, 20, 21))
      .mockResolvedValueOnce(response([second], 2, 20, 21));
    render(<ProductsPage requestAdmin={requestAdmin} />);

    expect(await screen.findByText('Phone A')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(requestAdmin).toHaveBeenLastCalledWith('/admin/products?page=2&pageSize=20', expect.any(Object)));
    expect(await screen.findByText('Phone B')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by status' }), { target: { value: 'inactive' } });
    expect(screen.queryByText('Phone A')).not.toBeInTheDocument();
    expect(screen.getByText('Phone B')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search products' }), { target: { value: 'no match' } });
    expect(screen.getByText('Try changing your search or status filter.')).toBeInTheDocument();
  });

  it('toggles a product row and exposes selected status', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(response([first, second]));
    render(<ProductsPage requestAdmin={requestAdmin} />);

    const rowCheckbox = await screen.findByRole('checkbox', { name: 'Select Phone A' });
    fireEvent.click(rowCheckbox);

    expect(rowCheckbox).toBeChecked();
    expect(rowCheckbox.closest('tr')).toHaveClass('products-row-selected');
    expect(screen.getByRole('status')).toHaveTextContent('1 selected');

    fireEvent.click(rowCheckbox);
    expect(rowCheckbox).not.toBeChecked();
    expect(rowCheckbox.closest('tr')).not.toHaveClass('products-row-selected');
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
  });

  it('selects and clears every currently visible product', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(response([first, second]));
    render(<ProductsPage requestAdmin={requestAdmin} />);

    const selectAll = await screen.findByRole('checkbox', { name: 'Select all visible products' });
    fireEvent.click(selectAll);

    expect(selectAll).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Phone A' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Phone B' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('2 selected');

    fireEvent.click(selectAll);
    expect(selectAll).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Phone A' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Phone B' })).not.toBeChecked();
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
  });

  it('keeps filtered selections and only changes visible rows when selecting all', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(response([first, second]));
    render(<ProductsPage requestAdmin={requestAdmin} />);

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Phone A' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by status' }), { target: { value: 'inactive' } });

    const phoneB = screen.getByRole('checkbox', { name: 'Select Phone B' });
    expect(screen.getByRole('checkbox', { name: 'Select all visible products' })).not.toBeChecked();
    expect(phoneB).not.toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('1 selected');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible products' }));
    expect(phoneB).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('2 selected');

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by status' }), { target: { value: 'all' } });
    expect(screen.getByRole('checkbox', { name: 'Select Phone A' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Phone B' })).toBeChecked();
  });

  it('preserves selections across API pagination and selects all only on the current page', async () => {
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(response([first, second], 1, 20, 21))
      .mockResolvedValueOnce(response([third], 2, 20, 21))
      .mockResolvedValueOnce(response([first, second], 1, 20, 21));
    render(<ProductsPage requestAdmin={requestAdmin} />);

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Phone A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    const phoneC = await screen.findByRole('checkbox', { name: 'Select Phone C' });
    expect(screen.getByRole('status')).toHaveTextContent('1 selected');
    expect(phoneC).not.toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible products' }));
    expect(phoneC).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('2 selected');

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(await screen.findByRole('checkbox', { name: 'Select Phone A' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Phone B' })).not.toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('2 selected');
  });
});
