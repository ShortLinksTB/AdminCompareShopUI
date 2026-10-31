import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from './App';

const auth = vi.hoisted(() => ({
  status: 'authenticated' as 'authenticated' | 'anonymous' | 'logging-out',
  permissionState: 'ready' as 'ready' | 'loading',
  permissions: [] as string[],
  logout: vi.fn(),
  userName: 'Test Admin',
}));

vi.mock('./auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    status: auth.status, permissionState: auth.permissionState, permissions: auth.permissions,
    userName: auth.userName, logout: auth.logout, requestAdmin: vi.fn(),
  }),
  AuthLoadingScreen: ({ message }: { message?: string }) => <div>{message}</div>,
  CallbackPage: () => null,
  ForbiddenPage: () => null,
  LoginPage: ({ returnTo }: { returnTo?: string }) => <div>Login page: {returnTo}</div>,
  PermissionFailure: () => null,
}));

vi.mock('./BannedItems', () => ({
  BannedItemsRoute: () => {
    const location = useLocation();
    return <div>Banned items page: {location.pathname}</div>;
  },
}));

function renderApp(initialEntry = '/') {
  return render(<MemoryRouter initialEntries={[initialEntry]}><App /></MemoryRouter>);
}

afterEach(() => {
  cleanup();
  auth.permissions = [];
  auth.status = 'authenticated';
  auth.permissionState = 'ready';
  vi.clearAllMocks();
});

describe('mobile application navigation', () => {
  it('restores the requested safe route when the login URL is opened with an authenticated session', () => {
    renderApp('/login?returnTo=%2Fproducts');

    expect(screen.getByRole('heading', { name: 'Products' })).toBeInTheDocument();
  });

  it('keeps protocol-relative login return targets on the app root', () => {
    renderApp('/login?returnTo=%2F%2Fevil.example%2Fadmin');

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByText(/evil\.example/)).not.toBeInTheDocument();
  });

  it('keeps the login page visible while the user is anonymous', () => {
    auth.status = 'anonymous';
    renderApp('/login?returnTo=%2Fproducts');

    expect(screen.getByText('Login page: /products')).toBeInTheDocument();
  });

  it('passes only the safe fallback from LoginRoute into the login action', () => {
    auth.status = 'anonymous';
    renderApp('/login?returnTo=%2F%2Fevil.example%2Fadmin');

    expect(screen.getByText('Login page: /')).toBeInTheDocument();
  });

  it('shows the logout progress screen instead of navigating to a return target', () => {
    auth.status = 'logging-out';
    renderApp('/login?returnTo=%2Fproducts');

    expect(screen.getByText('Đang đăng xuất')).toBeInTheDocument();
  });

  it('opens an accessible drawer with Banned items for compliance readers and returns focus on Escape', () => {
    auth.permissions = ['compliance.read'];
    renderApp();

    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(toggle);

    expect(screen.getByRole('dialog', { name: 'Application navigation' })).toHaveAttribute('aria-modal', 'true');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /Banned items/ })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog', { name: 'Application navigation' })).getByRole('button', { name: 'Close navigation' })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Application navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus();
  });

  it('keeps Banned items out of navigation when the user lacks compliance.read', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(screen.queryByRole('link', { name: /Banned items/ })).not.toBeInTheDocument();
  });

  it('wraps keyboard focus at both ends of the open drawer', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    const close = within(screen.getByRole('dialog', { name: 'Application navigation' })).getByRole('button', { name: 'Close navigation' });
    const logout = screen.getByRole('button', { name: 'Đăng xuất' });
    close.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(logout).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(close).toHaveFocus();
  });

  it('closes from the drawer close control and restores focus to the hamburger', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const dialog = screen.getByRole('dialog', { name: 'Application navigation' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close navigation' }));

    expect(screen.queryByRole('dialog', { name: 'Application navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus();
  });

  it('closes from the backdrop', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss navigation overlay' }));

    expect(screen.queryByRole('dialog', { name: 'Application navigation' })).not.toBeInTheDocument();
  });

  it('closes the drawer after selecting a route', () => {
    auth.permissions = ['compliance.read'];
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('link', { name: /Banned items/ }));

    expect(screen.getByText('Banned items page: /banned-items')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Application navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus();
  });

  it('exposes Light and Dark controls in the mobile header and preserves both theme states', () => {
    renderApp();
    const themeControls = screen.getByRole('group', { name: 'Color theme' });
    const light = within(themeControls).getByRole('button', { name: 'Light' });
    const dark = within(themeControls).getByRole('button', { name: 'Dark' });

    expect(light).toHaveAttribute('aria-pressed', 'true');
    expect(dark).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(dark);
    expect(dark).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.admin-shell')).toHaveClass('dark');
    fireEvent.click(light);
    expect(light).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.admin-shell')).not.toHaveClass('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(auth.logout).toHaveBeenCalledOnce();
  });
});
