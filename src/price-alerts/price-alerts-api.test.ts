import { describe, expect, it, vi } from 'vitest';
import { getPriceAlerts, PriceAlertsApiError } from './price-alerts-api';
import type { AdminRequest } from '../bannedItemsApi';

const validAlert = { id: 1, productName: 'Camera X', productSlug: 'camera-x', targetPrice: 1200000, isActive: true, createdAtUtc: '2026-11-18T09:00:00Z' };

describe('getPriceAlerts', () => {
  it('requests the requested page and maps the API page metadata and fields', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ items: [validAlert], pageNumber: 2, pageSize: 10, totalItems: 11 }));
    const controller = new AbortController();
    await expect(getPriceAlerts(requestAdmin, 2, 10, controller.signal)).resolves.toEqual({ items: [validAlert], pageNumber: 2, pageSize: 10, totalItems: 11 });
    expect(requestAdmin).toHaveBeenCalledWith('/admin/price-alerts?page=2&pageSize=10', { signal: controller.signal });
  });

  it('omits an absent optional product slug and rejects malformed rows or paging metadata', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ items: [{ ...validAlert, productSlug: undefined }], pageNumber: 1, pageSize: 25, totalItems: 1 }));
    await expect(getPriceAlerts(request, 1, 25)).resolves.toMatchObject({ items: [{ productSlug: null }] });
    const badRow = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ items: [{ ...validAlert, isActive: 'yes' }], pageNumber: 1, pageSize: 25, totalItems: 1 }));
    await expect(getPriceAlerts(badRow, 1, 25)).rejects.toBeInstanceOf(PriceAlertsApiError);
    const badPage = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ items: [], pageNumber: 0, pageSize: 25, totalItems: 0 }));
    await expect(getPriceAlerts(badPage, 1, 25)).rejects.toThrow('response was invalid');
  });

  it('returns a useful error for permission and server failures', async () => {
    const forbidden = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(getPriceAlerts(forbidden, 1, 25)).rejects.toMatchObject<Partial<PriceAlertsApiError>>({ status: 403, message: 'You do not have permission to view price alerts.' });
    const failed = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(getPriceAlerts(failed, 1, 25)).rejects.toThrow('status 503');
  });

  it('rejects an invalid JSON response', async () => {
    const invalid = vi.fn<AdminRequest>().mockResolvedValue(new Response('not json', { status: 200 }));
    await expect(getPriceAlerts(invalid, 1, 25)).rejects.toThrow('response was invalid');
  });
});
