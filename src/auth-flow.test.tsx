import { StrictMode, useLayoutEffect, useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
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

function BrowserRoundTrip({ returnTo = '/products' }: { returnTo?: string }) {
  const [returnedFromKeycloak, setReturnedFromKeycloak] = useState(false);
  useLayoutEffect(() => {
    const onRedirect = () => setReturnedFromKeycloak(true);
    window.addEventListener('mock-keycloak-redirect', onRedirect);
    return () => window.removeEventListener('mock-keycloak-redirect', onRedirect);
  }, []);

  const entry = returnedFromKeycloak ? '/auth/callback' : `/login?returnTo=${encodeURIComponent(returnTo)}`;
  return <MemoryRouter key={entry} initialEntries={[entry]}><App /><RouteProbe /></MemoryRouter>;
}

beforeEach(() => {
  keycloakMocks.init.mockReset().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  keycloakMocks.login.mockReset().mockImplementation(async () => {
    // Model a browser return where tab session state and cookies are unavailable.
    window.sessionStorage.clear();
    document.cookie = 'compareshop-auth-return-to=; Path=/; Max-Age=0; SameSite=Lax';
    window.setTimeout(() => window.dispatchEvent(new Event('mock-keycloak-redirect')), 25);
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
});

describe('application OIDC browser return flow', () => {
  it('restores the safe route after login when the browser drops tab storage and blocks cookies', async () => {
    render(<StrictMode><BrowserRoundTrip /></StrictMode>);

    await waitFor(() => expect(keycloakMocks.init).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { name: 'Products' })).toBeInTheDocument();
    expect(screen.getByTestId('current-route')).toHaveTextContent('/products');
    expect(keycloakMocks.login).toHaveBeenCalledWith(expect.objectContaining({ redirectUri: `${window.location.origin}/auth/callback` }));
    expect(window.sessionStorage.length).toBe(0);
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).not.toContain('compareshop-auth-return-to=');
    expect(keycloakMocks.clearToken).not.toHaveBeenCalled();
  });

  it('keeps a protocol-relative return target on the application origin after login', async () => {
    render(<BrowserRoundTrip returnTo="//evil.example/admin" />);

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByTestId('current-route')).toHaveTextContent('/');
    expect(screen.queryByText(/evil\.example/)).not.toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).not.toContain('compareshop-auth-return-to=');
  });
});
