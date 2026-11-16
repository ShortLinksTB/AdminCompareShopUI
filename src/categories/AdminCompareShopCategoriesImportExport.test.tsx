// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import type { AdminRequest } from '../bannedItemsApi';
import { AdminCompareShopCategoriesImportExport } from './AdminCompareShopCategoriesImportExport';
import { CategoriesApiError, type CategoryImportDryRun } from './categories-api';

const api = vi.hoisted(() => ({ exportCategories: vi.fn(), dryRunCategoryImport: vi.fn(), commitCategoryImport: vi.fn() }));
vi.mock('./categories-api', async () => {
  const actual = await vi.importActual<typeof import('./categories-api')>('./categories-api');
  return { ...actual, ...api };
});

const requestAdmin: AdminRequest = vi.fn();
const validPreview: CategoryImportDryRun = {
  valid: true,
  blocked: false,
  errors: [],
  blockers: [],
  summary: { create: 1, update: 1, delete: 1 },
  changes: [
    { action: 'create', slug: 'wearables', before: null, after: { name: 'Wearables' } },
    { action: 'update', slug: 'audio', before: { name: 'Sound' }, after: { name: 'Audio' } },
    { action: 'delete', slug: 'old-category', before: { name: 'Old category' }, after: null },
  ],
};
const onApplied = vi.fn();
function renderActions(canImport = true) {
  return render(<AdminCompareShopCategoriesImportExport requestAdmin={requestAdmin} canImport={canImport} onApplied={onApplied} />);
}
function selectedFile(name = 'categories.json', size = 20) {
  return new File([JSON.stringify({ schemaVersion: 1, categories: [{ slug: 'audio' }] })], name, { type: 'application/json', lastModified: size });
}

describe('AdminCompareShopCategoriesImportExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.exportCategories.mockResolvedValue({ blob: new Blob(['{}']), filename: 'categories-2026-11-16.json' });
    api.dryRunCategoryImport.mockResolvedValue(validPreview);
    api.commitCategoryImport.mockResolvedValue({ summary: validPreview.summary, changes: validPreview.changes });
    onApplied.mockResolvedValue(undefined);
  });
  afterEach(() => cleanup());

  it('keeps export for read permission while omitting import without all write permissions', async () => {
    renderActions(false);
    expect(screen.getByRole('button', { name: /Export JSON/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import JSON/ })).not.toBeInTheDocument();
  });

  it('runs dry-run, shows per-slug changes, and commits only after exact confirmation', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByRole('button', { name: /Import JSON/ }));
    const input = screen.getByLabelText('Chọn file JSON') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [selectedFile()] } });

    expect(await screen.findByText(/Kiểm tra \(dry-run\)/)).toBeInTheDocument();
    expect(api.dryRunCategoryImport).toHaveBeenCalledWith(requestAdmin, expect.any(File));
    expect(screen.getByText('wearables')).toBeInTheDocument();
    expect(screen.getByText('+ Tạo mới')).toBeInTheDocument();
    expect(screen.getByText(/Sound → Audio/)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(screen.getByRole('button', { name: /Tải backup hiện tại/ })).toBeInTheDocument();
    const confirm = screen.getByRole('textbox');
    await user.type(confirm, 'ghi đè');
    expect(screen.getByRole('button', { name: 'Ghi đè toàn bộ' })).toBeDisabled();
    await user.clear(confirm);
    await user.type(confirm, 'GHI ĐÈ');
    expect(screen.getByRole('button', { name: 'Ghi đè toàn bộ' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Ghi đè toàn bộ' }));

    expect(await screen.findByText(/Import thành công/)).toBeInTheDocument();
    expect(api.commitCategoryImport).toHaveBeenCalledWith(requestAdmin, expect.any(File), 'GHI ĐÈ');
    expect(onApplied).toHaveBeenCalledOnce();
  });

  it('keeps commit success visible and reports refresh failure separately after commit', async () => {
    const user = userEvent.setup();
    onApplied.mockRejectedValueOnce(new Error('categories list unavailable'));
    renderActions();
    await user.click(screen.getByRole('button', { name: /Import JSON/ }));
    fireEvent.change(screen.getByLabelText('Chọn file JSON'), { target: { files: [selectedFile()] } });
    await screen.findByText(/Kiểm tra \(dry-run\)/);
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    await user.type(screen.getByRole('textbox'), 'GHI ĐÈ');
    await user.click(screen.getByRole('button', { name: 'Ghi đè toàn bộ' }));

    expect(await screen.findByText(/Import thành công/)).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('Import đã thành công, nhưng không làm mới được danh sách categories. categories list unavailable');
    expect(screen.queryByText(/Import thất bại/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dữ liệu hiện tại không được thay đổi/i)).not.toBeInTheDocument();
    expect(api.commitCategoryImport).toHaveBeenCalledOnce();
  });

  it('keeps validation errors and product-use blockers distinct and prevents commit', async () => {
    const user = userEvent.setup();
    api.dryRunCategoryImport.mockResolvedValueOnce({ ...validPreview, valid: false, errors: ['Dòng 4: parentSlug không có trong file'] });
    renderActions();
    await user.click(screen.getByRole('button', { name: /Import JSON/ }));
    fireEvent.change(screen.getByLabelText('Chọn file JSON'), { target: { files: [selectedFile()] } });
    expect(await screen.findByText(/File không hợp lệ/)).toBeInTheDocument();
    expect(screen.getByText(/parentSlug không có trong file/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled();

    api.dryRunCategoryImport.mockResolvedValueOnce({ ...validPreview, blocked: true, blockers: [{ slug: 'laptop', name: 'Laptop', productCount: 4 }] });
    await user.click(screen.getByRole('button', { name: '← Chọn file khác' }));
    fireEvent.change(screen.getByLabelText('Chọn file JSON'), { target: { files: [selectedFile('second.json')] } });
    expect(await screen.findByText('laptop')).toBeInTheDocument();
    expect(screen.getByText(/còn 4 sản phẩm/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled();
    expect(api.commitCategoryImport).not.toHaveBeenCalled();
  });

  it('rejects oversized and non-JSON files before calling dry-run', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByRole('button', { name: /Import JSON/ }));
    const input = screen.getByLabelText('Chọn file JSON');
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(1024 * 1024 + 1)], 'large.json')] } });
    expect(await screen.findByText('File vượt quá giới hạn 1 MB.')).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [selectedFile('categories.txt')] } });
    expect(await screen.findByText('Chỉ hỗ trợ file .json.')).toBeInTheDocument();
    expect(api.dryRunCategoryImport).not.toHaveBeenCalled();
  });

  it('displays request failures and conflict blockers without reporting success', async () => {
    const user = userEvent.setup();
    api.commitCategoryImport.mockRejectedValueOnce(new CategoriesApiError('Import bị chặn.', 409, [{ slug: 'audio', name: 'Audio', productCount: 2 }]));
    renderActions();
    await user.click(screen.getByRole('button', { name: /Import JSON/ }));
    fireEvent.change(screen.getByLabelText('Chọn file JSON'), { target: { files: [selectedFile()] } });
    await screen.findByText(/Kiểm tra \(dry-run\)/);
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    await user.type(screen.getByRole('textbox'), 'GHI ĐÈ');
    await user.click(screen.getByRole('button', { name: 'Ghi đè toàn bộ' }));
    expect(await screen.findByText(/Import bị chặn vì category vẫn còn sản phẩm/)).toBeInTheDocument();
    expect(screen.getByText(/còn 2 sản phẩm/)).toBeInTheDocument();
    expect(screen.queryByText(/Import thành công/)).not.toBeInTheDocument();
  });

  it('shows the pending request state and allows cancelling from the file step', async () => {
    const user = userEvent.setup();
    let resolve!: (value: CategoryImportDryRun) => void;
    api.dryRunCategoryImport.mockReturnValueOnce(new Promise<CategoryImportDryRun>(done => { resolve = done; }));
    renderActions();
    await user.click(screen.getByRole('button', { name: /Import JSON/ }));
    fireEvent.change(screen.getByLabelText('Chọn file JSON'), { target: { files: [selectedFile()] } });
    expect(screen.getByRole('status')).toHaveTextContent('Đang kiểm tra file…');
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled();
    resolve(validPreview);
    await waitFor(() => expect(screen.getByText(/Kiểm tra \(dry-run\)/)).toBeInTheDocument());
  });

  it('starts an immediate export download using the response filename', async () => {
    const user = userEvent.setup();
    const create = vi.fn(() => 'blob:categories');
    const revoke = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('categories-2026-11-16.json');
    });
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    renderActions(false);
    await user.click(screen.getByRole('button', { name: /Export JSON/ }));
    await waitFor(() => expect(api.exportCategories).toHaveBeenCalledWith(requestAdmin));
    expect(create).toHaveBeenCalledOnce();
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:categories'));
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
