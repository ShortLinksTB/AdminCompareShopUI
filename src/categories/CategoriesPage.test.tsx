// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import type { AdminRequest, Page } from '../bannedItemsApi';
import { CategoriesPage } from './CategoriesPage';
import type { AdminCategory } from './categories-api';

const api = vi.hoisted(() => ({ getCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn() }));
vi.mock('./categories-api', async () => {
  const actual = await vi.importActual<typeof import('./categories-api')>('./categories-api');
  return { ...actual, ...api };
});

const category: AdminCategory = { id: 7, slug: 'audio', name: 'Audio', isActive: false };
const page = (items: AdminCategory[] = [category], pageNumber = 1, totalItems = items.length, pageSize = 20): Page<AdminCategory> => ({ items, pageNumber, pageSize, totalItems });
const requestAdmin: AdminRequest = vi.fn();
const allPermissions = ['categories.read', 'categories.create', 'categories.update', 'categories.delete'];
function renderPage(permissions = allPermissions) { return render(<CategoriesPage requestAdmin={requestAdmin} permissions={permissions} />); }

describe('Categories page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getCategories.mockResolvedValue(page());
    api.createCategory.mockResolvedValue(category);
    api.updateCategory.mockResolvedValue(category);
    api.deleteCategory.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(() => cleanup());

  it('shows loading, then renders only wireframe columns and contract fields', async () => {
    let resolve!: (value: Page<AdminCategory>) => void;
    api.getCategories.mockReturnValueOnce(new Promise<Page<AdminCategory>>(done => { resolve = done; }));
    renderPage();
    expect(screen.getByRole('status', { name: 'Đang tải categories' })).toBeInTheDocument();
    resolve(page());
    expect(await screen.findByText('Audio')).toBeInTheDocument();
    expect(screen.getByText('SYSTEM')).toHaveClass('eyebrow');
    expect(screen.getByText('audio')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4);
    expect(within(table).queryByRole('columnheader', { name: /Active/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Phones|Computers|mock/i)).not.toBeInTheDocument();
    expect(api.getCategories).toHaveBeenCalledWith(requestAdmin, 1, 20);
  });

  it('shows an API empty state and a retryable list error without mock rows', async () => {
    api.getCategories.mockResolvedValueOnce(page([]));
    const { rerender } = renderPage();
    expect(await screen.findByText('Chưa có category nào.')).toBeInTheDocument();
    api.getCategories.mockRejectedValueOnce(new Error('offline'));
    rerender(<CategoriesPage requestAdmin={vi.fn()} permissions={allPermissions} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
    expect(screen.queryByText('Audio')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(api.getCategories).toHaveBeenCalledTimes(3));
  });

  it('gates create, update, and delete independently for a read-only viewer', async () => {
    renderPage(['categories.read']);
    expect(await screen.findByText('Audio')).toBeInTheDocument();
    expect(screen.getByText(/Viewer chỉ thấy bảng/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Thêm category/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions for Audio' })).not.toBeInTheDocument();
    expect(screen.getByText(/Tổng/).parentElement).toHaveTextContent('1 category');
    expect(screen.getByText('Showing 1–1 of 1 categories')).toBeInTheDocument();
  });

  it('filters visible categories by name or slug and exposes row mutations through the action menu', async () => {
    api.getCategories.mockResolvedValueOnce(page([category, { id: 8, slug: 'laptops', name: 'Computers', isActive: true }]));
    renderPage();
    expect(await screen.findByText('Audio')).toBeInTheDocument();
    expect(screen.getByText('Computers')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search categories' }), 'laptop');
    expect(screen.queryByText('Audio')).not.toBeInTheDocument();
    expect(screen.getByText('Computers')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Computers' }));
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xoá' })).toBeInTheDocument();
  });

  it('independently exposes the allowed mutation action', async () => {
    renderPage(['categories.read', 'categories.update']);
    expect(await screen.findByText('Audio')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Thêm category/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Audio' }));
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xoá' })).not.toBeInTheDocument();
  });

  it('submits create, closes on success, then reloads the current page', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '+ Thêm category' }));
    await user.type(screen.getByLabelText('Slug'), 'new-cat');
    await user.type(screen.getByLabelText('Name'), 'New category');
    await user.click(screen.getByRole('button', { name: 'Lưu category' }));
    await waitFor(() => expect(api.createCategory).toHaveBeenCalledWith(requestAdmin, { slug: 'new-cat', name: 'New category', isActive: true }));
    expect(await screen.findByText('Audio')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.getCategories).toHaveBeenCalledTimes(2);
  });

  it('keeps failed form values and reports validation feedback', async () => {
    const user = userEvent.setup();
    api.createCategory.mockRejectedValueOnce(new Error('Slug already exists.'));
    renderPage();
    await user.click(await screen.findByRole('button', { name: '+ Thêm category' }));
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
    await user.click(await screen.findByRole('button', { name: 'Actions for Audio' }));
    await user.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(screen.getByLabelText('Active')).not.toBeChecked();
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Audio gear');
    await user.click(screen.getByLabelText('Active'));
    await user.click(screen.getByRole('button', { name: 'Lưu category' }));
    await waitFor(() => expect(api.updateCategory).toHaveBeenCalledWith(requestAdmin, 7, { slug: 'audio', name: 'Audio gear', isActive: true }));
    expect(api.getCategories).toHaveBeenCalledTimes(2);
  });

  it('deletes after confirmation and returns to the previous page when the final row is removed', async () => {
    const user = userEvent.setup();
    api.getCategories.mockResolvedValueOnce(page([category], 2, 21)).mockResolvedValueOnce(page([category], 1, 20));
    renderPage();
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions for Audio' }));
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(api.deleteCategory).toHaveBeenCalledWith(requestAdmin, 7));
    await waitFor(() => expect(api.getCategories).toHaveBeenLastCalledWith(requestAdmin, 1, 20));
    expect(await screen.findByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('disables all row mutations while a delete is pending', async () => {
    const user = userEvent.setup();
    let finishDelete!: () => void;
    api.deleteCategory.mockReturnValueOnce(new Promise<void>(resolve => { finishDelete = resolve; }));
    renderPage();
    await screen.findByText('Audio');
    await user.click(screen.getByRole('button', { name: 'Actions for Audio' }));
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    await user.click(screen.getByRole('button', { name: 'Actions for Audio' }));
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
    await user.click(screen.getByRole('button', { name: 'Actions for Audio' }));
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Delete restricted.');
    expect(screen.getByText('Audio')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions for Audio' }));
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
  });
});
