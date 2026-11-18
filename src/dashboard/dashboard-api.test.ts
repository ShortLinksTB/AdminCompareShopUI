import { describe, expect, it, vi } from 'vitest';
import { getDashboardPartnerShopTotal, getDashboardSyncJobTotals } from './dashboard-api';

describe('dashboard-api', () => {
  it('reads the partner shop total using a one-item page and forwards cancellation', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(Response.json({ items: [], pageNumber: 1, pageSize: 1, totalItems: 7 }));
    const controller = new AbortController();

    await expect(getDashboardPartnerShopTotal(requestAdmin, controller.signal)).resolves.toBe(7);
    expect(requestAdmin).toHaveBeenCalledWith('/admin/shops?page=1&pageSize=1', { signal: controller.signal });
  });

  it('counts Success and all terminal states while excluding queued and running jobs', async () => {
    const requestAdmin = vi.fn().mockImplementation((path: string) => {
      const totalItems = path.includes('status=Success%2CPartial%2CFailed') ? 12 : 9;
      return Promise.resolve(Response.json({ items: [], page: 1, pageSize: 1, totalItems }));
    });
    const controller = new AbortController();

    await expect(getDashboardSyncJobTotals(requestAdmin, controller.signal)).resolves.toEqual({ successful: 9, terminal: 12 });
    expect(requestAdmin).toHaveBeenCalledWith('/admin/sync-jobs?page=1&pageSize=1&status=Success', { signal: controller.signal });
    expect(requestAdmin).toHaveBeenCalledWith('/admin/sync-jobs?page=1&pageSize=1&status=Success%2CPartial%2CFailed', { signal: controller.signal });
  });

  it('propagates permission and request errors instead of turning them into zero totals', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));

    await expect(getDashboardPartnerShopTotal(requestAdmin)).rejects.toThrow('You do not have permission to manage partner shops.');
    await expect(getDashboardSyncJobTotals(requestAdmin)).rejects.toThrow('You do not have permission to load Sync Jobs.');
  });
});
