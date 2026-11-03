import { describe, expect, it, vi } from 'vitest';
import { getAdminOffers, OffersApiError, type AdminOffer } from './offers-api';

const offer: AdminOffer = {
  id: 7, productId: 42, partnerShopId: 9, priceVnd: 120000, url: null,
  isActive: true, isOutlier: false, updatedAtUtc: '2026-11-03T06:00:00Z',
};

describe('getAdminOffers', () => {
  it('requests the unpaged offers endpoint and returns its array contract', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(Response.json([offer]));

    await expect(getAdminOffers(requestAdmin)).resolves.toEqual([offer]);
    expect(requestAdmin).toHaveBeenCalledWith('/admin/offers', { signal: undefined });
  });

  it.each([401, 403, 500])('rejects status %i rather than returning fallback data', async status => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response('', { status }));

    await expect(getAdminOffers(requestAdmin)).rejects.toMatchObject({
      name: 'OffersApiError', status,
    } satisfies Partial<OffersApiError>);
  });
});
