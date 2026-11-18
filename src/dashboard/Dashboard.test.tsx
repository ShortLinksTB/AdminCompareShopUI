import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminProducts } from '../products/products-api';
import { getAdminOffers, type AdminOfferPage } from '../offers/offers-api';
import { getDashboardPartnerShopTotal, getDashboardSyncJobTotals } from './dashboard-api';
import { Dashboard } from './Dashboard';

vi.mock('../products/products-api', () => ({ getAdminProducts: vi.fn() }));
vi.mock('../offers/offers-api', () => ({ getAdminOffers: vi.fn() }));
vi.mock('./dashboard-api', () => ({ getDashboardPartnerShopTotal: vi.fn(), getDashboardSyncJobTotals: vi.fn() }));

const offerPage: AdminOfferPage = {
  items: [], pageNumber: 1, pageSize: 1, totalItems: 2,
  counts: { all: 2, outlier: 1, stale: 0, outOfStock: 0, inactive: 0 },
};

const allReadPermissions = ['products.read', 'offers.read', 'shops.read', 'sync_jobs.read'];

function renderDashboard(permissions = allReadPermissions, requestAdmin = vi.fn()) {
  return render(<BrowserRouter><Dashboard permissions={permissions} requestAdmin={requestAdmin} /></BrowserRouter>);
}

describe('Dashboard', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminProducts).mockResolvedValue({ items: [], pageNumber: 1, pageSize: 20, totalItems: 12480 });
    vi.mocked(getAdminOffers).mockResolvedValue(offerPage);
    vi.mocked(getDashboardPartnerShopTotal).mockResolvedValue(24);
    vi.mocked(getDashboardSyncJobTotals).mockResolvedValue({ successful: 98, terminal: 100 });
  });

  it('renders only the approved header and four KPI cards and uses a minimal offers query', async () => {
    const requestAdmin = vi.fn();
    renderDashboard(allReadPermissions, requestAdmin);

    expect(await screen.findByText('12,480')).toBeInTheDocument();
    expect(await screen.findByText('of 2 offers')).toBeInTheDocument();
    expect(await screen.findByText('24')).toBeInTheDocument();
    expect(await screen.findByText('98.0%')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Tạo sản phẩm' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getByText('Products total')).toBeInTheDocument();
    expect(screen.getByText('Offers active')).toBeInTheDocument();
    expect(screen.getByText('Partner shops')).toBeInTheDocument();
    expect(screen.getByText('Sync success rate')).toBeInTheDocument();
    for (const obsolete of ['Traffic & affiliate clicks', 'Data health', 'Offers flagged as outlier', 'Matching queue', 'No flagged offers']) {
      expect(screen.queryByText(obsolete)).not.toBeInTheDocument();
    }
    expect(getAdminProducts).toHaveBeenCalledWith(requestAdmin, 1, 20, expect.any(AbortSignal));
    expect(getAdminOffers).toHaveBeenCalledWith(requestAdmin, { page: 1, pageSize: 1, q: '', shopId: null, filter: 'all', sort: 'attention' }, expect.any(AbortSignal));
    expect(getDashboardPartnerShopTotal).toHaveBeenCalledWith(requestAdmin, expect.any(AbortSignal));
    expect(getDashboardSyncJobTotals).toHaveBeenCalledWith(requestAdmin, expect.any(AbortSignal));
  });

  it('keeps KPI loading and empty states', async () => {
    vi.mocked(getAdminProducts).mockResolvedValueOnce({ items: [], pageNumber: 1, pageSize: 20, totalItems: 0 });
    vi.mocked(getAdminOffers).mockResolvedValueOnce({ ...offerPage, totalItems: 0, counts: { ...offerPage.counts, all: 0 } });
    vi.mocked(getDashboardPartnerShopTotal).mockResolvedValueOnce(0);
    vi.mocked(getDashboardSyncJobTotals).mockResolvedValueOnce({ successful: 0, terminal: 0 });
    renderDashboard();

    expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard metrics');
    expect(await screen.findByText('No products found')).toBeInTheDocument();
    expect(await screen.findByText('of 0 offers')).toBeInTheDocument();
    expect(await screen.findByText('N/A')).toBeInTheDocument();
    expect(await screen.findByText('No terminal jobs')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps KPI errors visible and retries failed reads', async () => {
    vi.mocked(getAdminProducts).mockRejectedValueOnce(new Error('Could not load products. Please try again.'));
    vi.mocked(getAdminProducts).mockResolvedValueOnce({ items: [], pageNumber: 1, pageSize: 20, totalItems: 3 });
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load products. Please try again.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry products' }));
    expect(await screen.findByText('All catalog products')).toBeInTheDocument();
    await waitFor(() => expect(getAdminProducts).toHaveBeenCalledTimes(2));
  });

  it('does not call APIs when their KPI permissions are missing', async () => {
    renderDashboard([]);
    expect(await screen.findByText('You do not have permission to view products.')).toBeInTheDocument();
    expect(getAdminProducts).not.toHaveBeenCalled();
    expect(getAdminOffers).not.toHaveBeenCalled();
    expect(getDashboardPartnerShopTotal).not.toHaveBeenCalled();
    expect(getDashboardSyncJobTotals).not.toHaveBeenCalled();
    expect(screen.getAllByRole('article')).toHaveLength(4);
  });

  it('shows unavailable and lets each live metric retry after a request error', async () => {
    vi.mocked(getDashboardPartnerShopTotal).mockRejectedValueOnce(new Error('shops offline')).mockResolvedValueOnce(0);
    vi.mocked(getDashboardSyncJobTotals).mockRejectedValueOnce(new Error('sync offline')).mockResolvedValueOnce({ successful: 0, terminal: 0 });
    renderDashboard();

    expect(await screen.findAllByText('Unavailable')).toHaveLength(2);
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Retry partner shops' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry Sync Jobs' }));
    expect(await screen.findByText('All partner shops')).toBeInTheDocument();
    expect(await screen.findByText('No terminal jobs')).toBeInTheDocument();
  });

  it('aborts in-flight dashboard requests when the component unmounts', async () => {
    let resolveShops!: (value: number) => void;
    let resolveSync!: (value: { successful: number; terminal: number }) => void;
    vi.mocked(getDashboardPartnerShopTotal).mockReturnValueOnce(new Promise(resolve => { resolveShops = resolve; }));
    vi.mocked(getDashboardSyncJobTotals).mockReturnValueOnce(new Promise(resolve => { resolveSync = resolve; }));
    const { unmount } = renderDashboard();
    await waitFor(() => expect(getDashboardPartnerShopTotal).toHaveBeenCalled());
    const shopsSignal = vi.mocked(getDashboardPartnerShopTotal).mock.calls[0][1];
    const syncSignal = vi.mocked(getDashboardSyncJobTotals).mock.calls[0][1];
    unmount();
    expect(shopsSignal?.aborted).toBe(true);
    expect(syncSignal?.aborted).toBe(true);
    resolveShops(0);
    resolveSync({ successful: 0, terminal: 0 });
  });
});
