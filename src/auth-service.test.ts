import { afterEach, describe, expect, it, vi } from 'vitest';
import type Keycloak from 'keycloak-js';
import { fetchPermissions } from './auth-service';

const client = { token: 'token', updateToken: vi.fn().mockResolvedValue(undefined) } as unknown as Keycloak;
const response = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('fetchPermissions', () => {
  it('returns only the permission keys from the self endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { permissions: ['products.read', 'compliance.manage'] })));
    await expect(fetchPermissions(client, vi.fn(), vi.fn())).resolves.toEqual(['products.read', 'compliance.manage']);
  });

  it('allows an empty permission set', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { permissions: [] })));
    await expect(fetchPermissions(client, vi.fn(), vi.fn())).resolves.toEqual([]);
  });

  it.each([{ permissions: null }, { permissions: ['products.read', 4] }, {}])('rejects malformed permission data (%j)', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, body)));
    await expect(fetchPermissions(client, vi.fn(), vi.fn())).rejects.toThrow('invalid-permissions-response');
  });

  it('fails closed on a repeated 401 after refresh and invokes the unauthorized callback', async () => {
    const unauthorized = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(401)));

    await expect(fetchPermissions(client, unauthorized, vi.fn())).rejects.toThrow('unauthorized');
    expect(unauthorized).toHaveBeenCalledOnce();
  });

  it('fails closed on 403 and invokes the forbidden callback', async () => {
    const forbidden = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(403)));

    await expect(fetchPermissions(client, vi.fn(), forbidden)).rejects.toThrow('permissions-403');
    expect(forbidden).toHaveBeenCalledOnce();
  });

  it('surfaces server failures for the retry state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(503)));
    await expect(fetchPermissions(client, vi.fn(), vi.fn())).rejects.toThrow('permissions-503');
  });
});
