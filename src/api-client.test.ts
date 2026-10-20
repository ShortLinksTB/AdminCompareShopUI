import { afterEach, describe, expect, it, vi } from 'vitest';
import type Keycloak from 'keycloak-js';
import { adminRequest } from './api-client';

function fakeKeycloak(updateToken = vi.fn().mockResolvedValue(undefined)): Keycloak {
  return { updateToken, token: 'access-token' } as unknown as Keycloak;
}

function response(status: number) {
  return new Response('', { status });
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('adminRequest', () => {
  it('sends bearer auth without cookies to the admin API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    vi.stubGlobal('fetch', fetchMock);
    const keycloak = fakeKeycloak();

    const result = await adminRequest(keycloak, '/admin/products');

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/admin/products' }), expect.objectContaining({ credentials: 'omit' }));
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer access-token');
    expect(keycloak.updateToken).toHaveBeenCalledWith(30);
  });

  it('forces refresh and retries safe GET requests once after 401', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200));
    vi.stubGlobal('fetch', fetchMock);
    const updateToken = vi.fn().mockResolvedValue(undefined);

    const result = await adminRequest(fakeKeycloak(updateToken), '/admin/me/permissions');

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(updateToken.mock.calls).toEqual([[30], [-1]]);
  });

  it('does not retry mutations after 401 and clears the session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(401));
    vi.stubGlobal('fetch', fetchMock);
    const onUnauthorized = vi.fn();

    await adminRequest(fakeKeycloak(), '/admin/products', { method: 'POST', body: '{}' }, onUnauthorized);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('keeps the session and routes 403 responses to Forbidden', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(403)));
    const onUnauthorized = vi.fn();
    const onForbidden = vi.fn();

    await adminRequest(fakeKeycloak(), '/admin/products', {}, onUnauthorized, onForbidden);

    expect(onForbidden).toHaveBeenCalledOnce();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('clears the session when token refresh fails', async () => {
    const onUnauthorized = vi.fn();
    await expect(adminRequest(fakeKeycloak(vi.fn().mockRejectedValue(new Error('refresh failed'))), '/admin/me/permissions', {}, onUnauthorized)).rejects.toThrow('refresh failed');
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('clears the session when the forced refresh after a safe 401 fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401)));
    const onUnauthorized = vi.fn();
    const updateToken = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('refresh revoked'));

    await expect(adminRequest(fakeKeycloak(updateToken), '/admin/me/permissions', {}, onUnauthorized)).rejects.toThrow('refresh revoked');
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(updateToken.mock.calls).toEqual([[30], [-1]]);
  });

  it('does not clear the session on a network failure', async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(adminRequest(fakeKeycloak(), '/admin/me/permissions', {}, onUnauthorized)).rejects.toThrow('network down');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('omits an absent token and accepts a forbidden response without a callback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(403));
    vi.stubGlobal('fetch', fetchMock);
    const keycloak = { updateToken: vi.fn().mockResolvedValue(undefined) } as unknown as Keycloak;

    await expect(adminRequest(keycloak, '/admin/restricted')).resolves.toMatchObject({ status: 403 });
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(options.headers).has('Authorization')).toBe(false);
  });

  it.each(['https://evil.example/admin/steal', '/public'])('rejects non-admin or cross-origin paths (%s)', async path => {
    await expect(adminRequest(fakeKeycloak(), path, {}, vi.fn())).rejects.toThrow();
  });
});
