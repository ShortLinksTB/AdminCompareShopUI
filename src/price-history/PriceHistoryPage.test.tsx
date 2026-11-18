import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { PriceHistory } from './PriceHistoryPage';

afterEach(cleanup);

const products = { items: [
  { id: 42, slug: 'real-laptop', name: 'Real Laptop', brand: 'Acme', description: null, seoTitle: null, seoDescription: null, categoryId: 1, isActive: true, imageUrl: null },
], pageNumber: 1, pageSize: 100, totalItems: 1 };
const offers = [
  { id: 7, productId: 42, partnerShopId: 1, priceVnd: 120000, url: null, isActive: true, isOutlier: false, updatedAtUtc: '2026-11-03T06:00:00Z', productName: 'Real Laptop', productImageUrl: null, partnerShopName: 'Shop One', externalSku: null, imageUrl: null, originalPriceVnd: null, stockStatus: 'unknown' as const, lowestPriceVnd: 120000, deltaVnd: 0, deltaPercent: 0, outlierReason: null, otherOffersAveragePriceVnd: null, outlierDeviationPercent: null },
  { id: 8, productId: 42, partnerShopId: 2, priceVnd: 130000, url: null, isActive: true, isOutlier: false, updatedAtUtc: '2026-11-03T06:00:00Z', productName: 'Real Laptop', productImageUrl: null, partnerShopName: 'Shop Two', externalSku: null, imageUrl: null, originalPriceVnd: null, stockStatus: 'unknown' as const, lowestPriceVnd: 120000, deltaVnd: 10000, deltaPercent: 8.3, outlierReason: null, otherOffersAveragePriceVnd: null, outlierDeviationPercent: null },
];
const points = [
  { dateUtc: '2026-11-01T00:00:00Z', priceVnd: 150000 },
  { dateUtc: '2026-11-10T00:00:00Z', priceVnd: 120000 },
];

function createRequest(history: unknown = points) {
  return vi.fn(async (path: string) => {
    if (path.startsWith('/admin/products?')) return Response.json(products);
    if (path.startsWith('/admin/offers?')) return Response.json({ items: offers });
    if (path === '/admin/offers/7/price-history?days=180') return Response.json(history);
    if (path === '/admin/offers/8/price-history?days=180') return Response.json(points);
    return new Response('not found', { status: 404 });
  });
}

describe('PriceHistory', () => {
  it('searches products, selects one, and renders the selected offer live history', async () => {
    const user = userEvent.setup();
    const requestAdmin = createRequest();
    render(<PriceHistory requestAdmin={requestAdmin} />);

    expect(screen.getByRole('heading', { name: 'Price History' })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Search product' }), 'Real');
    await user.click(await screen.findByRole('option', { name: /Real Laptop/ }));

    const records = screen.getByRole('region', { name: 'Price history records' });
    expect(await within(records).findAllByText('Shop One')).toHaveLength(2);
    expect(within(records).getByText('1/11/2026')).toBeInTheDocument();
    expect(within(records).getByText('10/11/2026')).toBeInTheDocument();
    expect(within(records).getByText('−30.000 ₫')).toBeInTheDocument();
    expect(within(records).getByText('2 price records')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Real Laptop' })).toBeInTheDocument();
    expect(requestAdmin).toHaveBeenCalledWith('/admin/offers/7/price-history?days=180', expect.anything());
    expect(requestAdmin).not.toHaveBeenCalledWith(expect.stringContaining('iPhone 15'), expect.anything());
    expect(document.querySelector('.price-history-chart path')).toHaveAttribute('d', 'M0.0 25.0 L800.0 205.0');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Product offer' }), '8');
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledWith('/admin/offers/8/price-history?days=180', expect.anything()));
  });

  it('shows a real empty state when the selected offer has no history', async () => {
    const user = userEvent.setup();
    render(<PriceHistory requestAdmin={createRequest([])} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search product' }), 'Real');
    await user.click(await screen.findByRole('option', { name: /Real Laptop/ }));

    expect(await screen.findByText('No price history available')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Price history records' })).toHaveTextContent('0 price records');
    expect(screen.queryByText('iPhone 15 128GB')).not.toBeInTheDocument();
  });

  it('loads additional product pages and shows a no-offers state', async () => {
    const user = userEvent.setup();
    const requestAdmin = vi.fn(async (path: string) => {
      if (path.startsWith('/admin/products?') && path.includes('page=1')) return Response.json({ ...products, pageSize: 1, totalItems: 2 });
      if (path.startsWith('/admin/products?') && path.includes('page=2')) return Response.json({ items: [{ ...products.items[0], id: 43, slug: 'other', name: 'Other Laptop' }], pageNumber: 2, pageSize: 1, totalItems: 2 });
      if (path.startsWith('/admin/offers?')) return Response.json({ items: [] });
      return new Response('not found', { status: 404 });
    });
    render(<PriceHistory requestAdmin={requestAdmin} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search product' }), 'Other');
    await user.click(await screen.findByRole('option', { name: /Other Laptop/ }));
    expect(await screen.findByText('This product has no offers to compare.')).toBeInTheDocument();
    expect(requestAdmin).toHaveBeenCalledWith('/admin/products?page=2&pageSize=1', { signal: expect.any(AbortSignal) });
  });

  it('shows product and offer API errors', async () => {
    const user = userEvent.setup();
    const productFailure = vi.fn(async () => new Response('failed', { status: 500 }));
    render(<PriceHistory requestAdmin={productFailure} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search product' }), 'Laptop');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load products');
    cleanup();

    const offerFailure = vi.fn(async (path: string) => path.startsWith('/admin/products?')
      ? Response.json(products)
      : new Response('failed', { status: 500 }));
    render(<PriceHistory requestAdmin={offerFailure} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search product' }), 'Real');
    await user.click(await screen.findByRole('option', { name: /Real Laptop/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load product offers');
  });

  it('renders a single returned point without inventing chart values', async () => {
    const user = userEvent.setup();
    render(<PriceHistory requestAdmin={createRequest([{ dateUtc: '2026-11-01T00:00:00Z', priceVnd: 125000 }])} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search product' }), 'Real');
    await user.click(await screen.findByRole('option', { name: /Real Laptop/ }));
    await waitFor(() => expect(document.querySelector('.price-history-chart circle')).toBeInTheDocument());
    expect(document.querySelector('.price-history-chart path')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Price history records' })).toHaveTextContent('125.000 ₫');
  });

  it('shows an API failure state and makes the unsupported export action explicit', async () => {
    const user = userEvent.setup();
    const requestAdmin = vi.fn(async (path: string) => {
      if (path.startsWith('/admin/products?')) return Response.json(products);
      if (path.startsWith('/admin/offers?')) return Response.json({ items: offers });
      if (path.includes('/price-history')) return new Response('failed', { status: 500 });
      return new Response('not found', { status: 404 });
    });
    render(<PriceHistory requestAdmin={requestAdmin} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search product' }), 'Real');
    await user.click(await screen.findByRole('option', { name: /Real Laptop/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load price history');

    await user.click(screen.getByRole('button', { name: '⇩ Export report' }));
    expect(screen.getByRole('status')).toHaveTextContent('No export API or existing price-history export is implemented');
  });
});
