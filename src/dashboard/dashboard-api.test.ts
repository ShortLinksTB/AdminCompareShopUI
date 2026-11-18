import { describe, expect, it, vi } from 'vitest';
import { getDashboardPartnerShopTotal } from './dashboard-api';

describe('dashboard API adapter', () => {
  it('reads the shop total from the minimal page and forwards cancellation', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ items: [], pageNumber: 1, pageSize: 1, totalItems: 0 }));
    const controller = new AbortController();

    await expect(getDashboardPartnerShopTotal(request, controller.signal)).resolves.toBe(0);
    expect(request).toHaveBeenCalledWith('/admin/shops?page=1&pageSize=1', { signal: controller.signal });
  });

  it('rejects malformed shop totals instead of reporting zero', async () => {
    const invalid = vi.fn().mockResolvedValue(Response.json({ totalItems: '0' }));
    await expect(getDashboardPartnerShopTotal(invalid, new AbortController().signal)).rejects.toThrow('invalid');
  });
});
