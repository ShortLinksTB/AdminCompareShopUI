import { describe, expect, it, vi } from 'vitest';
import { bulkDeleteAffiliatePlatforms, commitAffiliatePlatformImport, createAffiliatePlatform, getAffiliatePlatforms, previewAffiliatePlatformImport } from './affiliate-platforms-api';
import type { AdminRequest } from '../bannedItemsApi';

describe('affiliate platforms API', () => {
  it('loads the complete collection and preserves the optional abort signal', async () => {
    const rows = [{ id: 8, name: 'Network', homeUrl: null, notes: null }];
    const admin: AdminRequest = vi.fn().mockResolvedValue(Response.json(rows));
    await expect(getAffiliatePlatforms(admin)).resolves.toEqual(rows);
    expect(admin).toHaveBeenCalledWith('/admin/affiliate-platforms', { signal: undefined });
  });

  it('sends the form payload and surfaces API validation errors', async () => {
    const admin: AdminRequest = vi.fn().mockResolvedValue(Response.json({ id: 8, name: 'Network', homeUrl: null, notes: null }));
    await createAffiliatePlatform(admin, { name: 'Network', homeUrl: null, notes: null });
    expect(admin).toHaveBeenCalledWith('/admin/affiliate-platforms', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Network', homeUrl: null, notes: null }) }));
    const denied: AdminRequest = vi.fn().mockResolvedValue(Response.json({ detail: 'Forbidden' }, { status: 403 }));
    await expect(getAffiliatePlatforms(denied)).rejects.toMatchObject({ status: 403, message: 'Forbidden' });
  });

  it('uses the import preview and commit contract and sends selected bulk IDs', async () => {
    const admin: AdminRequest = vi.fn()
      .mockResolvedValueOnce(Response.json({ createCount: 1, updateCount: 2, errors: [] }))
      .mockResolvedValueOnce(Response.json({ createdCount: 1, updatedCount: 2, failedCount: 0, errors: [] }))
      .mockResolvedValueOnce(Response.json([{ id: 8, status: 'deleted' }, { id: 9, status: 'not_found' }]));
    const rows = [{ name: 'Network', homeUrl: null, notes: null }];
    await expect(previewAffiliatePlatformImport(admin, rows)).resolves.toEqual({ created: 1, updated: 2, errors: [] });
    await expect(commitAffiliatePlatformImport(admin, rows)).resolves.toMatchObject({ created: 1, updated: 2, failed: 0 });
    await expect(bulkDeleteAffiliatePlatforms(admin, [8, 9])).resolves.toEqual([{ id: 8, deleted: true, error: undefined }, { id: 9, deleted: false, error: 'not_found' }]);
    expect(admin).toHaveBeenNthCalledWith(1, '/admin/affiliate-platforms/import/preview', expect.objectContaining({ method: 'POST', body: JSON.stringify(rows) }));
    expect(admin).toHaveBeenNthCalledWith(2, '/admin/affiliate-platforms/import/commit', expect.objectContaining({ method: 'POST', body: JSON.stringify(rows) }));
    expect(admin).toHaveBeenNthCalledWith(3, '/admin/affiliate-platforms/bulk-delete', expect.objectContaining({ body: JSON.stringify({ ids: [8, 9] }) }));
  });
});
