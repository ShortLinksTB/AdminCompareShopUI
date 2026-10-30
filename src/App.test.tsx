import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from './App';

const auth = vi.hoisted(() => ({
  permissions: [] as string[],
  logout: vi.fn(),
  userName: 'Test Admin',
}));

vi.mock('./auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    status: 'authenticated', permissionState: 'ready', permissions: auth.permissions,
    userName: auth.userName, logout: auth.logout, requestAdmin: vi.fn(),
  }),
  AuthLoadingScreen: () => null,
  CallbackPage: () => null,
  ForbiddenPage: () => null,
  LoginPage: () => null,
  PermissionFailure: () => null,
}));

vi.mock('./BannedItems', () => ({
  BannedItemsRoute: () => {
    const location = useLocation();
    return <div>Banned items page: {location.pathname}</div>;
  },
}));

function renderApp() {
  return render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
}

afterEach(() => {
  cleanup();
  auth.permissions = [];
  vi.clearAllMocks();
});

describe('mobile application navigation', () => {
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
});
