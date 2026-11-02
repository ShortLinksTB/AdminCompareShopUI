// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShopsPage } from './ShopsPage';
import { createShop, deleteShop, getShops, updateShop, type AdminRequest, type AdminShop, type ShopPage } from './shopsApi';

vi.mock('./shopsApi', async () => {
  const actual = await vi.importActual<typeof import('./shopsApi')>('./shopsApi');
  return { ...actual, createShop: vi.fn(), deleteShop: vi.fn(), getShops: vi.fn(), updateShop: vi.fn() };
});

const shop: AdminShop = { id: 7, slug: 'example-shop', name: 'Example Shop', websiteUrl: 'https://example.com', isActive: true };
const shopPage = (items: AdminShop[] = [shop], pageNumber = 1, pageSize = 20, totalItems = items.length): ShopPage => ({ items, pageNumber, pageSize, totalItems });
const requestAdmin: AdminRequest = vi.fn();

function renderPage(permissions = ['shops.read', 'shops.create', 'shops.update', 'shops.delete']) {
  return render(<MemoryRouter initialEntries={['/shops']}><Routes>
    <Route path="/" element={<h1>Dashboard</h1>} />
    <Route path="/shops" element={<ShopsPage permissions={permissions} requestAdmin={requestAdmin} />} />
  </Routes></MemoryRouter>);
}

describe('Partner Shops page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getShops).mockImplementation(async (_request, page, pageSize) => shopPage([shop], page, pageSize, 21));
    vi.mocked(createShop).mockResolvedValue(shop);
    vi.mocked(updateShop).mockResolvedValue(shop);
    vi.mocked(deleteShop).mockResolvedValue(undefined);
    vi.stubGlobal('confirm', vi.fn(() => true));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('loads the real paged list and displays all contract fields with exact action gates', async () => {
    renderPage(['shops.read', 'shops.create', 'shops.update']);
    expect(await screen.findByRole('heading', { name: 'Example Shop' })).toBeInTheDocument();
    expect(screen.getByText('example-shop')).toBeInTheDocument();
    expect(screen.getByText('https://example.com')).toHaveAttribute('href', 'https://example.com/');
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '＋ Add shop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(vi.mocked(getShops).mock.calls[0].slice(0, 3)).toEqual([requestAdmin, 1, 20]);
  });

  it('uses the server pagination and exposes page-size controls', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(vi.mocked(getShops).mock.calls.at(-1)?.slice(1, 3)).toEqual([2, 20]));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '50');
    await waitFor(() => expect(vi.mocked(getShops).mock.calls.at(-1)?.slice(1, 3)).toEqual([1, 50]));
  });

  it('shows inactive shops without a website link and hides mutation actions without their permissions', async () => {
    vi.mocked(getShops).mockResolvedValue(shopPage([{ ...shop, websiteUrl: 'javascript:alert(1)', isActive: false }]));
    renderPage(['shops.read']);
    expect(await screen.findByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '＋ Add shop' })).not.toBeInTheDocument();
  });

  it('retains create form values and open form on validation failure', async () => {
    const user = userEvent.setup();
    vi.mocked(createShop).mockRejectedValueOnce(new Error('Invalid shop.'));
    renderPage();
    await user.click(await screen.findByRole('button', { name: '＋ Add shop' }));
    await user.type(screen.getByLabelText('Slug *'), 'new-shop');
    await user.type(screen.getByLabelText('Name *'), 'New Shop');
    await user.click(screen.getByRole('button', { name: /^Add shop$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid shop.');
    expect(screen.getByLabelText('Slug *')).toHaveValue('new-shop');
    expect(screen.getByLabelText('Name *')).toHaveValue('New Shop');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes an untouched create form when its backdrop is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '＋ Add shop' }));
    const backdrop = screen.getByRole('presentation');
    fireEvent.mouseDown(backdrop, { target: backdrop, currentTarget: backdrop });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('updates an existing shop and refreshes the current page after success', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Name *'));
    await user.type(screen.getByLabelText('Name *'), 'Changed Shop');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateShop).toHaveBeenCalledWith(requestAdmin, 7, expect.objectContaining({ name: 'Changed Shop', isActive: true })));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(getShops).toHaveBeenCalledTimes(2));
  });

  it('retains edited values when an update request fails', async () => {
    const user = userEvent.setup();
    vi.mocked(updateShop).mockRejectedValueOnce(new Error('Shop update failed.'));
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Name *'));
    await user.type(screen.getByLabelText('Name *'), 'Edited Name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Shop update failed.');
    expect(screen.getByLabelText('Name *')).toHaveValue('Edited Name');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('honors delete cancellation and keeps a shop visible when delete fails', async () => {
    const user = userEvent.setup();
    const confirm = vi.mocked(window.confirm);
    confirm.mockReturnValueOnce(false);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(deleteShop).not.toHaveBeenCalled();
    confirm.mockReturnValueOnce(true);
    vi.mocked(deleteShop).mockRejectedValueOnce(new Error('Request failed (500).'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed (500).');
    expect(screen.getByRole('heading', { name: 'Example Shop' })).toBeInTheDocument();
  });

  it('removes a deleted row only after success and shows an empty state', async () => {
    const user = userEvent.setup();
    vi.mocked(getShops).mockResolvedValue(shopPage([shop]));
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteShop).toHaveBeenCalledWith(requestAdmin, 7));
    expect(await screen.findByText('No partner shops found')).toBeInTheDocument();
  });

  it('moves back a page after deleting its only row', async () => {
    const user = userEvent.setup();
    const previousShop = { ...shop, id: 6, slug: 'previous-shop', name: 'Previous Shop', websiteUrl: null };
    const requestedPages: number[] = [];
    vi.mocked(getShops).mockImplementation(async (_request, page, pageSize) => {
      requestedPages.push(page);
      const totalItems = requestedPages.length > 2 ? 20 : 21;
      return page === 2 ? shopPage([shop], 2, pageSize, totalItems) : shopPage([previousShop], 1, pageSize, totalItems);
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Next page' }));
    await screen.findByText('Page 2 of 2');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('heading', { name: 'Previous Shop' })).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(requestedPages.at(-1)).toBe(1);
  });

  it('shows loading, request errors and retry without mock fallback', async () => {
    const user = userEvent.setup();
    let resolveList!: (result: ShopPage) => void;
    vi.mocked(getShops).mockImplementationOnce(() => new Promise(resolve => { resolveList = resolve; }));
    renderPage();
    expect(screen.getByRole('status', { name: 'Loading partner shops' })).toBeInTheDocument();
    resolveList(shopPage());
    expect(await screen.findByRole('heading', { name: 'Example Shop' })).toBeInTheDocument();
    vi.mocked(getShops).mockRejectedValueOnce(new Error('Forbidden'));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '50');
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden');
    expect(screen.getByRole('heading', { name: 'Example Shop' })).toBeInTheDocument();
    vi.mocked(getShops).mockResolvedValueOnce(shopPage());
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(getShops).toHaveBeenCalledTimes(4));
    expect(screen.getByRole('heading', { name: 'Example Shop' })).toBeInTheDocument();
  });

  it('redirects direct navigation without shops.read before requesting data', async () => {
    renderPage([]);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(getShops).not.toHaveBeenCalled();
  });
});
