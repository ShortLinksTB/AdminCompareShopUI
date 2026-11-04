import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ProductsPage } from './ProductsPage';
import type { AdminProduct, AdminRequest } from './products-api';

const phone: AdminProduct = { id: 42, slug: 'phone-a', name: 'Phone A', brand: 'Brand A', description: 'Good phone', seoTitle: null, seoDescription: null, categoryId: 7, isActive: true, imageUrl: 'https://img.example/phone.jpg' };
const inactive = { ...phone, id: 43, slug: 'phone-b', name: 'Phone B', categoryId: 8, isActive: false, imageUrl: null };
const categoryList = [{ id: 7, slug: 'phones', name: 'Phones', isActive: true }, { id: 8, slug: 'audio', name: 'Audio', isActive: true }];
const pageResponse = (items: AdminProduct[] = [phone], pageNumber = 1, pageSize = 10, totalItems = items.length) => Response.json({ items, pageNumber, pageSize, totalItems });

function requestFor(rows = [phone, inactive]): ReturnType<typeof vi.fn<AdminRequest>> {
  return vi.fn<AdminRequest>().mockImplementation(path => path.startsWith('/admin/categories')
    ? Promise.resolve(Response.json({ items: categoryList, pageNumber: 1, pageSize: 100, totalItems: categoryList.length }))
    : Promise.resolve(pageResponse(rows, 1, 10, rows.length)));
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ProductsPage', () => {
  it('loads paged products and category names with the default page size of 10', async () => {
    const requestAdmin = requestFor();
    render(<ProductsPage requestAdmin={requestAdmin} permissions={['products.read']} />);

    expect(await screen.findByText('Phone A')).toBeInTheDocument();
    expect(screen.getByText('Phones')).toBeInTheDocument();
    expect(screen.getByText('Audio')).toBeInTheDocument();
    expect(screen.getByText('phone-a')).toBeInTheDocument();
    expect(screen.queryByText(/ID 42/)).not.toBeInTheDocument();
    expect(requestAdmin).toHaveBeenCalledWith('/admin/products?page=1&pageSize=10', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(requestAdmin).toHaveBeenCalledWith('/admin/categories?page=1&pageSize=100', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(document.querySelector('.products-total')).toHaveTextContent('Tổng 2 sản phẩm');
  });

  it('keeps the loading state until the API resolves and shows an empty state', async () => {
    let resolveProducts!: (response: Response) => void;
    const requestAdmin = vi.fn<AdminRequest>().mockImplementation(path => path.startsWith('/admin/categories')
      ? Promise.resolve(Response.json({ items: categoryList }))
      : new Promise(resolve => { resolveProducts = resolve; }));
    render(<ProductsPage requestAdmin={requestAdmin} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading products');
    resolveProducts(pageResponse([], 1, 10, 0));
    expect(await screen.findByText('No products found')).toBeInTheDocument();
  });

  it('applies status filtering on the server and uses the returned filtered total', async () => {
    const requestAdmin = requestFor([phone, inactive]);
    render(<ProductsPage requestAdmin={requestAdmin} />);
    await screen.findByText('Phone A');
    fireEvent.click(screen.getByRole('button', { name: 'All status' }));
    fireEvent.click(screen.getByRole('option', { name: /Inactive/ }));
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledWith('/admin/products?page=1&pageSize=10&isActive=false', expect.any(Object)));
    expect(document.querySelector('.products-total')).toHaveTextContent('Tổng 2 sản phẩm');
    expect(screen.getByRole('button', { name: 'Inactive' })).toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: 'Filter by status' })).not.toBeInTheDocument();
  });

  it.each([
    'All status',
    'Active',
    'Inactive',
  ])('closes the status menu after selecting %s', async (label) => {
    render(<ProductsPage requestAdmin={requestFor()} />);
    await screen.findByText('Phone A');
    fireEvent.click(screen.getByRole('button', { name: 'All status' }));
    fireEvent.click(screen.getByRole('option', { name: new RegExp(label) }));

    expect(screen.queryByRole('listbox', { name: 'Filter by status' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-expanded', 'false');
  });

  it('changes page size through the API and moves to the first page', async () => {
    const requestAdmin = requestFor();
    render(<ProductsPage requestAdmin={requestAdmin} />);
    await screen.findByText('Phone A');
    fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '20' } });
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledWith('/admin/products?page=1&pageSize=20', expect.any(Object)));
  });

  it('selects the current page rows through the table checkboxes', async () => {
    render(<ProductsPage requestAdmin={requestFor()} />);
    await screen.findByText('Phone A');
    const all = screen.getByRole('checkbox', { name: 'Select all products' });
    fireEvent.click(all);
    expect(all).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Phone A' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Phone B' })).toBeChecked();
  });

  it('shows missing-image text and opens a zoomable lightbox that closes with Escape', async () => {
    const addEventListener = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    const requestAdmin = requestFor();
    render(<ProductsPage requestAdmin={requestAdmin} />);
    await screen.findByText('Phone A');
    expect(screen.getByText('No image')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View image of Phone A' }));
    const image = screen.getByRole('img', { name: 'Phone A' });
    expect(image).toBeInTheDocument();
    expect(addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
    fireEvent.wheel(image.parentElement!, { deltaY: -100, clientX: 100, clientY: 100 });
    expect(await screen.findByText('115%')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('img', { name: 'Phone A' })).not.toBeInTheDocument();
  });

  it('opens the permission-gated edit form and sends current ImageUrl in the full replacement PUT', async () => {
    const requestAdmin = requestFor();
    requestAdmin.mockImplementation(path => {
      if (path.startsWith('/admin/categories')) return Promise.resolve(Response.json({ items: categoryList }));
      if (path === '/admin/products?page=1&pageSize=10') return Promise.resolve(pageResponse([phone]));
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    render(<ProductsPage requestAdmin={requestAdmin} permissions={['products.read', 'products.update']} />);
    await screen.findByText('Phone A');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Phone A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tên sản phẩm'), { target: { value: 'Phone A updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledWith('/admin/products/42', expect.objectContaining({ method: 'PUT' })));
    const put = requestAdmin.mock.calls.find(([path, init]) => path === '/admin/products/42' && init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({ name: 'Phone A updated', imageUrl: phone.imageUrl, categoryId: 7 });
  });

  it('hides row actions without update or delete permission and confirms deletion before DELETE', async () => {
    const requestAdmin = requestFor([phone]);
    render(<ProductsPage requestAdmin={requestAdmin} permissions={['products.read']} />);
    await screen.findByText('Phone A');
    expect(screen.queryByRole('button', { name: 'Actions for Phone A' })).not.toBeInTheDocument();

    cleanup();
    requestAdmin.mockImplementation(path => path.startsWith('/admin/categories')
      ? Promise.resolve(Response.json({ items: categoryList }))
      : path === '/admin/products?page=1&pageSize=10' ? Promise.resolve(pageResponse([phone])) : Promise.resolve(new Response(null, { status: 204 })));
    render(<ProductsPage requestAdmin={requestAdmin} permissions={['products.read', 'products.delete']} />);
    await screen.findByText('Phone A');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Phone A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(requestAdmin).not.toHaveBeenCalledWith('/admin/products/42', expect.objectContaining({ method: 'DELETE' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá sản phẩm' }));
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledWith('/admin/products/42', { method: 'DELETE' }));
  });

  it('closes row menus on outside click and Escape', async () => {
    render(<ProductsPage requestAdmin={requestFor()} permissions={['products.read', 'products.update']} />);
    await screen.findByText('Phone A');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Phone A' }));
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
  });
});
