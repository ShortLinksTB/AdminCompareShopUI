import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type Keycloak from 'keycloak-js';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthContext, AuthProvider, CallbackPage, ForbiddenPage, LoginPage, PermissionFailure, useAuth, type AuthContextValue } from './auth';

const keycloakMocks = vi.hoisted(() => ({
  init: vi.fn(), login: vi.fn(), logout: vi.fn(), updateToken: vi.fn(), clearToken: vi.fn(),
}));

vi.mock('keycloak-js', () => ({
  default: class MockKeycloak {
    token = 'mock-access-token';
    tokenParsed = { name: 'Test Admin', preferred_username: 'test-admin' };
    init = keycloakMocks.init;
    login = keycloakMocks.login;
    logout = keycloakMocks.logout;
    updateToken = keycloakMocks.updateToken;
    clearToken = keycloakMocks.clearToken;
  },
}));

const ok = (body: unknown = { permissions: ['products.read'] }) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

function StateProbe() {
  const auth = useAuth();
  return <div>
    <output data-testid="state">{auth.status}:{auth.permissionState}:{auth.permissions.join(',')}</output>
    <button onClick={auth.retryPermissions}>Retry permissions</button>
    <button onClick={() => void auth.logout()}>Logout</button>
    <button onClick={() => void auth.requestAdmin('/admin/products')}>Request admin</button>
  </div>;
}

function CurrentPath() { return <output data-testid="path">{useLocation().pathname}</output>; }
function renderWithAuth(children: React.ReactNode, initialEntry = '/') {
  return render(<MemoryRouter initialEntries={[initialEntry]}><AuthProvider>{children}</AuthProvider></MemoryRouter>);
}

function renderCallbackFlow(callbackParams: string) {
  window.history.replaceState(window.history.state, '', `/auth/callback${callbackParams}`);
  keycloakMocks.init.mockImplementation(async () => {
    // Keycloak removes OAuth callback parameters from the browser URL during init.
    window.history.replaceState(window.history.state, '', '/auth/callback');
    return false;
  });
  return render(<MemoryRouter initialEntries={['/auth/callback']}><AuthProvider><Routes>
    <Route path="/auth/callback" element={<><CallbackPage /><CurrentPath /></>} />
    <Route path="/login" element={<><LoginPage /><CurrentPath /></>} />
  </Routes></AuthProvider></MemoryRouter>);
}

function contextValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: 'authenticated', permissionState: 'ready', permissions: [], callbackError: null, postLogout: false,
    userName: 'Test Admin', error: null, keycloak: {} as Keycloak,
    retryPermissions: vi.fn(), login: vi.fn().mockResolvedValue(undefined), logout: vi.fn().mockResolvedValue(undefined),
    clearSession: vi.fn(), requestAdmin: vi.fn().mockResolvedValue(ok()), ...overrides,
  };
}

