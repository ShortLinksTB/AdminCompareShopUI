import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { App } from './App';

const keycloakMocks = vi.hoisted(() => ({ init: vi.fn(), login: vi.fn(), logout: vi.fn(), updateToken: vi.fn(), clearToken: vi.fn() }));

vi.mock('keycloak-js', () => ({
  default: class MockKeycloak {
    token = 'test-token-in-memory';
    tokenParsed = { name: 'Test Admin' };
    init = keycloakMocks.init;
    login = keycloakMocks.login;
    logout = keycloakMocks.logout;
    updateToken = keycloakMocks.updateToken;
    clearToken = keycloakMocks.clearToken;
  },
}));

function RouteProbe() {
  const location = useLocation();
  return <output data-testid="current-route">{location.pathname}{location.search}{location.hash}</output>;
}

function renderBrowserApp() {
  return render(<StrictMode><BrowserRouter><App /><RouteProbe /></BrowserRouter></StrictMode>);
}

function setBrowserPath(path: string) {
  window.history.replaceState({}, '', path);
}

beforeEach(() => {
  setBrowserPath('/login?returnTo=%2Fproducts');
  keycloakMocks.init.mockReset().mockImplementation(async () => window.location.pathname === '/auth/callback');
  keycloakMocks.login.mockReset().mockImplementation(async () => {
    // A top-level identity-provider round trip may lose tab state and cookies.
    window.sessionStorage.clear();
    document.cookie = 'compareshop-auth-return-to=; Path=/; Max-Age=0; SameSite=Lax';
  });
  keycloakMocks.logout.mockReset().mockResolvedValue(undefined);
  keycloakMocks.updateToken.mockReset().mockResolvedValue(undefined);
  keycloakMocks.clearToken.mockReset();
  window.sessionStorage.clear();
  window.localStorage.clear();
  document.cookie = 'compareshop-auth-return-to=; Path=/; Max-Age=0; SameSite=Lax';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ permissions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.localStorage.clear();
  document.cookie = 'compareshop-auth-return-to=; Path=/; Max-Age=0; SameSite=Lax';
  setBrowserPath('/');
});

describe('application OIDC browser return flow', () => {
  it('preserves returnTo across the initial silent SSO login_required callback and interactive login', async () => {
    let finishSilentSso!: (authenticated: boolean) => void;
    keycloakMocks.init.mockReset().mockImplementationOnce(() => new Promise(resolve => { finishSilentSso = resolve; }));

    const initialLogin = renderBrowserApp();
    await waitFor(() => expect(keycloakMocks.init).toHaveBeenCalledWith(expect.objectContaining({ onLoad: 'check-sso', redirectUri: `${window.location.origin}/auth/callback` })));
    const savedPath = JSON.parse(window.localStorage.getItem('compareshop-auth-return-to-fallback') || '{}') as { path?: string; expiresAt?: number };
    expect(savedPath.path).toBe('/products');
    expect(Object.keys(savedPath).sort()).toEqual(['expiresAt', 'path']);
    expect(JSON.stringify(savedPath)).not.toMatch(/token|identity/i);

    // Keycloak's initial check-sso can return to the same callback route with login_required before interactive login starts.
    initialLogin.unmount();
    await act(async () => { finishSilentSso(false); });
    await act(async () => { await Promise.resolve(); });
    keycloakMocks.init.mockImplementation(async () => window.location.pathname === '/auth/callback' && !new URLSearchParams(window.location.search).has('error'));

    setBrowserPath('/auth/callback?error=login_required&state=silent-state');
    const silentCallback = renderBrowserApp();
    await waitFor(() => expect(keycloakMocks.login).toHaveBeenCalledWith(expect.objectContaining({ redirectUri: `${window.location.origin}/auth/callback` })));
    expect(screen.getByTestId('current-route')).toHaveTextContent('/login?returnTo=%2Fproducts');
    expect(window.localStorage.getItem('compareshop-auth-return-to-fallback')).toContain('/products');

    // The following full-page Keycloak return starts a fresh app at the successful callback route.
    silentCallback.unmount();
    window.sessionStorage.clear();
    document.cookie = 'compareshop-auth-return-to=; Path=/; Max-Age=0; SameSite=Lax';
    setBrowserPath('/auth/callback?code=authorization-code&state=interactive-state');
    renderBrowserApp();

    expect(await screen.findByRole('heading', { name: 'Products' })).toBeInTheDocument();
    expect(screen.getByTestId('current-route')).toHaveTextContent('/products');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain('compareshop-auth-return-to=');
    expect(keycloakMocks.clearToken).not.toHaveBeenCalled();
  });

  it('restores /products through the real LoginRoute and callback route after tab state and cookies are lost', async () => {
    const loginPage = renderBrowserApp();
    await waitFor(() => expect(keycloakMocks.login).toHaveBeenCalledWith(expect.objectContaining({ redirectUri: `${window.location.origin}/auth/callback` })));
    expect(window.localStorage.getItem('compareshop-auth-return-to-fallback')).toContain('/products');

    // Model the full document navigation Keycloak performs: the app mounts again at its callback URL.
    loginPage.unmount();
    window.sessionStorage.clear();
    setBrowserPath('/auth/callback');
    renderBrowserApp();

    expect(await screen.findByRole('heading', { name: 'Products' })).toBeInTheDocument();
    expect(screen.getByTestId('current-route')).toHaveTextContent('/products');
    expect(window.sessionStorage.length).toBe(0);
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).not.toContain('compareshop-auth-return-to=');
    expect(keycloakMocks.clearToken).not.toHaveBeenCalled();
  });

  it('keeps a protocol-relative return target on the application origin after login', async () => {
    setBrowserPath('/login?returnTo=%2F%2Fevil.example%2Fadmin');
    const loginPage = renderBrowserApp();
    await waitFor(() => expect(keycloakMocks.login).toHaveBeenCalled());
    loginPage.unmount();
    setBrowserPath('/auth/callback?code=authorization-code&state=keycloak-state');
    renderBrowserApp();

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByTestId('current-route')).toHaveTextContent('/');
    expect(screen.queryByText(/evil\.example/)).not.toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).not.toContain('compareshop-auth-return-to=');
  });
});
