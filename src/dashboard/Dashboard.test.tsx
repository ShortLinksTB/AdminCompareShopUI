import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminProducts } from '../products/products-api';
import { getAdminOffers, type AdminOfferPage } from '../offers/offers-api';
import { Dashboard } from './Dashboard';

vi.mock('../products/products-api', () => ({ getAdminProducts: vi.fn() }));
vi.mock('../offers/offers-api', () => ({ getAdminOffers: vi.fn() }));

const offerPage: AdminOfferPage = {
  items: [{ id: 2048, productId: 2048, partnerShopId: 12, priceVnd: 18490000, url: null, isActive: true, isOutlier: true, updatedAtUtc: '2026-11-13T00:00:00Z', productName: 'Phone', productImageUrl: null, partnerShopName: 'Shop', externalSku: null, imageUrl: null, originalPriceVnd: null, stockStatus: 'in_stock', lowestPriceVnd: null, deltaVnd: null, deltaPercent: null, outlierReason: null, otherOffersAveragePriceVnd: null, outlierDeviationPercent: null }],
  pageNumber: 1, pageSize: 100, totalItems: 2,
  counts: { all: 2, outlier: 1, stale: 0, outOfStock: 0, inactive: 0 },
};

function renderDashboard(permissions = ['products.read', 'offers.read'], requestAdmin = vi.fn()) {
  return render(<BrowserRouter><Dashboard permissions={permissions} requestAdmin={requestAdmin} /></BrowserRouter>);
}

describe('Dashboard', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminProducts).mockResolvedValue({ items: [], pageNumber: 1, pageSize: 20, totalItems: 12480 });
    vi.mocked(getAdminOffers).mockResolvedValue(offerPage);
  });

  it('renders the Studio dashboard content, preserves API query, and exposes chart data in a table', async () => {
    const requestAdmin = vi.fn();
    renderDashboard(['products.read', 'offers.read'], requestAdmin);

    expect(await screen.findByText('12,480')).toBeInTheDocument();
    expect(screen.getByText('2048')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Traffic & affiliate clicks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Data health' })).toBeInTheDocument();
    expect(screen.getByText('MacBook Air M5 13 16GB 512GB')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Bảng dữ liệu thay thế cho biểu đồ'));
    expect(screen.getAllByRole('table')[0]).toHaveTextContent('6,840 lượt xem');
    expect(screen.getByLabelText('Khoảng thời gian')).toHaveValue('30 ngày');
    expect(getAdminProducts).toHaveBeenCalledWith(requestAdmin, 1, 20, expect.any(AbortSignal));
    expect(getAdminOffers).toHaveBeenCalledWith(requestAdmin, { page: 1, pageSize: 100, q: '', shopId: null, filter: 'all', sort: 'attention' }, expect.any(AbortSignal));
  });

  it('keeps loading and retryable error states visible without presenting errors as zero', async () => {
    let rejectOffers!: (error: Error) => void;
    vi.mocked(getAdminOffers).mockImplementationOnce(() => new Promise((_, reject) => { rejectOffers = reject; }));
    vi.mocked(getAdminOffers).mockResolvedValueOnce({ ...offerPage, totalItems: 0, items: [] });
    renderDashboard();

    expect(screen.getByText('Loading offers…')).toBeInTheDocument();
    rejectOffers(new Error('Could not load offers. Please try again.'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load offers. Please try again.');
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No offers found')).toBeInTheDocument();
  });

  it('keeps the outlier panel heading and empty state inside the same panel in reading order', async () => {
    vi.mocked(getAdminOffers).mockResolvedValueOnce({ ...offerPage, items: [] });
    renderDashboard();

    const emptyState = (await screen.findByText('No flagged offers')).closest('.dashboard-offers-state');
    const panel = emptyState?.closest('.dashboard-lower-panel');

    expect(panel?.firstElementChild).toHaveClass('dashboard-panel-heading');
    expect(panel?.querySelector('a[href="/offers"]')).toHaveTextContent('Xem tất cả →');
    expect(panel?.lastElementChild).toBe(emptyState);
  });

  it('does not call APIs for missing permissions and retains matching dashboard content', async () => {
    renderDashboard([]);
    expect(await screen.findByText('You do not have permission to view products.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('You do not have permission to view offers.')).toBeInTheDocument());
    expect(getAdminProducts).not.toHaveBeenCalled();
    expect(getAdminOffers).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Matching queue' })).toBeInTheDocument();
  });
});
