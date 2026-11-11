import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MatchingPage } from './MatchingPage';
import type { AdminRequest } from './matching-api';

const item = { id: 12, name: 'Laptop source', brand: 'Acme', externalSku: 'SKU-12', dataSourceId: 4, verdict: 'review', status: 'pending', groupKey: 'g1', source: { imageUrl: 'https://img.example/laptop.jpg', price: 24990000, shopName: 'Shop One' }, attributes: { brand: 'Acme', line: 'Notebook', ram: '16GB' }, candidates: [{ productId: 71, name: 'Laptop product', brand: 'Acme', score: 0.9, level: 'review', differences: [{ attribute: 'RAM', source: '16GB', candidate: '8GB', kind: 'diff' }] }] };
const page = (items = [item]) => Response.json({ items, page: 1, pageSize: 20, total: items.length, counts: { all: 4, pending: 3, skipped: 1, confident: 1, review: 1, likely_new: 1, likely_skip: 1 } });
const request = (responses: Response[]) => vi.fn<AdminRequest>().mockImplementation(async (path, init) => {
  if (path.startsWith('/admin/matching?')) return responses.shift() ?? page([]);
  return responses.shift() ?? new Response(null, { status: 204 });
});
const renderPage = (admin: AdminRequest, permissions = ['matching.approve', 'products.create']) => render(<MatchingPage requestAdmin={admin} permissions={permissions} />);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('MatchingPage', () => {
  it('loads the Studio queue, compares attributes and deliberately approves only the selected candidate', async () => {
    const admin = request([page(), new Response(null, { status: 204 }), page([])]);
    renderPage(admin);
    expect(await screen.findByRole('heading', { name: 'Laptop source' })).toBeInTheDocument();
    expect(screen.getByText('Shop One · SKU SKU-12 · 24.990.000 ₫')).toBeInTheDocument();
    expect(screen.getByText('16GB')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Laptop product/ }));
    expect(screen.getByText('8GB')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Duyệt/ }));
    await waitFor(() => expect(admin).toHaveBeenCalledWith('/admin/matching/12/approve', expect.objectContaining({ method: 'POST', body: '{"productId":71}' })));
  });

  it('filters the queue by verdict and search query and distinguishes loading errors from empty results', async () => {
    const admin = vi.fn<AdminRequest>().mockImplementation(async path => path.includes('q=acme') ? new Response('', { status: 503 }) : path.includes('verdict=likely_new') ? page([]) : page());
    renderPage(admin);
    await screen.findByRole('heading', { name: 'Laptop source' });
    fireEvent.click(screen.getByRole('button', { name: /Sản phẩm mới/ }));
    await waitFor(() => expect(admin.mock.calls.some(([path]) => String(path).includes('verdict=likely_new'))).toBe(true));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'acme' } });
    await waitFor(() => expect(admin.mock.calls.some(([path]) => String(path).includes('q=acme'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /Làm mới/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được hàng đợi');
    expect(screen.queryByText('Hàng đợi đã được xử lý')).not.toBeInTheDocument();
  });

  it('shows explicit create controls only with products.create and supports Files image selection', async () => {
    const files = { items: [{ id: 'file-guid', originalFileName: 'laptop.png', contentType: 'image/png', sizeBytes: 1000, width: 1000, height: 1000, uploadedBy: 'tester', uploadedAtUtc: '' }] };
    const admin = vi.fn<AdminRequest>().mockImplementation(async path => path.startsWith('/admin/matching?') ? page() : path.startsWith('/admin/files?') ? Response.json(files) : new Response(null, { status: 204 }));
    renderPage(admin);
    await screen.findByRole('heading', { name: 'Laptop source' });
    fireEvent.click(screen.getByRole('button', { name: /Tạo sản phẩm mới/ }));
    fireEvent.click(screen.getByRole('button', { name: /Chọn ảnh từ Files/ }));
    expect(await screen.findByText('laptop.png')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /laptop.png/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Dùng ảnh này' }));
    expect(screen.getByRole('button', { name: /Tạo và gắn/ })).toBeEnabled();
    cleanup();
    renderPage(request([page()]), ['matching.approve']);
    await screen.findByRole('heading', { name: 'Laptop source' });
    expect(screen.queryByRole('button', { name: /Tạo sản phẩm mới/ })).not.toBeInTheDocument();
  });

  it('submits skip reason and note, then restores skipped records', async () => {
    const skipped = { ...item, status: 'skipped' };
    const admin = vi.fn<AdminRequest>().mockImplementation(async (path, init) => {
      if (path.startsWith('/admin/matching?')) return path.includes('status=skipped') ? page([skipped]) : page();
      return new Response(null, { status: 204 });
    });
    renderPage(admin);
    await screen.findByRole('heading', { name: 'Laptop source' });
    fireEvent.click(screen.getByRole('button', { name: /Bỏ qua/ }));
    fireEvent.change(screen.getByLabelText('Ghi chú (tuỳ chọn)'), { target: { value: 'phụ kiện' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua và lưu lý do' }));
    await waitFor(() => expect(admin).toHaveBeenCalledWith('/admin/matching/12/skip', expect.objectContaining({ body: '{"reason":"not_product","note":"phụ kiện"}' })));
    fireEvent.click(screen.getByRole('button', { name: /Đã bỏ qua/ }));
    expect(await screen.findByRole('button', { name: 'Khôi phục' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));
    await waitFor(() => expect(admin).toHaveBeenCalledWith('/admin/matching/12/restore', { method: 'POST' }));
  });

  it('guards keyboard shortcuts while typing and allows list navigation and image lightbox', async () => {
    const admin = request([page()]);
    renderPage(admin);
    await screen.findByRole('heading', { name: 'Laptop source' });
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 's' });
    expect(screen.queryByRole('dialog', { name: 'Bỏ qua mặt hàng' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('button', { name: 'Mở ảnh mặt hàng' }));
    expect(screen.getByRole('dialog', { name: 'Xem ảnh' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Xem ảnh' })).not.toBeInTheDocument();
  });
});
