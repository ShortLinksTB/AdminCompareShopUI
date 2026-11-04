import { describe, expect, it, vi } from 'vitest';
import { getAuditLogs } from './audit-logs-api';

describe('getAuditLogs', () => {
  it('requests the selected 1-based page and page size through the authenticated boundary', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], pageNumber: 2, pageSize: 50, totalItems: 51 }), { status: 200 }));
    await expect(getAuditLogs(request, 2, 50)).resolves.toMatchObject({ pageNumber: 2, totalItems: 51 });
    expect(request).toHaveBeenCalledWith('/admin/audit-logs?page=2&pageSize=50', { signal: undefined });
  });

  it('surfaces forbidden and retryable HTTP failures', async () => {
    await expect(getAuditLogs(vi.fn().mockResolvedValue(new Response('', { status: 403 })), 1, 50)).rejects.toThrow('permission to view audit logs');
    await expect(getAuditLogs(vi.fn().mockResolvedValue(new Response('', { status: 500 })), 1, 50)).rejects.toThrow('request failed with status 500');
  });
});
