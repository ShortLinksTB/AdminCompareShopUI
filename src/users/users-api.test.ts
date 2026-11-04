import { describe, expect, it, vi } from 'vitest';
import { getAdminUsers, updateAdminUserRoles } from './users-api';

describe('users API', () => {
  it('fetches a one-based page', async () => {
    const page = { items: [], pageNumber: 2, pageSize: 20, totalItems: 21 };
    const requestAdmin = vi.fn().mockResolvedValue(Response.json(page));
    await expect(getAdminUsers(requestAdmin, 2, 20)).resolves.toEqual(page);
    expect(requestAdmin).toHaveBeenCalledWith('/admin/users?page=2&pageSize=20', { signal: undefined }, false);
  });

  it.each([403, 500])('reports GET failure %i', async status => {
    await expect(getAdminUsers(vi.fn().mockResolvedValue(new Response('', { status })), 1, 20))
      .rejects.toMatchObject({ status });
  });

  it('sends roleIds and returns the roles confirmed by the API', async () => {
    const roles = [{ id: 2, name: 'Operator' }];
    const requestAdmin = vi.fn().mockResolvedValue(Response.json({ roles }));
    await expect(updateAdminUserRoles(requestAdmin, 42, [2])).resolves.toEqual(roles);
    expect(requestAdmin).toHaveBeenCalledWith('/admin/users/42/role-assignments', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roleIds: [2] }),
    });
  });

  it('surfaces mutation authorization and server failures', async () => {
    for (const status of [403, 500]) {
      await expect(updateAdminUserRoles(vi.fn().mockResolvedValue(new Response('', { status })), 42, []))
        .rejects.toMatchObject({ status });
    }
  });
});
