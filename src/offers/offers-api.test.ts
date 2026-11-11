import { describe, expect, it, vi } from 'vitest';
import { getAdminOffers, getOfferPriceHistory, OffersApiError, updateAdminOffer, type AdminOffer, type AdminOffersPage } from './offers-api';

const offer: AdminOffer = {
  id: 7, productId: 42, partnerShopId: 9, priceVnd: 120000, url: null,
  isActive: true, isOutlier: false, updatedAtUtc: '2026-11-03T06:00:00Z',
  productName: 'Phone', productImageUrl: null, partnerShopName: 'Shop', externalSku: 'P-42',
  imageUrl: null, originalPriceVnd: null, stockStatus: 'in_stock', lowestPriceVnd: 120000,
  deltaVnd: 0, deltaPercent: 0, outlierReason: null,
};
const page: AdminOffersPage = { items: [offer], page: 2, pageSize: 20, totalItems: 21, counts: { all: 21, outlier: 2, stale: 3, outOfStock: 4, inactive: 5 } };

describe('offers API', () => {
  it('serializes the confirmed query contract and returns the typed page', async () => {
    const request = vi.fn().mockResolvedValue(Response.json(page));
    await expect(getAdminOffers(request, { page: 2, pageSize: 20, q: 'phone', shopId: 9, filter: 'stale', sort: 'oldest', staleHours: 72 })).resolves.toEqual(page);
    expect(request).toHaveBeenCalledWith('/admin/offers?page=2&pageSize=20&q=phone&shopId=9&filter=stale&sort=oldest&staleHours=72', { signal: undefined });
  });

  it('omits optional query parameters and forwards cancellation', async () => {
    const request = vi.fn().mockResolvedValue(Response.json(page));
    const controller = new AbortController();
    await getAdminOffers(request, { page: 1, shopId: null, q: '' }, controller.signal);
    expect(request).toHaveBeenCalledWith('/admin/offers?page=1', { signal: controller.signal });
  });

  it.each([401, 403, 500])('rejects failed list request %i', async status => {
    const request = vi.fn().mockResolvedValue(new Response('', { status }));
    await expect(getAdminOffers(request)).rejects.toMatchObject({ name: 'OffersApiError', status } satisfies Partial<OffersApiError>);
  });

  it('loads real history points for the offer', async () => {
    const points = [{ dateUtc: '2026-11-02T00:00:00Z', priceVnd: 115000 }];
    const request = vi.fn().mockResolvedValue(Response.json(points));
    await expect(getOfferPriceHistory(request, 7)).resolves.toEqual(points);
    expect(request).toHaveBeenCalledWith('/admin/offers/7/price-history?days=30', { signal: undefined });
  });

  it('sends an outlier update with its reason', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(updateAdminOffer(request, 7, { isOutlier: true, outlierReason: 'Price typo' })).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith('/admin/offers/7', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isOutlier: true, outlierReason: 'Price typo' }) }));
  });

  it('reports permission and server errors on mutation', async () => {
    const denied = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
    await expect(updateAdminOffer(denied, 7, { isActive: false })).rejects.toThrow('You do not have permission to update offers.');
    const failed = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    await expect(updateAdminOffer(failed, 7, { isActive: false })).rejects.toThrow('Could not update offer (request failed with status 500).');
  });
});
