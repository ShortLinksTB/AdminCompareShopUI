import { describe, expect, it, vi } from 'vitest';
import { getDashboardPartnerShopTotal, getDashboardSyncSuccessRate } from './dashboard-api';

describe('dashboard API adapter', () => {
  it('reads the shop total from the minimal page and forwards cancellation', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ items: [], pageNumber: 1, pageSize: 1, totalItems: 0 }));
    const controller = new AbortController();

    await expect(getDashboardPartnerShopTotal(request, controller.signal)).resolves.toBe(0);
    expect(request).toHaveBeenCalledWith('/admin/shops?page=1&pageSize=1', { signal: controller.signal });
  });

  it('counts terminal sync jobs, excluding queued and running statuses', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ items: [], page: 1, pageSize: 1, totalItems: 3 }))
      .mockResolvedValueOnce(Response.json({ items: [], page: 1, pageSize: 1, totalItems: 4 }));

    await expect(getDashboardSyncSuccessRate(request, new AbortController().signal)).resolves.toBe(0.75);
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/admin/sync-jobs?page=1&pageSize=1&status=Success',
      '/admin/sync-jobs?page=1&pageSize=1&status=Success%2CPartial%2CFailed',
    ]);
  });

  it('returns null when there are no terminal jobs', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ totalItems: 0 }))
      .mockResolvedValueOnce(Response.json({ totalItems: 0 }));
    await expect(getDashboardSyncSuccessRate(request, new AbortController().signal)).resolves.toBeNull();
  });

  it('rejects permission errors and malformed counts instead of reporting zero', async () => {
    const denied = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(getDashboardSyncSuccessRate(denied, new AbortController().signal)).rejects.toThrow('permission');

    const invalid = vi.fn().mockResolvedValue(Response.json({ totalItems: '0' }));
    await expect(getDashboardPartnerShopTotal(invalid, new AbortController().signal)).rejects.toThrow('invalid');
  });
});