beforeEach(() => {
  keycloakMocks.init.mockReset().mockResolvedValue(true);
  keycloakMocks.login.mockReset().mockResolvedValue(undefined);
  keycloakMocks.logout.mockReset().mockResolvedValue(undefined);
  keycloakMocks.updateToken.mockReset().mockResolvedValue(undefined);
  keycloakMocks.clearToken.mockReset();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok()));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe('OIDC auth flow', () => {
  it('consumes the post-logout marker and does not auto-login, while allowing explicit sign-in', async () => {
    window.sessionStorage.setItem('compareshop-post-logout', '1');
    keycloakMocks.init.mockResolvedValue(false);
    renderWithAuth(<LoginPage />, '/login');

    expect(await screen.findByText('Bạn đã đăng xuất')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(window.sessionStorage.getItem('compareshop-post-logout')).toBeNull();
    expect(keycloakMocks.login).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập lại' }));
    await waitFor(() => expect(keycloakMocks.login).toHaveBeenCalledOnce());
  });

  it('automatically starts PKCE login and stores only the safe return path', async () => {
    keycloakMocks.init.mockResolvedValue(false);
    renderWithAuth(<LoginPage />, '/login?returnTo=%2Foffers%3Fsort%3Dprice');

    await waitFor(() => expect(keycloakMocks.login).toHaveBeenCalledOnce());
    expect(keycloakMocks.init).toHaveBeenCalledWith(expect.objectContaining({ pkceMethod: 'S256', onLoad: 'check-sso' }));
    expect(keycloakMocks.login).toHaveBeenCalledWith(expect.objectContaining({ redirectUri: `${window.location.origin}/auth/callback?returnTo=%2Foffers%3Fsort%3Dprice` }));
    expect(window.sessionStorage.getItem('compareshop-auth-return-to')).toBe('/offers?sort=price');
  });

  it('loads caller permissions with the protected provider and keeps the permission snapshot in memory', async () => {
    renderWithAuth(<StateProbe />);

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated:ready:products.read'));
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/admin/me/permissions' }), expect.objectContaining({ credentials: 'omit' }));
    expect(new Headers((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers).get('Authorization')).toBe('Bearer mock-access-token');
  });

  it('fails closed on permission load errors and supports retry', async () => {
    vi.mocked(fetch).mockReset().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(ok({ permissions: ['catalog.read'] }));
    renderWithAuth(<StateProbe />);

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated:error:'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry permissions' }));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated:ready:catalog.read'));
  });

  it('shows the auth initialization error state when Keycloak initialization fails', async () => {
    keycloakMocks.init.mockRejectedValue(new Error('provider unavailable'));
    renderWithAuth(<StateProbe />);
    expect(await screen.findByTestId('state')).toHaveTextContent('error:loading:');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('restores only a safe callback destination', async () => {
    window.sessionStorage.setItem('compareshop-auth-return-to', '/products/42?tab=history');
    renderWithAuth(<><CallbackPage /><CurrentPath /></>, '/auth/callback');
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/products/42'));
    expect(window.sessionStorage.getItem('compareshop-auth-return-to')).toBeNull();
  });

  it('restores the same-origin return path carried through the OIDC callback', async () => {
    window.sessionStorage.clear();
    renderWithAuth(<><CallbackPage /><CurrentPath /></>, '/auth/callback?returnTo=%2Fproducts');

    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/products'));
    expect(window.sessionStorage.getItem('compareshop-auth-return-to')).toBeNull();
    expect(window.localStorage.length).toBe(0);
    const sessionKeys = [...Array(window.sessionStorage.length)].map((_, index) => window.sessionStorage.key(index) || '');
    expect(sessionKeys.some(key => /token|identity/i.test(key))).toBe(false);
  });

  it.each(['//evil.example/admin', 'https://evil.example/admin'])('falls back safely for an unsafe callback URL target: %s', async returnTo => {
    window.sessionStorage.clear();
    renderWithAuth(<><CallbackPage /><CurrentPath /></>, `/auth/callback?returnTo=${encodeURIComponent(returnTo)}`);

    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/'));
    expect(screen.getByTestId('path').textContent).not.toContain('evil.example');
  });

  it('falls back to root for an unsafe callback destination', async () => {
    window.sessionStorage.setItem('compareshop-auth-return-to', '//evil.example');
    renderWithAuth(<><CallbackPage /><CurrentPath /></>, '/auth/callback');
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/'));
  });

  it('silently returns to login after a check-sso login_required response', async () => {
    renderCallbackFlow('#error=login_required&state=check-sso-state');

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/login'));
    await waitFor(() => expect(keycloakMocks.login).toHaveBeenCalledOnce());
    expect(screen.queryByText('Không thể hoàn tất đăng nhập')).toBeNull();
  });

  it('returns to login for another soft SSO error received in the query', async () => {
    renderCallbackFlow('?error=interaction_required&state=check-sso-state');

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/login'));
    await waitFor(() => expect(keycloakMocks.login).toHaveBeenCalledOnce());
    expect(screen.queryByText('Không thể hoàn tất đăng nhập')).toBeNull();
  });

  it('keeps the callback error screen for explicit access_denied errors', async () => {
    renderCallbackFlow('#error=access_denied&state=explicit-login-state');

    expect(await screen.findByText('Không thể hoàn tất đăng nhập')).toBeTruthy();
    expect(screen.getByTestId('path')).toHaveTextContent('/auth/callback');
    expect(keycloakMocks.login).not.toHaveBeenCalled();
  });

  it('marks a logout return once and uses the safe post-logout URI', async () => {
    renderWithAuth(<StateProbe />);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated:ready'));
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => expect(keycloakMocks.logout).toHaveBeenCalledWith({ redirectUri: `${window.location.origin}/login` }));
    expect(window.sessionStorage.getItem('compareshop-post-logout')).toBe('1');
    expect(screen.getByTestId('state')).toHaveTextContent('logging-out:loading:');
  });

  it('clears the one-time marker and reports logout startup failure', async () => {
    keycloakMocks.logout.mockRejectedValue(new Error('end-session unavailable'));
    renderWithAuth(<StateProbe />);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated:ready'));
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('error:loading:'));
    expect(window.sessionStorage.getItem('compareshop-post-logout')).toBeNull();
  });

  it('renders Forbidden without ending the session on a 403', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 403 }));
    render(<MemoryRouter initialEntries={['/products']}><AuthProvider><Routes><Route path="/forbidden" element={<ForbiddenPage />} /><Route path="*" element={<StateProbe />} /></Routes></AuthProvider></MemoryRouter>);
    await screen.findByTestId('state');
    fireEvent.click(screen.getByRole('button', { name: 'Request admin' }));
    await screen.findByText('Bạn không có quyền truy cập');
    expect(keycloakMocks.clearToken).not.toHaveBeenCalled();
    expect(keycloakMocks.logout).not.toHaveBeenCalled();
  });

  it('renders retry for permission failures and clears permission data when retried', () => {
    const auth = contextValue({ permissionState: 'error', permissions: ['catalog.read'] });
    render(<AuthContext.Provider value={auth}><PermissionFailure /></AuthContext.Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(auth.retryPermissions).toHaveBeenCalledOnce();
  });

  it('clears auth context on 401 and surfaces the refresh retry path', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 401 }));
    renderWithAuth(<StateProbe />);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('anonymous:error:'));
    expect(keycloakMocks.clearToken).toHaveBeenCalledOnce();
  });

  it('clears session state after a protected request remains unauthorized after refresh', async () => {
    renderWithAuth(<StateProbe />);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated:ready'));
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 401 }));
    fireEvent.click(screen.getByRole('button', { name: 'Request admin' }));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('anonymous:loading:'));
    expect(keycloakMocks.clearToken).toHaveBeenCalledOnce();
  });
});
