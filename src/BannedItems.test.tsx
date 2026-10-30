// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BannedItemsRoute } from './BannedItems';
import { App } from './App';
import { BanApiError, type AdminRequest, type BannedItem, type Page, type ProductTarget } from './bannedItemsApi';
import { createBannedItem, getBannedItems, getProductTargets, revokeBannedItem } from './bannedItemsApi';

vi.mock('./bannedItemsApi', async () => {
  const actual = await vi.importActual<typeof import('./bannedItemsApi')>('./bannedItemsApi');
  return { ...actual, createBannedItem: vi.fn(), getBannedItems: vi.fn(), getProductTargets: vi.fn(), revokeBannedItem: vi.fn() };
});

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

const item: BannedItem = {
  id: 'ban-1', targetType: 'Brand', brandName: 'Example Brand', reason: 'Policy violation',
  isActive: true, createdBy: 'Nguyễn An', createdAtUtc: '2026-10-19T09:10:00Z',
};
const page = (items: BannedItem[] = [item], pageNumber = 1, totalItems = items.length): Page<BannedItem> => ({ items, pageNumber, pageSize: 20, totalItems });
const products: ProductTarget[] = [{ id: 42, name: 'Example Phone', brand: 'Example Brand', isActive: true }, { id: 43, name: 'Sample Phone', brand: 'Sample Brand', isActive: true }];

function renderRoute(path: string, permissions: string[] = ['compliance.read', 'compliance.manage']) {
  const requestAdmin: AdminRequest = vi.fn();
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/" element={<h1>Dashboard</h1>} />
    <Route path="/banned-items" element={<BannedItemsRoute permissions={permissions} requestAdmin={requestAdmin} />} />
    <Route path="/banned-items/new" element={<BannedItemsRoute permissions={permissions} requestAdmin={requestAdmin} />} />
  </Routes></MemoryRouter>);
}

function renderApp(initialEntry: string, permissions: string[]) {
  keycloakMocks.init.mockResolvedValue(true);
  keycloakMocks.updateToken.mockResolvedValue(false);
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(Response.json({ permissions }))));
  return render(<MemoryRouter initialEntries={[initialEntry]}><App /></MemoryRouter>);
}

