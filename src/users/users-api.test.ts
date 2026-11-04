import { describe, expect, it, vi } from 'vitest';
import { getAdminUsers, replaceUserRoles, UsersApiError } from './users-api';

describe('users API', () => {
  it('loads the one-based page from the admin endpoint', async () => {
    const page = { items: [{ id: 3, createdAtUtc: '2026-10-18T00:00:00Z', roles: ['Super Admin'] }], pageNumber: 2, pageSize: 20, totalItems: 21 };
    const request = vi.fn().mockResolvedValue(Response.json(page));
    await expect(getAdminUsers(request, 2, 20)).resolves.toEqual(page);
    expect(request).toHaveBeenCalledWith('/admin/users?page=2&pageSize=20', { signal: undefined }, { redirectOnForbidden: false });
  });

  it.each([403, 500])('reports list status %i', async status => {
    const request = vi.fn().mockResolvedValue(new Response('', { status }));
    await expect(getAdminUsers(request, 1, 20)).rejects.toMatchObject({ name: 'UsersApiError', status } satisfies Partial<UsersApiError>);
  });

  it('sends role IDs as JSON and returns roles only after success', async () => {
    const request = vi.fn().mockResolvedValue(Response.json(['Editor', 'Viewer']));
    await expect(replaceUserRoles(request, 7, [3, 4])).resolves.toEqual(['Editor', 'Viewer']);
    expect(request).toHaveBeenCalledWith('/admin/users/7/role-assignments', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roleIds: [3, 4] }),
    });
  });

  it('surfaces rejected role updates, including 403', async () => {
    const request = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
    await expect(replaceUserRoles(request, 7, [1])).rejects.toMatchObject({ name: 'UsersApiError', status: 403 });
  });
});
