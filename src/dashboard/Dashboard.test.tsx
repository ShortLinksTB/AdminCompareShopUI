import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminProducts } from '../products/products-api';
import { getAdminOffers, type AdminOfferPage } from '../offers/offers-api';
import { getDashboardPartnerShopTotal } from './dashboard-api';
import { Dashboard } from './Dashboard';

vi.mock('../products/products-api', () => ({ getAdminProducts: vi.fn() }));
vi.mock('../offers/offers-api', () => ({ getAdminOffers: vi.fn() }));
vi.mock('./dashboard-api', () => ({ getDashboardPartnerShopTotal: vi.fn() }));

const offerPage: AdminOfferPage = {
  items: [], pageNumber: 1, pageSize: 1, totalItems: 2,
  counts: { all: 2, outlier: 1, stale: 0, outOfStock: 0, inactive: 0 },
};

function renderDashboard(permissions = ['products.read', 'offers.read', 'shops.read'], requestAdmin = vi.fn()) {
  return render(<BrowserRouter><Dashboard permissions={permissions} requestAdmin={requestAdmin} /></BrowserRouter>);
}

describe('Dashboard', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminProducts).mockResolvedValue({ items: [], pageNumber: 1, pageSize: 20, totalItems: 12480 });
    vi.mocked(getAdminOffers).mockResolvedValue(offerPage);
    vi.mocked(getDashboardPartnerShopTotal).mockResolvedValue(24);
  });

  it('renders exactly the three approved KPI cards and uses a minimal offers query without sync-job requests', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(Response.json({ items: [], pageNumber: 1, pageSize: 1, totalItems: 24 }));
    vi.mocked(getDashboardPartnerShopTotal).mockImplementationOnce(async request => {
      const response = await request('/admin/shops?page=1&pageSize=1');
      return (await response.json()).totalItems;
    });
    renderDashboard(['products.read', 'offers.read', 'shops.read'], requestAdmin);

    expect(await screen.findByText('12,480')).toBeInTheDocument();
    expect(await screen.findByText('of 2 offers')).toBeInTheDocument();
    expect(await screen.findByText('24')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Tạo sản phẩm' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText('Products total')).toBeInTheDocument();
    expect(screen.getByText('Offers active')).toBeInTheDocument();
    expect(screen.getByText('Partner shops')).toBeInTheDocument();
    expect(screen.queryByText('Sync success rate')).not.toBeInTheDocument();
    for (const obsolete of ['Traffic & affiliate clicks', 'Data health', 'Offers flagged as outlier', 'Matching queue', 'No flagged offers']) {
      expect(screen.queryByText(obsolete)).not.toBeInTheDocument();
    }
    expect(getAdminProducts).toHaveBeenCalledWith(requestAdmin, 1, 20, expect.any(AbortSignal));
    expect(getAdminOffers).toHaveBeenCalledWith(requestAdmin, { page: 1, pageSize: 1, q: '', shopId: null, filter: 'all', sort: 'attention' }, expect.any(AbortSignal));
    expect(getDashboardPartnerShopTotal).toHaveBeenCalledWith(requestAdmin, expect.any(AbortSignal));
    expect(getDashboardPartnerShopTotal).toHaveBeenCalledTimes(1);
    expect(requestAdmin).toHaveBeenCalledTimes(1);
    expect(requestAdmin).toHaveBeenCalledWith('/admin/shops?page=1&pageSize=1');
    expect(requestAdmin.mock.calls.map(([path]) => path)).not.toContain('/admin/sync-jobs');
  });

  it('keeps KPI loading and empty states', async () => {
    vi.mocked(getAdminProducts).mockResolvedValueOnce({ items: [], pageNumber: 1, pageSize: 20, totalItems: 0 });
    vi.mocked(getAdminOffers).mockResolvedValueOnce({ ...offerPage, totalItems: 0, counts: { ...offerPage.counts, all: 0 } });
    renderDashboard();

    expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard metrics');
    expect(await screen.findByText('No products found')).toBeInTheDocument();
    expect(await screen.findByText('of 0 offers')).toBeInTheDocument();
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
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to view products.');
    expect(getAdminProducts).not.toHaveBeenCalled();
    expect(getAdminOffers).not.toHaveBeenCalled();
    expect(getDashboardPartnerShopTotal).not.toHaveBeenCalled();
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('shows zero shops when there are no partner shops', async () => {
    vi.mocked(getDashboardPartnerShopTotal).mockResolvedValue(0);
    renderDashboard();
    expect(await screen.findByText('No partner shops found')).toBeInTheDocument();
  });

  it('shows unavailable for metric errors and retries only the failed metric', async () => {
    vi.mocked(getDashboardPartnerShopTotal).mockRejectedValueOnce(new Error('Shop read failed'));
    vi.mocked(getDashboardPartnerShopTotal).mockResolvedValueOnce(6);
    renderDashboard();
    expect(await screen.findByRole('alert')).toHaveTextContent('Shop read failed');
    expect(screen.getAllByText('Unavailable')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry partner shops' }));
    expect(await screen.findByText('6')).toBeInTheDocument();
  });

  it('keeps each new KPI unavailable while its request is pending, then reflects resolved data', async () => {
    let resolveShop!: (value: number) => void;
    vi.mocked(getDashboardPartnerShopTotal).mockReturnValueOnce(new Promise(resolve => { resolveShop = resolve; }));
    renderDashboard();
    const cards = screen.getAllByRole('article');
    expect(within(cards[2]).getByText('—')).toBeInTheDocument();
    resolveShop(0);
    expect(await screen.findByText('No partner shops found')).toBeInTheDocument();
  });
});
