// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { CategoriesPage } from './CategoriesPage';
import type { AdminRequest } from '../bannedItemsApi';
import type { AdminCategory } from './categories-api';

const api = vi.hoisted(() => ({ getCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn() }));
vi.mock('./categories-api', async () => {
  const actual = await vi.importActual<typeof import('./categories-api')>('./categories-api');
  return { ...actual, ...api };
});

const category: AdminCategory = { id: 42, slug: 'phones', name: 'Phones', isActive: false };
const page = (items = [category], pageNumber = 1, totalItems = items.length, pageSize = 20) => ({ items, pageNumber, pageSize, totalItems });
const requestAdmin: AdminRequest = vi.fn();

function renderPage(permissions = ['categories.read', 'categories.create', 'categories.update', 'categories.delete']) {
  return render(<CategoriesPage requestAdmin={requestAdmin} permissions={permissions} />);
}

describe('Categories page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getCategories.mockResolvedValue(page());
    api.createCategory.mockResolvedValue(category);
    api.updateCategory.mockResolvedValue(category);
    api.deleteCategory.mockResolvedValue(undefined);
  });
  afterEach(() => cleanup());

  it('keeps the wireframe hierarchy and renders only the contract table fields', async () => {
    renderPage();
    expect(await screen.findByText('Phones')).toBeInTheDocument();
    expect(screen.getByText('SYSTEM')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Categories' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Id' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Slug' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /active/i })).not.toBeInTheDocument();
    expect(screen.getByText('phones')).toBeInTheDocument();
  });

  it('shows loading, successful empty results, and a retryable error without mock data', async () => {
    let resolve!: (value: ReturnType<typeof page>) => void;
    api.getCategories.mockReturnValueOnce(new Promise<ReturnType<typeof page>>(done => { resolve = done; }));
    const { rerender } = renderPage();
    expect(screen.getByRole('status', { name: 'Đang tải categories' })).toBeInTheDocument();
    resolve(page([]));
    expect(await screen.findByText('Chưa có category nào')).toBeInTheDocument();

    api.getCategories.mockRejectedValueOnce(new Error('offline'));
    rerender(<CategoriesPage requestAdmin={vi.fn()} permissions={['categories.read']} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
    expect(screen.queryByText('Phones')).not.toBeInTheDocument();
    api.getCategories.mockResolvedValueOnce(page());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Phones')).toBeInTheDocument();
  });

  it('gates create, update, and delete independently by permission', async () => {
    renderPage(['categories.read', 'categories.update']);
    expect(await screen.findByText('Phones')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Thêm category' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xoá' })).not.toBeInTheDocument();
  });

  it('keeps the table visible when a delete fails', async () => {
    const user = userEvent.setup();
    api.deleteCategory.mockRejectedValueOnce(new Error('Delete restricted.'));
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Xoá' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Delete restricted.');
    expect(screen.getByText('Phones')).toBeInTheDocument();
  });

  it('keeps form values and isActive on edit after a validation error', async () => {
    const user = userEvent.setup();
    api.updateCategory.mockRejectedValueOnce(new Error('Slug already exists.'));
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Sửa' }));
    expect(screen.getByLabelText('Đang hoạt động')).not.toBeChecked();
    await user.clear(screen.getByLabelText('Slug'));
    await user.type(screen.getByLabelText('Slug'), 'duplicate');
    await user.click(screen.getByRole('button', { name: 'Lưu category' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Slug already exists.');
    expect(screen.getByLabelText('Slug')).toHaveValue('duplicate');
    expect(screen.getByLabelText('Name')).toHaveValue('Phones');
    expect(screen.getByLabelText('Đang hoạt động')).not.toBeChecked();
  });

  it('creates contract data then refetches, and moves back after deleting the last row on a page', async () => {
    const user = userEvent.setup();
    api.getCategories.mockResolvedValueOnce(page([category], 2, 21)).mockResolvedValueOnce(page([category], 2, 21)).mockResolvedValueOnce(page([category], 2, 21));
    renderPage();
    await user.click(await screen.findByRole('button', { name: '+ Thêm category' }));
    await user.type(screen.getByLabelText('Slug'), 'audio');
    await user.type(screen.getByLabelText('Name'), 'Audio');
    await user.click(screen.getByRole('button', { name: 'Lưu category' }));
    await waitFor(() => expect(api.createCategory).toHaveBeenCalledWith(requestAdmin, { slug: 'audio', name: 'Audio', isActive: true }));
    expect(await screen.findByText('Phones')).toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    api.getCategories.mockResolvedValueOnce(page([category], 1, 20));
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(api.deleteCategory).toHaveBeenCalledWith(requestAdmin, 42));
    await waitFor(() => expect(api.getCategories).toHaveBeenLastCalledWith(requestAdmin, 1, 20, expect.any(AbortSignal)));
  });
});
