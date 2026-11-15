import { describe, expect, it, vi } from 'vitest';
import { getDataSources, runDataSourceSync, updateDataSource, type DataSource } from './data-sources-api';
import type { AdminRequest } from '../bannedItemsApi';

const source: DataSource = {
  id: '42', key: 'bhx', displayName: 'Bách Hóa Xanh', categoryPath: '/bia', partnerShopId: 1028,
  partnerShopDisplayName: 'Bách Hóa Xanh', state: 'Active', intervalHours: 72,
  createdAtUtc: '2026-01-01T00:00:00Z', lastCompletedAtUtc: null, nextAttemptAtUtc: null,
};

describe('data sources API', () => {
  it('normalizes numeric enum state and IDs, including nullable partner and timestamps', async () => {
    const request: AdminRequest = vi.fn().mockResolvedValue(Response.json([{ ...source, id: 42, state: 2, partnerShopId: null, partnerShopDisplayName: null }]));
    await expect(getDataSources(request)).resolves.toMatchObject([{ id: '42', state: 'Error', partnerShopId: null, partnerShopDisplayName: null }]);
    expect(request).toHaveBeenCalledWith('/admin/data-sources', { signal: undefined });
  });

  it('rejects malformed data and reports permission errors with their status', async () => {
    const malformed: AdminRequest = vi.fn().mockResolvedValue(Response.json([{ ...source, state: 8 }]));
    await expect(getDataSources(malformed)).rejects.toMatchObject({ status: 200, message: expect.stringContaining('response was invalid') });
    const forbidden: AdminRequest = vi.fn().mockResolvedValue(Response.json({}, { status: 403 }));
    await expect(getDataSources(forbidden)).rejects.toMatchObject({ status: 403, message: 'You do not have permission to view data sources.' });
  });

  it('sends the complete mutable configuration and returns normalized data', async () => {
    const request: AdminRequest = vi.fn().mockResolvedValue(Response.json({ ...source, state: 1, intervalHours: 24 }));
    await expect(updateDataSource(request, source, { state: 'Paused', intervalHours: 24, partnerShopId: null })).resolves.toMatchObject({ state: 'Paused', intervalHours: 24 });
    expect(request).toHaveBeenCalledWith('/admin/data-sources/42', expect.objectContaining({
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'Paused', intervalHours: 24, partnerShopId: null }),
    }));
  });

  it('surfaces server validation and conflict details and only accepts a 202 sync response', async () => {
    const patch: AdminRequest = vi.fn().mockResolvedValue(Response.json({ detail: 'IntervalHours must be between 1 and 720.' }, { status: 400 }));
    await expect(updateDataSource(patch, source, { state: 'Active', intervalHours: 0, partnerShopId: null })).rejects.toMatchObject({ status: 400, message: 'IntervalHours must be between 1 and 720.' });
    const conflict: AdminRequest = vi.fn().mockResolvedValue(Response.json({ detail: 'A job is already active.' }, { status: 409 }));
    await expect(runDataSourceSync(conflict, '42')).rejects.toMatchObject({ status: 409, message: 'A job is already active.' });
    const accepted: AdminRequest = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    await expect(runDataSourceSync(accepted, '42')).resolves.toBeUndefined();
    expect(accepted).toHaveBeenCalledWith('/admin/data-sources/42/sync', { method: 'POST' });
  });
});
