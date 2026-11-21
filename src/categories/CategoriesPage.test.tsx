// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import type { AdminRequest, Page } from '../bannedItemsApi';
import { CategoriesPage } from './CategoriesPage';
import type { AdminCategory } from './categories-api';

const api = vi.hoisted(() => ({ getCategories: vi.fn(), getAllCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn() }));
const countryApi = vi.hoisted(() => ({ getCountries: vi.fn() }));
vi.mock('./categories-api', async () => {
  const actual = await vi.importActual<typeof import('./categories-api')>('./categories-api');
  return { ...actual, ...api };
});
vi.mock('../countries/countries-api', async () => {
  const actual = await vi.importActual<typeof import('../countries/countries-api')>('../countries/countries-api');
  return { ...actual, ...countryApi };
});

const countries = [
  { id: 1, code: 'ID', name: 'Indonesia', isActive: true },
  { id: 2, code: 'VN', name: 'Vietnam', isActive: true },
  { id: 3, code: 'TH', name: 'Thailand', isActive: false },
];
const category: AdminCategory = { id: 7, slug: 'audio', name: 'Audio', isActive: false, countryId: 1, countryCode: 'ID', countryName: 'Indonesia' };
const page = (items: AdminCategory[] = [category], pageNumber = 1, totalItems = items.length, pageSize = 20): Page<AdminCategory> => ({ items, pageNumber, pageSize, totalItems });
const requestAdmin: AdminRequest = vi.fn();
const allPermissions = ['categories.read', 'categories.create', 'categories.update', 'categories.delete'];
function renderPage(permissions = allPermissions) { return render(<CategoriesPage requestAdmin={requestAdmin} permissions={permissions} />); }