describe('Banned items routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBannedItems).mockResolvedValue(page());
    vi.mocked(getProductTargets).mockResolvedValue(products);
    vi.mocked(createBannedItem).mockResolvedValue(undefined);
    vi.mocked(revokeBannedItem).mockResolvedValue(undefined);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('hides the page completely from permission sets without compliance.read, including direct navigation', async () => {
    const { rerender } = renderRoute('/banned-items', []);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Banned items' })).toBeNull();
    rerender(<MemoryRouter initialEntries={['/banned-items/new']}><Routes><Route path="/" element={<h1>Dashboard</h1>} /><Route path="/banned-items/new" element={<BannedItemsRoute permissions={[]} requestAdmin={vi.fn()} />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Add banned item' })).toBeNull();
    expect(getBannedItems).not.toHaveBeenCalled();
  });

  it('loads the active list, shows the audit fields, and sends search and type filters', async () => {
    const user = userEvent.setup();
    renderRoute('/banned-items');
    expect((await screen.findAllByText('Example Brand')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Policy violation').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nguyễn An').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(vi.mocked(getBannedItems).mock.calls[0][1]).toMatchObject({ active: true, page: 1, pageSize: 20 });

    await user.type(screen.getByRole('textbox', { name: 'Search banned items' }), 'Example');
    await waitFor(() => expect(vi.mocked(getBannedItems).mock.calls.at(-1)?.[1]).toMatchObject({ search: 'Example', page: 1 }));
    await user.selectOptions(screen.getByLabelText('Filter by target type'), 'Product');
    await waitFor(() => expect(vi.mocked(getBannedItems).mock.calls.at(-1)?.[1]).toMatchObject({ targetType: 'Product', active: true }));
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'false');
    await waitFor(() => expect(vi.mocked(getBannedItems).mock.calls.at(-1)?.[1]).toMatchObject({ active: false }));
  });

  it('requests the next API page using the real list route', async () => {
    const user = userEvent.setup();
    vi.mocked(getBannedItems).mockResolvedValueOnce(page([item], 1, 21)).mockResolvedValueOnce(page([item], 2, 21));
    renderRoute('/banned-items');
    expect(await screen.findByText('Page 1 of 2')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(vi.mocked(getBannedItems).mock.calls.at(-1)?.[1]).toMatchObject({ page: 2 }));
  });

  it('requires explicit confirmation before DELETE and updates the active list after success', async () => {
    const user = userEvent.setup();
    renderRoute('/banned-items');
    await screen.findAllByText('Example Brand');
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(revokeBannedItem).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revoke ban' }));
    await waitFor(() => expect(vi.mocked(revokeBannedItem).mock.calls.at(-1)?.[1]).toBe('ban-1'));
    expect(await screen.findByText('No active bans found')).toBeTruthy();
  });

  it('renders revoked actor and time without an available revoke action', async () => {
    const revoked = { ...item, isActive: false, revokedBy: 'Trần Minh Quân', revokedAtUtc: '2026-10-20T09:10:00Z' };
    vi.mocked(getBannedItems).mockResolvedValue(page([revoked]));
    renderRoute('/banned-items');
    await screen.findAllByText('Example Brand');
    expect(screen.getAllByText('Revoked').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Trần Minh Quân').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });

  it('announces loading while the list request is unresolved', async () => {
    vi.mocked(getBannedItems).mockReturnValueOnce(new Promise(() => undefined));
    renderRoute('/banned-items');
    expect(await screen.findByRole('status', { name: 'Loading banned items' })).toBeTruthy();
  });

  it('loads and navigates the actual App routes for the list and add form', async () => {
    const user = userEvent.setup();
    renderApp('/banned-items', ['compliance.read', 'compliance.manage']);
    expect(await screen.findByRole('heading', { name: 'Banned items' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Add banned item/ }));
    expect(await screen.findByRole('dialog', { name: 'Add banned item' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Banned items' })).toBeTruthy();
  });

  it('creates a brand ban from the searchable catalog selector with reason', async () => {
    const user = userEvent.setup();
    renderRoute('/banned-items');
    await screen.findAllByText('Example Brand');
    await user.click(screen.getByRole('button', { name: /Add banned item/ }));
    await user.type(await screen.findByRole('combobox', { name: 'Brand *' }), 'Example');
    await user.click(await screen.findByRole('option', { name: 'Example Brand' }));
    await user.type(screen.getByLabelText(/Ban reason/), 'Policy violation');
    await user.click(screen.getByRole('button', { name: 'Add to banned list' }));
    await waitFor(() => expect(vi.mocked(createBannedItem).mock.calls.at(-1)?.[1]).toEqual({ targetType: 'Brand', brandName: 'Example Brand', reason: 'Policy violation' }));
    expect(await screen.findByRole('heading', { name: 'Banned items' })).toBeTruthy();
  });

  it('shows a no-match message when the catalog search has no results', async () => {
    const user = userEvent.setup();
    renderRoute('/banned-items');
    await screen.findAllByText('Example Brand');
    await user.click(screen.getByRole('button', { name: /Add banned item/ }));
    await user.type(screen.getByRole('combobox', { name: 'Brand *' }), 'Nonexistent');
    expect(await screen.findByText('No matching brand found.')).toBeTruthy();
  });

  it('redirects away from the add-item form when the current permissions only allow read access, without starting any catalog or management request', async () => {
    renderApp('/banned-items/new', ['compliance.read']);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(getProductTargets).not.toHaveBeenCalled();
    expect(getBannedItems).not.toHaveBeenCalled();
  });

  it('creates product bans from the searchable catalog and displays a 409 response', async () => {
    const user = userEvent.setup();
    vi.mocked(createBannedItem).mockRejectedValueOnce(new BanApiError('An active ban already exists for this target.', 409));
    renderRoute('/banned-items');
    await screen.findAllByText('Example Brand');
    await user.click(screen.getByRole('button', { name: /Add banned item/ }));
    await user.click(screen.getByRole('radio', { name: 'Product' }));
    await user.type(screen.getByRole('combobox', { name: 'Product *' }), 'Example Phone');
    await user.click(await screen.findByRole('option', { name: /Example Phone/ }));
    await user.type(screen.getByLabelText(/Ban reason/), 'Not eligible');
    await user.click(screen.getByRole('button', { name: 'Add to banned list' }));
    await waitFor(() => expect(vi.mocked(createBannedItem).mock.calls.at(-1)?.[1]).toEqual({ targetType: 'Product', productId: 42, reason: 'Not eligible' }));
    expect((await screen.findByRole('alert')).textContent).toContain('An active ban already exists');
  });

  it('keeps the add flow on a full-screen route on mobile', async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    try {
      const user = userEvent.setup();
      renderApp('/banned-items', ['compliance.read', 'compliance.manage']);
      await screen.findAllByText('Example Brand');
      await user.click(screen.getByRole('button', { name: /Add banned item/ }));
      expect((await screen.findAllByRole('heading', { name: 'Add banned item' })).length).toBeGreaterThan(0);
      expect(screen.queryByRole('dialog', { name: 'Add banned item' })).toBeNull();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
  });

  it('does not grant compliance access without the compliance permissions from the backend', async () => {
    window.localStorage.setItem('giatot-admin-role', 'Super Admin');
    renderApp('/banned-items', []);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Banned items' })).toBeNull();
    expect(getBannedItems).not.toHaveBeenCalled();
    window.localStorage.removeItem('giatot-admin-role');
  });

  it('shows loading and API failure states with retry', async () => {
    const user = userEvent.setup();
    vi.mocked(getBannedItems).mockRejectedValueOnce(new Error('Service unavailable')).mockResolvedValueOnce(page());
    renderRoute('/banned-items');
    expect((await screen.findByRole('alert')).textContent).toContain('Service unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect((await screen.findAllByText('Example Brand')).length).toBeGreaterThan(0);
  });
});
