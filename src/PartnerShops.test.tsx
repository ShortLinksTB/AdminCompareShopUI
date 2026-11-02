// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { PartnerShops } from './PartnerShops';
import type { AdminRequest } from './bannedItemsApi';
import type { PartnerShop } from './shopsApi';

const api = vi.hoisted(() => ({
  getPartnerShops: vi.fn(), createPartnerShop: vi.fn(), updatePartnerShop: vi.fn(), deletePartnerShop: vi.fn(),
}));
vi.mock('./shopsApi', async () => {
  const actual = await vi.importActual<typeof import('./shopsApi')>('./shopsApi');
  return { ...actual, ...api };
});

const shop: PartnerShop = { id: 42, slug: 'cellphones', name: 'CellphoneS', websiteUrl: 'https://cellphones.com.vn', isActive: true };
const page = (items = [shop], pageNumber = 1, totalItems = items.length, pageSize = 20) => ({ items, pageNumber, pageSize, totalItems });
const requestAdmin: AdminRequest = vi.fn();

function renderShops(permissions = ['shops.read', 'shops.create', 'shops.update', 'shops.delete']) {
  return render(<PartnerShops requestAdmin={requestAdmin} permissions={permissions} />);
}

describe('Partner Shops page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPartnerShops.mockResolvedValue(page());
    api.createPartnerShop.mockResolvedValue(shop);
    api.updatePartnerShop.mockResolvedValue(shop);
    api.deletePartnerShop.mockResolvedValue(undefined);
  });
  afterEach(() => cleanup());

  it('shows loading before the API resolves, then renders only API fields and active state', async () => {
    let resolve!: (value: ReturnType<typeof page>) => void;
    api.getPartnerShops.mockReturnValueOnce(new Promise<ReturnType<typeof page>>(done => { resolve = done; }));
    renderShops();
    expect(screen.getByRole('status', { name: 'Loading partner shops' })).toBeInTheDocument();
    resolve(page());
    expect(await screen.findByText('CellphoneS')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText('cellphones')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.queryByText(/Sync|Products|Offers/)).not.toBeInTheDocument();
    expect(api.getPartnerShops).toHaveBeenCalledWith(requestAdmin, 1, 20);
  });

  it('uses 1-based pagination and allows supported page sizes', async () => {
    const user = userEvent.setup();
    api.getPartnerShops.mockResolvedValueOnce(page([shop], 1, 21)).mockResolvedValueOnce(page([shop], 2, 21));
    renderShops();
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(api.getPartnerShops).toHaveBeenLastCalledWith(requestAdmin, 2, 20));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '50');
    await waitFor(() => expect(api.getPartnerShops).toHaveBeenLastCalledWith(requestAdmin, 1, 50));
  });

  it('shows only actions permitted by the permission snapshot', async () => {
    renderShops(['shops.read', 'shops.update']);
    expect(await screen.findByText('CellphoneS')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add shop/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('preserves entered form values after validation failure', async () => {
    const user = userEvent.setup();
    api.createPartnerShop.mockRejectedValueOnce(new Error('Slug already exists.'));
    renderShops();
    await user.click(await screen.findByRole('button', { name: /Add shop/ }));
    await user.type(screen.getByLabelText('Slug'), 'new-shop');
    await user.type(screen.getByLabelText('Name'), 'New Shop');
    await user.click(screen.getByRole('button', { name: 'Save shop' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Slug already exists.');
    expect(screen.getByLabelText('Slug')).toHaveValue('new-shop');
    expect(screen.getByLabelText('Name')).toHaveValue('New Shop');
  });

  it('confirms before deleting, cancels without a request, and retains a shop on delete failure', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    api.deletePartnerShop.mockRejectedValueOnce(new Error('Delete restricted.'));
    renderShops();
    await screen.findByText('CellphoneS');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(api.deletePartnerShop).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Delete restricted.');
    expect(screen.getByText('CellphoneS')).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('shows API empty state and retryable list errors without mock fallback', async () => {
    api.getPartnerShops.mockResolvedValueOnce(page([]));
    const { rerender } = renderShops();
    expect(await screen.findByText('No partner shops found.')).toBeInTheDocument();
    api.getPartnerShops.mockRejectedValueOnce(new Error('offline'));
    const retryRequest = vi.fn();
    rerender(<PartnerShops requestAdmin={retryRequest} permissions={['shops.read']} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
    expect(screen.queryByText('Lazada')).not.toBeInTheDocument();
  });
});
