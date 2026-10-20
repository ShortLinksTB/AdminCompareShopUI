// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BannedItemsRoute } from './BannedItems';
import { App } from './App';
import { BanApiError, type BannedItem, type Page } from './bannedItemsApi';
import { createBannedItem, getBannedItems, revokeBannedItem } from './bannedItemsApi';

vi.mock('./bannedItemsApi', async () => {
  const actual = await vi.importActual<typeof import('./bannedItemsApi')>('./bannedItemsApi');
  return { ...actual, createBannedItem: vi.fn(), getBannedItems: vi.fn(), revokeBannedItem: vi.fn() };
});

const item: BannedItem = {
  id: 'ban-1', targetType: 'Brand', brandName: 'Example Brand', reason: 'Policy violation',
  isActive: true, createdBy: 'Nguyễn An', createdAtUtc: '2026-10-19T09:10:00Z',
};
const page = (items: BannedItem[] = [item], pageNumber = 1, totalItems = items.length): Page<BannedItem> => ({ items, pageNumber, pageSize: 20, totalItems });

function renderRoute(path: string, role = 'Super Admin') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/" element={<h1>Dashboard</h1>} />
    <Route path="/banned-items" element={<BannedItemsRoute role={role} />} />
    <Route path="/banned-items/new" element={<BannedItemsRoute role={role} />} />
  </Routes></MemoryRouter>);
}

describe('Banned items routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBannedItems).mockResolvedValue(page());
    vi.mocked(createBannedItem).mockResolvedValue(undefined);
    vi.mocked(revokeBannedItem).mockResolvedValue(undefined);
  });
  afterEach(() => cleanup());

  it('hides the page completely from Editor and Viewer roles, including direct navigation', async () => {
    const { rerender } = renderRoute('/banned-items', 'Editor');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Banned items' })).toBeNull();
    rerender(<MemoryRouter initialEntries={['/banned-items/new']}><Routes><Route path="/" element={<h1>Dashboard</h1>} /><Route path="/banned-items/new" element={<BannedItemsRoute role="Viewer" />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Add banned item' })).toBeNull();
    expect(getBannedItems).not.toHaveBeenCalled();
  });

  it('loads the active list, shows the audit fields, and sends search and type filters', async () => {
    const user = userEvent.setup();
    renderRoute('/banned-items', 'Operator');
    expect((await screen.findAllByText('Example Brand')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Policy violation').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nguyễn An').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(vi.mocked(getBannedItems).mock.calls[0][0]).toMatchObject({ active: true, page: 1, pageSize: 20 });

    await user.type(screen.getByRole('textbox', { name: 'Search banned items' }), 'Example');
    await waitFor(() => expect(vi.mocked(getBannedItems).mock.calls.at(-1)?.[0]).toMatchObject({ search: 'Example', page: 1 }));
    await user.selectOptions(screen.getByLabelText('Filter by target type'), 'Product');
    await waitFor(() => expect(vi.mocked(getBannedItems).mock.calls.at(-1)?.[0]).toMatchObject({ targetType: 'Product', active: true }));
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'false');
    await waitFor(() => expect(vi.mocked(getBannedItems).mock.calls.at(-1)?.[0]).toMatchObject({ active: false }));
  });

  it('requests the next API page using the real list route', async () => {
    const user = userEvent.setup();
    vi.mocked(getBannedItems).mockResolvedValueOnce(page([item], 1, 21)).mockResolvedValueOnce(page([item], 2, 21));
    renderRoute('/banned-items');
    expect(await screen.findByText('Page 1 of 2')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(vi.mocked(getBannedItems).mock.calls.at(-1)?.[0]).toMatchObject({ page: 2 }));
  });

  it('requires explicit confirmation before DELETE and updates the active list after success', async () => {
    const user = userEvent.setup();
    renderRoute('/banned-items');
    await screen.findAllByText('Example Brand');
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(revokeBannedItem).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revoke ban' }));
    await waitFor(() => expect(revokeBannedItem).toHaveBeenCalledWith('ban-1'));
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
    render(<MemoryRouter initialEntries={['/banned-items']}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Banned items' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Add banned item/ }));
    expect(await screen.findByRole('heading', { name: 'Add banned item' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Banned items' })).toBeTruthy();
  });

  it('creates the exact brand payload through the add route', async () => {
    const user = userEvent.setup();
    renderRoute('/banned-items/new');
    await user.type(screen.getByLabelText('Brand name *'), 'Example Brand');
    await user.click(screen.getByRole('button', { name: 'Add to banned list' }));
    await waitFor(() => expect(createBannedItem).toHaveBeenCalledWith({ targetType: 'Brand', brandName: 'Example Brand' }));
    expect(await screen.findByRole('heading', { name: 'Banned items' })).toBeTruthy();
  });

  it('creates product bans with product ID and reason and displays a 409 response', async () => {
    const user = userEvent.setup();
    vi.mocked(createBannedItem).mockRejectedValueOnce(new BanApiError('An active ban already exists for this target.', 409));
    renderRoute('/banned-items/new');
    await user.click(screen.getByRole('radio', { name: 'Product' }));
    await user.type(screen.getByLabelText('Product ID *'), 'product-42');
    await user.type(screen.getByLabelText(/Ban reason/), 'Not eligible');
    await user.click(screen.getByRole('button', { name: 'Add to banned list' }));
    await waitFor(() => expect(createBannedItem).toHaveBeenCalledWith({ targetType: 'Product', productId: 'product-42', reason: 'Not eligible' }));
    expect((await screen.findByRole('alert')).textContent).toContain('An active ban already exists');
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
