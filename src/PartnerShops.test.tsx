// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { PartnerShops } from './PartnerShops';
import type { AdminRequest } from './bannedItemsApi';
import type { PartnerShop } from './shopsApi';

const api = vi.hoisted(() => ({
  getPartnerShops: vi.fn(), createPartnerShop: vi.fn(), updatePartnerShop: vi.fn(), deletePartnerShop: vi.fn(), getCountries: vi.fn(),
}));
vi.mock('./shopsApi', async () => {
  const actual = await vi.importActual<typeof import('./shopsApi')>('./shopsApi');
  return { ...actual, ...api };
});
vi.mock('./countries/countries-api', async () => {
  const actual = await vi.importActual<typeof import('./countries/countries-api')>('./countries/countries-api');
  return { ...actual, getCountries: api.getCountries };
});

const shop: PartnerShop = { id: 42, slug: 'cellphones', name: 'CellphoneS', countryId: 1, countryCode: 'VN', countryName: 'Vietnam', websiteUrl: 'https://cellphones.com.vn', isActive: true, showOnHome: false, homeDisplayOrder: null };
const countries = [{ id: 1, code: 'VN', name: 'Vietnam', isActive: true }, { id: 2, code: 'ID', name: 'Indonesia', isActive: false }];
const page = (items = [shop], pageNumber = 1, totalItems = items.length, pageSize = 20) => ({ items, pageNumber, pageSize, totalItems });
const requestAdmin: AdminRequest = vi.fn();

function renderShops(permissions = ['shops.read', 'shops.create', 'shops.update', 'shops.delete']) {
  return render(<PartnerShops requestAdmin={requestAdmin} permissions={permissions} />);
}

