import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { OffersPage } from './OffersPage';
import type { AdminOffer, AdminRequest } from './offers-api';

const activeOutlier: AdminOffer = {
  id: 201, productId: 42, partnerShopId: 8, priceVnd: 18990000,
  url: 'https://shop.example/offer/201', isActive: true, isOutlier: true,
  updatedAtUtc: '2026-11-03T06:00:00Z',
};
const inactiveNormal: AdminOffer = {
  id: 202, productId: 43, partnerShopId: 9, priceVnd: 25990000,
  url: null, isActive: false, isOutlier: false, updatedAtUtc: '2026-11-02T06:00:00Z',
};

afterEach(cleanup);

describe('OffersPage', () => {
  it('renders only contract-backed offer values and keeps active/outlier flags independent', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(Response.json([activeOutlier, inactiveNormal]));
    render(<OffersPage requestAdmin={requestAdmin} />);

    expect(await screen.findByText(content => content.includes('18.990.000'))).toBeInTheDocument();
    const activeRow = screen.getByText('201').closest('tr')!;
    expect(activeRow).toHaveTextContent('Active');
    expect(activeRow).toHaveTextContent('Outlier');
    const inactiveRow = screen.getByText('202').closest('tr')!;
    expect(inactiveRow).toHaveTextContent('Inactive');
    expect(inactiveRow).toHaveTextContent('Not flagged');
    expect(screen.getByRole('link', { name: 'Open offer' })).toHaveAttribute('href', activeOutlier.url);
    expect(screen.queryByText(/Shopee|Tiki|Availability|Source/)).not.toBeInTheDocument();
    expect(requestAdmin).toHaveBeenCalledWith('/admin/offers', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('shows loading and empty states for an empty API array', async () => {
    let resolve!: (response: Response) => void;
    const requestAdmin = vi.fn<AdminRequest>().mockReturnValue(new Promise(done => { resolve = done; }));
    render(<OffersPage requestAdmin={requestAdmin} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading offers');
    resolve(Response.json([]));
    expect(await screen.findByText('No offers found')).toBeInTheDocument();
  });

  it('shows retryable request errors without stale or mock offers', async () => {
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(Response.json([activeOutlier]));
    render(<OffersPage requestAdmin={requestAdmin} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('status 500');
    expect(screen.queryByText('201')).not.toBeInTheDocument();
    expect(screen.queryByText(/iPhone|CellphoneS/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('201')).toBeInTheDocument();
  });

  it.each([401, 403])('shows the denied state for status %i without rendering rows', async status => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(new Response('', { status }));
    render(<OffersPage requestAdmin={requestAdmin} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to view offers.');
    expect(screen.queryByText('201')).not.toBeInTheDocument();
  });

  it('filters by contract ID and the independent active/outlier booleans', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(Response.json([activeOutlier, inactiveNormal]));
    render(<OffersPage requestAdmin={requestAdmin} />);

    await screen.findByText('201');
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter offers' }), { target: { value: 'outlier' } });
    expect(screen.getByText('201')).toBeInTheDocument();
    expect(screen.queryByText('202')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter offers' }), { target: { value: 'inactive' } });
    expect(screen.getByText('202')).toBeInTheDocument();
    expect(screen.queryByText('201')).not.toBeInTheDocument();
  });
});
