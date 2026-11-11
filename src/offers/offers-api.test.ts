import { describe, expect, it, vi } from 'vitest';
import { getAdminOffers, getAdminProductOffers, getOfferPriceHistory, OffersApiError, updateAdminOffer, updateAdminOfferOutlierReason, type AdminOffer } from './offers-api';

const offer: AdminOffer = {
  id: 7, productId: 42, partnerShopId: 9, priceVnd: 120000, url: null, isActive: true, isOutlier: false,
  updatedAtUtc: '2026-11-03T06:00:00Z', productName: 'Laptop', productImageUrl: null, partnerShopName: 'Shop',
  externalSku: 'SKU-7', imageUrl: null, originalPriceVnd: null, stockStatus: 'unknown', lowestPriceVnd: 120000,
  deltaVnd: 0, deltaPercent: 0, outlierReason: null,
  otherOffersAveragePriceVnd: null, outlierDeviationPercent: null,
};
const page = { items: [offer], pageNumber: 1, pageSize: 10, totalItems: 1, counts: { all: 1, outlier: 0, stale: 0, outOfStock: 0, inactive: 0 } };

describe('offers API', () => {
  it('sends the typed page query and parses global counts', async () => {
    const request = vi.fn().mockResolvedValue(Response.json(page));
    await expect(getAdminOffers(request, { page: 2, pageSize: 20, q: 'Laptop', shopId: 9, filter: 'inactive', sort: 'oldest' })).resolves.toEqual(page);
    expect(request).toHaveBeenCalledWith('/admin/offers?page=2&pageSize=20&sort=oldest&staleHours=72&q=Laptop&shopId=9&filter=inactive', { signal: undefined });
  });

  it('does not infer a filter or search query when empty', async () => {
    const request = vi.fn().mockResolvedValue(Response.json(page));
    await getAdminOffers(request, { page: 1, pageSize: 10, q: '  ', shopId: null, filter: 'all', sort: 'attention' });
    expect(request).toHaveBeenCalledWith('/admin/offers?page=1&pageSize=10&sort=attention&staleHours=72', { signal: undefined });
  });

  it('loads only the selected product peers', async () => {
    const request = vi.fn().mockResolvedValue(Response.json(page));
    await expect(getAdminProductOffers(request, 42)).resolves.toEqual([offer]);
    expect(request).toHaveBeenCalledWith('/admin/offers?productId=42&page=1&pageSize=100&sort=priceAsc', { signal: undefined });
  });

  it('requests actual snapshot points for 30 days', async () => {
    const points = [{ dateUtc: '2026-11-01T00:00:00Z', priceVnd: 100 }];
    const request = vi.fn().mockResolvedValue(Response.json(points));
    await expect(getOfferPriceHistory(request, 7)).resolves.toEqual(points);
    expect(request).toHaveBeenCalledWith('/admin/offers/7/price-history?days=30', { signal: undefined });
  });

  it('updates the existing OfferInput contract with all required fields', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await updateAdminOffer(request, 7, { priceVnd: 120000, url: null, isActive: false, isOutlier: true });
    expect(request).toHaveBeenCalledWith('/admin/offers/7', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priceVnd: 120000, url: null, isActive: false, isOutlier: true }) });
  });

  it('saves a nullable outlier reason through its dedicated API route', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await updateAdminOfferOutlierReason(request, 7, 'price mismatch');
    expect(request).toHaveBeenCalledWith('/admin/offers/7/outlier-reason', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outlierReason: 'price mismatch' }) });
  });

  it.each([401, 403, 500])('rejects status %i with a useful message', async status => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'denied' }), { status, headers: { 'Content-Type': 'application/json' } }));
    await expect(getAdminOffers(request, { page: 1, pageSize: 10, q: '', shopId: null, filter: 'all', sort: 'attention' })).rejects.toMatchObject({ name: 'OffersApiError', status } satisfies Partial<OffersApiError>);
  });
});