describe('Partner Shops page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPartnerShops.mockResolvedValue(page());
    api.getCountries.mockResolvedValue(countries);
    api.createPartnerShop.mockResolvedValue(shop);
    api.updatePartnerShop.mockResolvedValue(shop);
    api.deletePartnerShop.mockResolvedValue(undefined);
  });
  afterEach(() => cleanup());

  it('shows loading before the API resolves, then renders the real shop table and independent status controls', async () => {
    let resolve!: (value: ReturnType<typeof page>) => void;
    api.getPartnerShops.mockReturnValueOnce(new Promise<ReturnType<typeof page>>(done => { resolve = done; }));
    renderShops();
    expect(screen.getByRole('status', { name: 'Loading partner shops' })).toBeInTheDocument();
    resolve(page());
    expect(await screen.findByText('CellphoneS')).toBeInTheDocument();
    expect(screen.getByText(/#42/)).toBeInTheDocument();
    expect(document.querySelector('.partner-shop-name small')).toHaveTextContent('cellphones');
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('VN · Vietnam')).toBeInTheDocument();
    expect(document.querySelector('.studio-page-header')).toBeInTheDocument();
    expect(document.querySelector('.studio-table')).toBeInTheDocument();
    expect(document.querySelector('.studio-pill-ok')).toHaveTextContent('Active');
    expect(screen.getByRole('link', { name: 'https://cellphones.com.vn' })).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Showing 1–1 of 1 shops')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Hiển thị CellphoneS ở trang chủ' })).not.toBeChecked();
    expect(screen.getByText(/Active xác định shop còn hoạt động/)).toBeInTheDocument();
    expect(screen.queryByText(/Sync|Products|Offers/)).not.toBeInTheDocument();
    expect(api.getPartnerShops).toHaveBeenCalledWith(requestAdmin, 1, 100);
  });

  it('saves visibility immediately and reports success', async () => {
    const user = userEvent.setup();
    api.updatePartnerShop.mockResolvedValueOnce({ ...shop, showOnHome: true });
    renderShops();
    const toggle = await screen.findByRole('switch', { name: 'Hiển thị CellphoneS ở trang chủ' });
    await user.click(toggle);
    expect(toggle).toBeChecked();
    await waitFor(() => expect(api.updatePartnerShop).toHaveBeenCalledWith(requestAdmin, 42, expect.objectContaining({ showOnHome: true, isActive: true })));
    expect(await screen.findByRole('status')).toHaveTextContent('CellphoneS sẽ hiển thị ở trang chủ.');
    expect(screen.getByRole('status')).toHaveClass('partner-shop-toast--success');
  });

  it('rolls back an optimistic visibility change after API failure', async () => {
    const user = userEvent.setup();
    let rejectUpdate!: (reason: Error) => void;
    api.updatePartnerShop.mockReturnValueOnce(new Promise((_, reject) => { rejectUpdate = reject; }));
    renderShops();
    const toggle = await screen.findByRole('switch', { name: 'Hiển thị CellphoneS ở trang chủ' });
    await user.click(toggle);
    expect(screen.getByRole('switch', { name: 'Hiển thị CellphoneS ở trang chủ' })).toBeChecked();
    rejectUpdate(new Error('offline'));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Hiển thị CellphoneS ở trang chủ' })).not.toBeChecked());
    const errorToast = await screen.findByRole('alert');
    expect(errorToast).toHaveTextContent('Không thể cập nhật hiển thị: offline');
    expect(errorToast).toHaveClass('partner-shop-toast--error');
  });

  it('filters visibility and prevents enabling homepage display for inactive shops', async () => {
    const inactive = { ...shop, id: 43, name: 'Inactive shop', isActive: false };
    api.getPartnerShops.mockResolvedValueOnce(page([shop, inactive]));
    const user = userEvent.setup();
    renderShops();
    expect(await screen.findByText('Inactive shop')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Hiển thị Inactive shop ở trang chủ' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Đang ẩn/ }));
    expect(screen.getByText('CellphoneS')).toBeInTheDocument();
    expect(screen.getByText('Inactive shop')).toBeInTheDocument();
  });

  it('calculates visibility counts and filtered pagination from every API page', async () => {
    const shops = Array.from({ length: 125 }, (_, index): PartnerShop => ({
      ...shop,
      id: index + 1,
      name: `Shop ${index + 1}`,
      slug: `shop-${index + 1}`,
      showOnHome: index === 120,
    }));
    api.getPartnerShops
      .mockResolvedValueOnce(page(shops.slice(0, 100), 1, shops.length, 100))
      .mockResolvedValueOnce(page(shops.slice(100), 2, shops.length, 100));
    const user = userEvent.setup();
    renderShops();

    expect(await screen.findByText('Showing 1–20 of 125 shops')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 7')).toBeInTheDocument();
    expect(api.getPartnerShops).toHaveBeenNthCalledWith(1, requestAdmin, 1, 100);
    await waitFor(() => expect(api.getPartnerShops).toHaveBeenNthCalledWith(2, requestAdmin, 2, 100));

    await user.click(screen.getByRole('button', { name: /Đang hiển thị/ }));
    expect(screen.getByRole('button', { name: /Tất cả/ })).toHaveTextContent('125');
    expect(screen.getByRole('button', { name: /Đang hiển thị/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /Đang ẩn/ })).toHaveTextContent('124');
    expect(screen.getAllByText('Shop 121')).toHaveLength(2);
    expect(screen.getByText('Showing 1–1 of 1 shops')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('saves visibility and display order through the edit modal', async () => {
    const user = userEvent.setup();
    renderShops();
    await user.click(await screen.findByRole('button', { name: 'Sửa' }));
    expect(screen.getByRole('dialog', { name: 'Sửa shop · CellphoneS' })).toBeInTheDocument();
    expect(screen.getByLabelText('Slug (Không bắt buộc)')).toHaveValue('cellphones');
    await user.click(screen.getByRole('switch', { name: 'Hiển thị ở trang chủ' }));
    await user.type(screen.getByLabelText('Thứ tự hiển thị'), '4');
    await user.click(screen.getByRole('button', { name: 'Save shop' }));
    await waitFor(() => expect(api.updatePartnerShop).toHaveBeenCalledWith(requestAdmin, 42, expect.objectContaining({ showOnHome: true, homeDisplayOrder: 4 })));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('disables homepage visibility immediately when Active is unchecked in the edit modal', async () => {
    const user = userEvent.setup();
    renderShops();
    await user.click(await screen.findByRole('button', { name: 'Sửa' }));
    const visibilitySwitch = screen.getByRole('switch', { name: 'Hiển thị ở trang chủ' });
    expect(visibilitySwitch).toBeEnabled();
    await user.click(screen.getByRole('checkbox', { name: 'Active' }));
    expect(visibilitySwitch).toBeDisabled();
    expect(screen.getByText('Shop không hoạt động nên không thể hiển thị ở trang chủ.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save shop' }));
    await waitFor(() => expect(api.updatePartnerShop).toHaveBeenCalledWith(requestAdmin, 42, expect.objectContaining({ isActive: false, showOnHome: false })));
  });

  it('uses the shared modal and preserves the existing create fields and actions', async () => {
    const user = userEvent.setup();
    renderShops();
    await user.click(await screen.findByRole('button', { name: '+ Add shop' }));

    const dialog = screen.getByRole('dialog', { name: 'Add shop' });
    expect(dialog).toHaveClass('studio-modal', 'partner-shop-modal');
    expect(screen.getByText('Enter the partner shop details.')).toBeInTheDocument();
    expect(screen.getByLabelText('Slug (Không bắt buộc)')).not.toBeRequired();
    expect(screen.getByLabelText('Slug (Không bắt buộc)')).toHaveAttribute('placeholder', 'Tự động sinh từ tên nếu để trống');
    expect(screen.getByLabelText('Name')).toBeRequired();
    expect(screen.getByLabelText('Website URL (optional)')).toHaveAttribute('maxLength', '2048');
    expect(screen.getByRole('checkbox', { name: 'Active' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save shop' })).toHaveAttribute('form', 'partner-shop-form');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uses 1-based pagination and allows supported page sizes', async () => {
    const user = userEvent.setup();
    const shops = Array.from({ length: 21 }, (_, index): PartnerShop => ({ ...shop, id: index + 1, name: `Shop ${index + 1}` }));
    api.getPartnerShops.mockResolvedValueOnce(page(shops, 1, 21, 100));
    renderShops();
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Showing 21–21 of 21 shops')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '50');
    expect(screen.getByText('Showing 1–21 of 21 shops')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(api.getPartnerShops).toHaveBeenCalledTimes(1);
  });

  it('shows only actions permitted by the permission snapshot', async () => {
    renderShops(['shops.read', 'shops.update']);
    expect(await screen.findByText('CellphoneS')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add shop/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xoá' })).not.toBeInTheDocument();
  });

  it('preserves entered form values after validation failure', async () => {
    const user = userEvent.setup();
    api.createPartnerShop.mockRejectedValueOnce(new Error('Slug already exists.'));
    renderShops();
    await user.click(await screen.findByRole('button', { name: /Add shop/ }));
    await user.type(screen.getByLabelText('Slug (Không bắt buộc)'), 'new-shop');
    await user.type(screen.getByLabelText('Name'), 'New Shop');
    await user.selectOptions(screen.getByLabelText('Country'), '1');
    await user.click(screen.getByRole('button', { name: 'Save shop' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Slug already exists.');
    expect(screen.getByLabelText('Slug (Không bắt buộc)')).toHaveValue('new-shop');
    expect(screen.getByLabelText('Name')).toHaveValue('New Shop');
  });

  it('creates a shop with only its name and generates a Vietnamese slug', async () => {
    const user = userEvent.setup();
    renderShops();
    await user.click(await screen.findByRole('button', { name: /Add shop/ }));
    expect(screen.getByLabelText('Country')).toHaveValue('');
    expect(screen.queryByRole('option', { name: /Indonesia/ })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'Bách Hóa Xanh');
    await user.selectOptions(screen.getByLabelText('Country'), '1');
    await user.click(screen.getByRole('button', { name: 'Save shop' }));

    await waitFor(() => expect(api.createPartnerShop).toHaveBeenCalledWith(requestAdmin, expect.objectContaining({
      name: 'Bách Hóa Xanh', slug: 'bach-hoa-xanh', countryId: 1,
    })));
    expect(await screen.findByRole('status')).toHaveTextContent('Đã thêm shop.');
  });

  it('requires a Country before creating a shop', async () => {
    const user = userEvent.setup();
    renderShops();
    await user.click(await screen.findByRole('button', { name: /Add shop/ }));
    const country = screen.getByLabelText('Country');
    expect(country).toBeRequired();
    await user.type(screen.getByLabelText('Name'), 'No Country Shop');
    await user.click(screen.getByRole('button', { name: 'Save shop' }));
    expect(api.createPartnerShop).not.toHaveBeenCalled();
  });

  it('keeps the existing edit slug unless the field is cleared', async () => {
    const user = userEvent.setup();
    renderShops();
    await user.click(await screen.findByRole('button', { name: 'Sửa' }));
    expect(screen.getByLabelText('Country')).toHaveValue('1');
    expect(screen.getByLabelText('Slug (Không bắt buộc)')).toHaveValue('cellphones');
    await user.clear(screen.getByLabelText('Slug (Không bắt buộc)'));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Bách Hóa Xanh');
    await user.selectOptions(screen.getByLabelText('Country'), '1');
    await user.click(screen.getByRole('button', { name: 'Save shop' }));

    await waitFor(() => expect(api.updatePartnerShop).toHaveBeenCalledWith(requestAdmin, 42, expect.objectContaining({
      slug: 'bach-hoa-xanh', name: 'Bách Hóa Xanh', countryId: 1,
    })));
  });

  it('keeps an existing inactive Country visible and allows saving without changing that assignment', async () => {
    const inactiveShop: PartnerShop = { ...shop, countryId: 2, countryCode: 'ID', countryName: 'Indonesia' };
    api.getPartnerShops.mockResolvedValueOnce(page([inactiveShop]));
    const user = userEvent.setup();
    renderShops();

    expect(await screen.findByText('ID · Indonesia')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(screen.getByLabelText('Country')).toHaveValue('2');
    expect(screen.getByRole('option', { name: 'ID · Indonesia · Inactive' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'CellphoneS Updated');
    await user.click(screen.getByRole('button', { name: 'Save shop' }));

    await waitFor(() => expect(api.updatePartnerShop).toHaveBeenCalledWith(requestAdmin, 42, expect.objectContaining({ name: 'CellphoneS Updated', countryId: 2 })));
  });

  it('retains the add form and shop list after a create permission failure', async () => {
    const user = userEvent.setup();
    api.createPartnerShop.mockRejectedValueOnce(new Error('You do not have permission to manage partner shops.'));
    renderShops();
    await user.click(await screen.findByRole('button', { name: /Add shop/ }));
    await user.type(screen.getByLabelText('Slug (Không bắt buộc)'), 'restricted-shop');
    await user.type(screen.getByLabelText('Name'), 'Restricted Shop');
    await user.selectOptions(screen.getByLabelText('Country'), '1');
    await user.click(screen.getByRole('button', { name: 'Save shop' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Slug (Không bắt buộc)')).toHaveValue('restricted-shop');
    expect(screen.getByLabelText('Name')).toHaveValue('Restricted Shop');
    expect(screen.getByText('CellphoneS')).toBeInTheDocument();
  });

  it('retains the edit form and shop list after an update permission failure', async () => {
    const user = userEvent.setup();
    api.updatePartnerShop.mockRejectedValueOnce(new Error('You do not have permission to manage partner shops.'));
    renderShops();
    await user.click(await screen.findByRole('button', { name: 'Sửa' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Updated CellphoneS');
    await user.click(screen.getByRole('button', { name: 'Save shop' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Updated CellphoneS');
    expect(screen.getByText('CellphoneS')).toBeInTheDocument();
  });

  it('confirms before deleting, cancels without a request, and retains a shop on delete failure', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    api.deletePartnerShop.mockRejectedValueOnce(new Error('Delete restricted.'));
    renderShops();
    await screen.findByText('CellphoneS');
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(api.deletePartnerShop).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Delete restricted.');
    expect(screen.getByText('CellphoneS')).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('shows API empty state and retryable list errors without mock fallback', async () => {
    api.getPartnerShops.mockResolvedValueOnce(page([]));
    const { rerender } = renderShops();
    expect(await screen.findByText('Chưa có partner shop.')).toBeInTheDocument();
    api.getPartnerShops.mockRejectedValueOnce(new Error('offline'));
    const retryRequest = vi.fn();
    rerender(<PartnerShops requestAdmin={retryRequest} permissions={['shops.read']} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
    expect(screen.queryByText('Lazada')).not.toBeInTheDocument();
  });
});
