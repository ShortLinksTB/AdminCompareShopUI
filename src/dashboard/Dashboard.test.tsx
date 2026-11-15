import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminProducts } from '../products/products-api';
import { getAdminOffers, type AdminOfferPage } from '../offers/offers-api';
import { Dashboard } from './Dashboard';

vi.mock('../products/products-api', () => ({ getAdminProducts: vi.fn() }));
vi.mock('../offers/offers-api', () => ({ getAdminOffers: vi.fn() }));

const offerPage: AdminOfferPage = {
  items: [],
  pageNumber: 1,
  pageSize: 100,
  totalItems: 2,
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

  it('keeps the approved header and four KPI cards while removing the retired dashboard panels', async () => {
    const requestAdmin = vi.fn();
    renderDashboard(['products.read', 'offers.read'], requestAdmin);

    expect(await screen.findByText('12,480')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Tổng quan sức khỏe catalog, giá và affiliate data.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Tạo sản phẩm' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Chỉ số tổng quan' }).querySelectorAll('article')).toHaveLength(4);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('of 2 offers')).toBeInTheDocument();

    for (const removedHeading of ['Traffic & affiliate clicks', 'Data health', 'Offers flagged as outlier', 'Matching queue']) {
      expect(screen.queryByRole('heading', { name: removedHeading })).not.toBeInTheDocument();
    }
    expect(screen.queryByText('No flagged offers')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Xem tất cả →' })).not.toBeInTheDocument();
    expect(getAdminProducts).toHaveBeenCalledWith(requestAdmin, 1, 20, expect.any(AbortSignal));
    expect(getAdminOffers).toHaveBeenCalledWith(requestAdmin, { page: 1, pageSize: 100, q: '', shopId: null, filter: 'all', sort: 'attention' }, expect.any(AbortSignal));
  });

  it('preserves the KPI loading, empty, and error states', async () => {
    let rejectOffers!: (error: Error) => void;
    vi.mocked(getAdminProducts).mockResolvedValueOnce({ items: [], pageNumber: 1, pageSize: 20, totalItems: 0 });
    vi.mocked(getAdminOffers).mockImplementationOnce(() => new Promise((_, reject) => { rejectOffers = reject; }));
    renderDashboard();

    expect(screen.getAllByText('Loading…')).toHaveLength(2);
    expect(await screen.findByText('No products found')).toBeInTheDocument();
    rejectOffers(new Error('Could not load offers. Please try again.'));
    await waitFor(() => expect(screen.getByText('Unavailable')).toBeInTheDocument());
    expect(screen.getAllByText('—')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load offers. Please try again.');
  });

  it('does not request KPI data without permission and reports the access errors', async () => {
    renderDashboard([]);

    expect(await screen.findByText('You do not have permission to view products.')).toBeInTheDocument();
    expect(screen.getByText('You do not have permission to view offers.')).toBeInTheDocument();
    expect(getAdminProducts).not.toHaveBeenCalled();
    expect(getAdminOffers).not.toHaveBeenCalled();
  });
});
