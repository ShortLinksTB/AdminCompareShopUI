import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { AdminRequest } from '../bannedItemsApi';
import { PriceAlertsPage } from './PriceAlertsPage';

afterEach(cleanup);

const alert = { id: 17, productName: 'Camera X', productSlug: 'camera-x', targetPrice: 1200000, isActive: true, createdAtUtc: '2026-11-18T09:00:00Z' };
const page = (items = [alert], pageNumber = 1, totalItems = items.length) => ({ items, pageNumber, pageSize: 25, totalItems });
const requestWith = (...responses: Response[]) => vi.fn<AdminRequest>().mockImplementation(async () => responses.shift()!);

describe('PriceAlertsPage', () => {
  it('shows API-mapped fields, status and pagination without unsupported values', async () => {
    const requestAdmin = requestWith(Response.json(page([alert, { ...alert, id: 18, isActive: false }], 1, 26)));
    render(<PriceAlertsPage requestAdmin={requestAdmin} />);

    expect(screen.getByRole('status', { name: 'Đang tải Price Alerts' })).toBeInTheDocument();
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Product', 'Target price', 'Status', 'Created']);
    expect(within(table).getAllByText('Camera X')).toHaveLength(2);
    expect(within(table).getAllByText('camera-x')).toHaveLength(2);
    expect(within(table).getAllByText(/1\.200\.000/)).toHaveLength(2);
    expect(within(table).getByText('Active')).toBeInTheDocument();
    expect(within(table).getByText('Inactive')).toBeInTheDocument();
    expect(within(table).getAllByText(/18\/11\/\d{2,4}/)).toHaveLength(2);
    expect(screen.getByText('1–25')).toBeInTheDocument();
    expect(screen.queryByText(/Current price|Subscribers|Last notified|Active alerts|Triggered today|Delivery rate/)).not.toBeInTheDocument();
    expect(requestAdmin).toHaveBeenCalledWith('/admin/price-alerts?page=1&pageSize=25', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('renders an empty state with no table', async () => {
    render(<PriceAlertsPage requestAdmin={requestWith(Response.json(page([], 1, 0)))} />);
    expect(await screen.findByText('No price alerts available.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders only the loading state while a request is pending', async () => {
    let resolveRequest!: (response: Response) => void;
    const requestAdmin = vi.fn<AdminRequest>(() => new Promise(resolve => { resolveRequest = resolve; }));
    render(<PriceAlertsPage requestAdmin={requestAdmin} />);
    expect(screen.getByRole('status', { name: 'Đang tải Price Alerts' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('No price alerts available.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    resolveRequest(Response.json(page()));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('retries the same page after an error', async () => {
    const requestAdmin = requestWith(new Response(null, { status: 500 }), Response.json(page()));
    render(<PriceAlertsPage requestAdmin={requestAdmin} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('status 500');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(requestAdmin).toHaveBeenNthCalledWith(2, '/admin/price-alerts?page=1&pageSize=25', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('requests the selected page and clears the previous rows while loading', async () => {
    let resolveSecond!: (response: Response) => void;
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(Response.json(page([alert], 1, 60)))
      .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; }));
    render(<PriceAlertsPage requestAdmin={requestAdmin} />);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));

    expect(screen.getByRole('status', { name: 'Đang tải Price Alerts' })).toBeInTheDocument();
    expect(screen.queryByText('Camera X')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(requestAdmin).toHaveBeenLastCalledWith('/admin/price-alerts?page=2&pageSize=25', expect.objectContaining({ signal: expect.any(AbortSignal) }));

    resolveSecond(Response.json(page([{ ...alert, id: 19, productName: 'Page two item' }], 2, 60)));
    expect(await screen.findByText('Page two item')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Đang tải Price Alerts' })).not.toBeInTheDocument());
  });
});