describe('Categories page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countryApi.getCountries.mockResolvedValue(countries);
    api.getCategories.mockResolvedValue(page());
    api.getAllCategories.mockResolvedValue([category]);
    api.createCategory.mockResolvedValue(category);
    api.updateCategory.mockResolvedValue(category);
    api.deleteCategory.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(() => cleanup());

  it('shows loading, then renders the wireframe columns and contract fields', async () => {
    let resolve!: (value: Page<AdminCategory>) => void;
    api.getCategories.mockReturnValueOnce(new Promise<Page<AdminCategory>>(done => { resolve = done; }));
    renderPage();
    expect(screen.getByRole('status', { name: 'Đang tải countries' })).toBeInTheDocument();
    await screen.findByRole('status', { name: 'Đang tải categories' });
    resolve(page());
    expect(await screen.findByText('Audio')).toBeInTheDocument();
    expect(screen.getByText('SYSTEM').closest('header')).toHaveClass('studio-page-header');
    expect(screen.getByRole('heading', { name: 'Categories', level: 1 })).toBeInTheDocument();
    expect(document.querySelector('.studio-page-header p')).toHaveTextContent('Taxonomy sản phẩm — CRUD qua /admin/categories, theo đúng pattern Partner Shops.');
    expect(screen.queryByText(/Operator trở lên/)).not.toBeInTheDocument();
    expect(screen.getByText('audio')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(7);
    expect(within(table).queryByRole('columnheader', { name: /Active/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Phones|Computers|mock/i)).not.toBeInTheDocument();
    const footer = screen.getByText('Showing 1–1 of 1 categories').parentElement!;
    expect(footer.firstElementChild).toHaveTextContent('Hiển thị');
    expect(footer.firstElementChild).toHaveTextContent('Tổng 1 category');
    expect(footer.lastElementChild?.firstElementChild).toHaveClass('studio-pager');
    expect(api.getCategories).toHaveBeenCalledWith(requestAdmin, 1, 20, 1, expect.any(AbortSignal));
    expect(screen.getByRole('combobox', { name: 'Country context' })).toHaveValue('1');
    expect(within(screen.getByRole('table')).getByText('ID · Indonesia')).toBeInTheDocument();
  });

  it('shows an API empty state and a retryable list error without mock rows', async () => {
    api.getCategories.mockResolvedValueOnce(page([]));
    const { rerender } = renderPage();
    expect(await screen.findByText('Chưa có category nào cho Country đã chọn.')).toBeInTheDocument();
    api.getCategories.mockRejectedValueOnce(new Error('offline'));
    rerender(<CategoriesPage requestAdmin={vi.fn()} permissions={allPermissions} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
    expect(screen.queryByText('Audio')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(api.getCategories).toHaveBeenCalledTimes(3));
  });

  it('renders expandable parent and indented child rows, and saves an optional parent id', async () => {
    const root: AdminCategory = { id: 1006, slug: 'electronics', name: 'Electronics', isActive: true, countryId: 1, parentCategoryId: null };
    const leaf: AdminCategory = { id: 7, slug: 'phones', name: 'Phones', isActive: true, countryId: 1, parentCategoryId: 1006 };
    api.getCategories.mockResolvedValue(page([root, leaf]));
    api.getAllCategories.mockResolvedValue([root, leaf]);
    renderPage();
    expect(await screen.findByText('Phones')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Id', 'Name', 'Slug', 'Country', 'Level', 'Parent', '']);
    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(screen.getByText('Level 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thu gọn Electronics' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thu gọn Electronics' }));
    expect(screen.queryByText('Phones')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mở rộng Electronics' }));
    expect(screen.getByText('Phones')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Actions for Phones'));
    await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(screen.getByLabelText('Parent category')).toHaveValue('1006');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu category' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Lưu category' }));
    await waitFor(() => expect(api.updateCategory).toHaveBeenCalledWith(requestAdmin, 7, { slug: 'phones', name: 'Phones', isActive: true, countryId: 1, parentCategoryId: 1006 }));
  });

  it('gates create, update, and delete independently for a read-only viewer', async () => {
    renderPage(['categories.read']);
    expect(await screen.findByText('Audio')).toBeInTheDocument();
    expect(screen.queryByText(/Viewer chỉ thấy bảng/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Thêm category/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Actions for Audio')).not.toBeInTheDocument();
    expect(screen.getByText(/Tổng/).parentElement).toHaveTextContent('1 category');
    expect(screen.getByText('Showing 1–1 of 1 categories')).toBeInTheDocument();
  });

  it('filters visible categories by name or slug and exposes row mutations through the action menu', async () => {
    api.getCategories.mockResolvedValueOnce(page([category, { id: 8, slug: 'laptops', name: 'Computers', isActive: true, countryId: 1 }]));
    renderPage();
    expect(await screen.findByText('Audio')).toBeInTheDocument();
    expect(screen.getByText('Computers')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search categories' }), 'laptop');
    expect(screen.queryByText('Audio')).not.toBeInTheDocument();
    expect(screen.getByText('Computers')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–1 of 1 categories')).toBeInTheDocument();
    expect(screen.getByText(/Tổng/).parentElement).toHaveTextContent('1 category');
    await userEvent.click(screen.getByLabelText('Actions for Computers'));
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xoá' })).toBeInTheDocument();
  });

  it('shows zero filtered totals and range when a search has no matches', async () => {
    renderPage();
    expect(await screen.findByText('Audio')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search categories' }), 'missing');
    expect(screen.queryByText('Audio')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 0–0 of 0 categories')).toBeInTheDocument();
    expect(screen.getByText(/Tổng/).parentElement).toHaveTextContent('0 category');
  });

  it('preserves the API total and paginated range when search is cleared', async () => {
    api.getCategories.mockResolvedValueOnce(page([category, { id: 8, slug: 'laptops', name: 'Computers', isActive: true, countryId: 1 }], 1, 22, 20))
      .mockResolvedValueOnce(page([category, { id: 8, slug: 'laptops', name: 'Computers', isActive: true, countryId: 1 }], 2, 22, 20));
    renderPage();
    expect(await screen.findByText('Audio')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(screen.getByText('Showing 21–22 of 22 categories')).toBeInTheDocument();
    expect(screen.getByText(/Tổng/).parentElement).toHaveTextContent('22 category');

    const search = screen.getByRole('textbox', { name: 'Search categories' });
    await userEvent.type(search, 'laptop');
    expect(screen.getByText('Showing 1–1 of 1 categories')).toBeInTheDocument();
    expect(screen.getByText(/Tổng/).parentElement).toHaveTextContent('1 category');

    await userEvent.clear(search);
    expect(screen.getByText('Showing 21–22 of 22 categories')).toBeInTheDocument();
    expect(screen.getByText(/Tổng/).parentElement).toHaveTextContent('22 category');
  });

  it('independently exposes the allowed mutation action', async () => {
    renderPage(['categories.read', 'categories.update']);
    expect(await screen.findByText('Audio')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Thêm category/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Actions for Audio'));
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xoá' })).not.toBeInTheDocument();
  });

  it('submits create, closes on success, then reloads the current page', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '+ Thêm category' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu category' })).toBeEnabled());
    expect(Array.from((screen.getByRole('combobox', { name: 'Country' }) as HTMLSelectElement).options).map(option => option.value)).toEqual(['', '1', '2']);
    await user.type(screen.getByLabelText('Slug'), 'new-cat');
    await user.type(screen.getByLabelText('Name'), 'New category');
    await user.click(screen.getByRole('button', { name: 'Lưu category' }));
    await waitFor(() => expect(api.createCategory).toHaveBeenCalledWith(requestAdmin, { slug: 'new-cat', name: 'New category', isActive: true, countryId: 1, parentCategoryId: null }));
    expect(await screen.findByText('Audio')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.getCategories).toHaveBeenCalledTimes(2);
  });

  it('keeps failed form values and reports validation feedback', async () => {
    const user = userEvent.setup();
    api.createCategory.mockRejectedValueOnce(new Error('Slug already exists.'));
    renderPage();
    await user.click(await screen.findByRole('button', { name: '+ Thêm category' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu category' })).toBeEnabled());
    await user.type(screen.getByLabelText('Slug'), 'duplicate');
    await user.type(screen.getByLabelText('Name'), 'Duplicate');
    await user.click(screen.getByRole('button', { name: 'Lưu category' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Slug already exists.');
    expect(screen.getByLabelText('Slug')).toHaveValue('duplicate');
    expect(screen.getByLabelText('Name')).toHaveValue('Duplicate');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('updates all DTO values, including isActive, and reloads', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByLabelText('Actions for Audio'));
    await user.click(screen.getByRole('button', { name: 'Sửa' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu category' })).toBeEnabled());
    expect(screen.getByLabelText('Active')).not.toBeChecked();
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Audio gear');
    await user.click(screen.getByLabelText('Active'));
    await user.click(screen.getByRole('button', { name: 'Lưu category' }));
    await waitFor(() => expect(api.updateCategory).toHaveBeenCalledWith(requestAdmin, 7, { slug: 'audio', name: 'Audio gear', isActive: true, countryId: 1, parentCategoryId: null }));
    expect(api.getCategories).toHaveBeenCalledTimes(2);
  });

  it('does not dismiss the edit dialog with Escape while an update is pending', async () => {
    const user = userEvent.setup();
    let rejectUpdate!: (reason: Error) => void;
    api.updateCategory.mockReturnValueOnce(new Promise<AdminCategory>((_, reject) => { rejectUpdate = reject; }));
    renderPage();
    await user.click(await screen.findByLabelText('Actions for Audio'));
    await user.click(screen.getByRole('button', { name: 'Sửa' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu category' })).toBeEnabled());
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Audio gear');
    await user.click(screen.getByRole('button', { name: 'Lưu category' }));
    expect(await screen.findByRole('button', { name: 'Đang lưu…' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Audio gear');
    rejectUpdate(new Error('offline'));
    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Audio gear');
  });

  it('deletes after confirmation and returns to the previous page when the final row is removed', async () => {
    const user = userEvent.setup();
    api.getCategories.mockResolvedValueOnce(page([category], 1, 21)).mockResolvedValueOnce(page([category], 2, 21)).mockResolvedValueOnce(page([category], 1, 20));
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Actions for Audio'));
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(api.deleteCategory).toHaveBeenCalledWith(requestAdmin, 7));
    await waitFor(() => expect(api.getCategories).toHaveBeenLastCalledWith(requestAdmin, 1, 20, 1, expect.any(AbortSignal)));
    expect(await screen.findByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('disables all row mutations while a delete is pending', async () => {
    const user = userEvent.setup();
    let finishDelete!: () => void;
    api.deleteCategory.mockReturnValueOnce(new Promise<void>(resolve => { finishDelete = resolve; }));
    renderPage();
    await screen.findByText('Audio');
    await user.click(screen.getByLabelText('Actions for Audio'));
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    await user.click(screen.getByLabelText('Actions for Audio'));
    expect(screen.getByRole('button', { name: 'Đang xoá…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeDisabled();
    finishDelete();
    await waitFor(() => expect(api.getCategories).toHaveBeenCalledTimes(2));
  });

  it('keeps the list visible when a delete is rejected', async () => {
    const user = userEvent.setup();
    api.deleteCategory.mockRejectedValueOnce(new Error('Delete restricted.'));
    renderPage();
    await screen.findByText('Audio');
    await user.click(screen.getByLabelText('Actions for Audio'));
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Delete restricted.');
    expect(screen.getByText('Audio')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Actions for Audio'));
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
  });

  it('reloads the list for the selected Country and never shows rows from another Country', async () => {
    const indonesiaCategory = { ...category, name: 'Audio ID' };
    const vietnamCategory: AdminCategory = { id: 8, slug: 'audio-vn', name: 'Audio VN', isActive: true, countryId: 2, countryCode: 'VN', countryName: 'Vietnam' };
    api.getCategories.mockResolvedValueOnce(page([indonesiaCategory])).mockResolvedValueOnce(page([vietnamCategory]));
    renderPage();
    expect(await screen.findByText('Audio ID')).toBeInTheDocument();
    const context = screen.getByRole('combobox', { name: 'Country context' });
    expect(Array.from((context as HTMLSelectElement).options).map(option => option.value)).toEqual(['1', '2']);
    await userEvent.selectOptions(context, '2');
    expect(await screen.findByText('Audio VN')).toBeInTheDocument();
    expect(screen.queryByText('Audio ID')).not.toBeInTheDocument();
    expect(api.getCategories).toHaveBeenLastCalledWith(requestAdmin, 1, 20, 2, expect.any(AbortSignal));
  });

  it('opens and saves an existing category with its inactive Country missing from the Countries lookup', async () => {
    const countryLookup = [
      { id: 1, code: 'ID', name: 'Indonesia', isActive: true },
      { id: 2, code: 'VN', name: 'Vietnam', isActive: true },
    ];
    const existingCategory: AdminCategory = { ...category, countryId: 1, countryCode: 'ID', countryName: 'Indonesia' };
    countryApi.getCountries.mockResolvedValue(countryLookup);
    api.getCategories.mockResolvedValue(page([existingCategory]));
    api.getAllCategories.mockResolvedValue([existingCategory]);
    const { rerender } = renderPage();
    expect(await screen.findByText('Audio')).toBeInTheDocument();

    countryLookup.splice(0, 1);
    rerender(<CategoriesPage requestAdmin={requestAdmin} permissions={[...allPermissions]} />);
    await userEvent.click(screen.getByLabelText('Actions for Audio'));
    await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu category' })).toBeEnabled());
    const countrySelect = screen.getByRole('combobox', { name: 'Country' }) as HTMLSelectElement;
    expect(countrySelect).toHaveValue('1');
    expect(Array.from(countrySelect.options).map(option => option.textContent)).toContain('ID · Indonesia · Inactive');

    await userEvent.click(screen.getByRole('button', { name: 'Lưu category' }));
    await waitFor(() => expect(api.updateCategory).toHaveBeenCalledWith(requestAdmin, existingCategory.id, expect.objectContaining({ countryId: 1 })));
  });

});
