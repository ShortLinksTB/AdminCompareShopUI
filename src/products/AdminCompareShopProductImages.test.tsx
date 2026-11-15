import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminCompareShopProductImages } from './AdminCompareShopProductImages';
import type { AdminRequest } from './products-api';

const rows = [
  { id: 'image-1', fileId: 'file-1', originalUrl: 'https://cdn.test/1.jpg', originalFileName: 'front.jpg', altText: 'Front', sortOrder: 0, card600Status: 'ready', card600FileId: 'small-1', detail1000Status: 'failed' },
  { id: 'image-2', fileId: 'file-2', originalUrl: 'https://cdn.test/2.jpg', originalFileName: 'back.jpg', altText: 'Back', sortOrder: 1, detail1000Status: 'unavailable' },
];
const files = { items: [
  { id: 'file-1', originalFileName: 'front.jpg', contentType: 'image/jpeg', sizeBytes: 100, width: 1200, height: 1200, uploadedBy: '', uploadedAtUtc: '' },
  { id: 'file-3', originalFileName: 'side.jpg', contentType: 'image/png', sizeBytes: 100, width: 1000, height: 1000, uploadedBy: '', uploadedAtUtc: '' },
  { id: 'file-4', originalFileName: 'top.jpg', contentType: 'image/png', sizeBytes: 100, width: 1000, height: 1000, uploadedBy: '', uploadedAtUtc: '' },
  { id: 'file-svg', originalFileName: 'qc-sl2370-svg-03825.svg', contentType: 'image/svg+xml', sizeBytes: 100, uploadedBy: '', uploadedAtUtc: '' },
] };
function setup(request: AdminRequest, permissions = ['products.read', 'products.update']) {
  return render(<MemoryRouter initialEntries={['/products/42/images']}><Routes><Route path="/products/:id/images" element={<AdminCompareShopProductImages requestAdmin={request} permissions={permissions} />} /></Routes></MemoryRouter>);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('AdminCompareShopProductImages', () => {
  it('uses the actual product images route, renders the gallery/detail/previews, and reorders with keyboard controls', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(path => path.includes('/images') ? Promise.resolve(Response.json({ productName: 'Phone', images: rows })) : Promise.resolve(Response.json(files)));
    setup(request);
    expect(await screen.findByText('Phone · Sắp xếp ảnh, chọn ảnh chính và xem trạng thái bản kích thước.')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/admin/products/42/images', expect.any(Object));
    expect(screen.getByRole('listitem', { name: /Ảnh 1.*ảnh chính/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Thư viện ảnh')).toBeInTheDocument();
    expect(screen.getByText('Thẻ trang chủ / danh sách')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('listitem', { name: /Ảnh 2/ }));
    fireEvent.click(screen.getByRole('button', { name: '★ Đặt làm ảnh chính' }));
    expect(screen.getByRole('listitem', { name: /Ảnh 1.*back.jpg/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Chưa lưu')).toBeInTheDocument();
  });

  it('keeps the draft after a failed save and retries the full replacement payload', async () => {
    let gets = 0;
    let puts = 0;
    const request = vi.fn<AdminRequest>().mockImplementation((path, init) => {
      if (init?.method === 'PUT') {
        puts += 1;
        return Promise.resolve(puts === 1 ? new Response(null, { status: 503 }) : new Response(null, { status: 204 }));
      }
      if (!path.includes('/images')) return Promise.resolve(Response.json(files));
      if (path.includes('/images')) {
        gets += 1;
        return Promise.resolve(Response.json({ productName: 'Phone', images: rows }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    setup(request);
    await screen.findByRole('listitem', { name: /front.jpg/ });
    fireEvent.click(screen.getByRole('listitem', { name: /Ảnh 2/ }));
    fireEvent.click(screen.getByRole('button', { name: '★ Đặt làm ảnh chính' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('lỗi 503');
    expect(screen.getByRole('listitem', { name: /Ảnh 1.*back.jpg/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(gets).toBe(2));
    expect(screen.getByText('Đã lưu')).toBeInTheDocument();
    const put = request.mock.calls.filter(([, init]) => init?.method === 'PUT').at(-1);
    expect(JSON.parse(String(put?.[1]?.body)).map((image: { fileId: string; sortOrder: number }) => [image.fileId, image.sortOrder])).toEqual([['file-2', 0], ['file-1', 1]]);
  });

  it('selects multiple Files and removes only the product association from the draft', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(path => path.includes('/images') ? Promise.resolve(Response.json({ images: rows })) : Promise.resolve(Response.json(files)));
    setup(request);
    await screen.findByRole('listitem', { name: /front.jpg/ });
    fireEvent.click(screen.getAllByRole('button', { name: '＋ Thêm ảnh' })[0]);
    expect(await screen.findByText(/side.jpg/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /side.jpg/ }));
    fireEvent.click(screen.getByRole('button', { name: /top.jpg/ }));
    expect(screen.getByRole('button', { name: 'Thêm 2 ảnh' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm 2 ảnh' }));
    expect(await screen.findByText('Đã thêm 2 ảnh; API sẽ tự tạo bản 600 × 600 và 1000 × 1000 khi lưu.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ khỏi sản phẩm' }));
    expect(screen.getByText('Chưa lưu')).toBeInTheDocument();
    expect(request.mock.calls.some(([path, init]) => init?.method === 'DELETE' && path.includes('/files/'))).toBe(false);
    expect(within(screen.getByLabelText('Thư viện ảnh')).getAllByRole('listitem')).toHaveLength(3);
  });

  it('keeps the derivative option enabled and defaults on, filters SVG, and shows a deliberate preview fallback', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(path => path.startsWith('/admin/products/42/images') ? Promise.resolve(Response.json({ images: [] })) : Promise.resolve(Response.json(files)));
    setup(request);
    await screen.findByText('Chưa có ảnh nào');
    fireEvent.click(screen.getAllByRole('button', { name: '＋ Thêm ảnh' })[0]);
    const derivativeOption = await screen.findByRole('checkbox', { name: /Tự tạo bản/ });
    expect(derivativeOption).toBeEnabled();
    expect(derivativeOption).toBeChecked();
    expect(screen.queryByText('qc-sl2370-svg-03825.svg')).not.toBeInTheDocument();
    expect(await screen.findByText('side.jpg')).toBeInTheDocument();
    const preview = document.querySelector('.product-images-file-grid img');
    if (preview) fireEvent.error(preview);
    expect(await screen.findByLabelText('Không xem trước được')).toBeInTheDocument();
    fireEvent.click(derivativeOption);
    expect(screen.getByText(/Chỉ liên kết ảnh gốc/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    fireEvent.click(screen.getAllByRole('button', { name: '＋ Thêm ảnh' })[0]);
    expect(await screen.findByRole('checkbox', { name: /Tự tạo bản/ })).toBeChecked();
  });

  it('shows a retryable load error and renders the empty gallery after a successful retry', async () => {
    let calls = 0;
    const request = vi.fn<AdminRequest>().mockImplementation(() => {
      calls += 1;
      return Promise.resolve(calls === 1 ? new Response(null, { status: 503 }) : Response.json({ productName: 'Empty product', images: [] }));
    });
    setup(request);
    expect(await screen.findByRole('alert')).toHaveTextContent('lỗi 503');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Chưa có ảnh nào')).toBeInTheDocument();
    expect(screen.getByText('Empty product · Sắp xếp ảnh, chọn ảnh chính và xem trạng thái bản kích thước.')).toBeInTheDocument();
  });

  it('creates available derivatives independently and keeps failures retryable', async () => {
    const single = [{ id: 'one', fileId: 'source-1', sourceUrl: 'https://cdn.test/source.jpg', originalFileName: 'source.jpg', altText: '', sortOrder: 0, derivative600Status: 'failed', derivative1000Status: 'failed' }];
    let derivativeCalls = 0;
    const request = vi.fn<AdminRequest>().mockImplementation((path, init) => {
      if (path.endsWith('/derivatives')) {
        derivativeCalls += 1;
        return Promise.resolve(Response.json({ ...single[0], derivative600Status: 'ready', derivative1000Status: derivativeCalls === 1 ? 'failed' : 'ready', url600: 'https://cdn.test/small.jpg' }));
      }
      if (path.endsWith('/images') && init?.method === 'PUT') return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(Response.json({ productName: 'Phone', images: single }));
    });
    setup(request);
    await screen.findByRole('listitem', { name: /source.jpg/ });
    fireEvent.click(screen.getAllByRole('button', { name: 'Thử lại' })[0]);
    expect(await screen.findByText('Đã thử tạo lại các bản ảnh.')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/admin/products/42/images/one/derivatives', expect.objectContaining({ method: 'POST' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Đã thử tạo lại các bản ảnh.')).toBeInTheDocument();
    expect(derivativeCalls).toBe(2);
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeEnabled();
  });

  it('disables edits without products.update and undoes a pending gallery change', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(path => Promise.resolve(Response.json(path.includes('/images') ? { images: rows } : files)));
    setup(request, ['products.read']);
    await screen.findByRole('listitem', { name: /front.jpg/ });
    expect(screen.getByDisplayValue('Front')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();
    fireEvent.click(screen.getByRole('listitem', { name: /Ảnh 2/ }));
    expect(screen.getByRole('button', { name: '★ Đặt làm ảnh chính' })).toBeDisabled();
  });

  it('reports Files loading errors and can retry the picker request', async () => {
    let fileLoads = 0;
    const request = vi.fn<AdminRequest>().mockImplementation(path => {
      if (path.includes('/images')) return Promise.resolve(Response.json({ images: rows }));
      if (path === '/admin/products/42') return Promise.resolve(Response.json({ name: 'Phone' }));
      fileLoads += 1;
      return Promise.resolve(fileLoads === 1 ? new Response(null, { status: 500 }) : Response.json(files));
    });
    setup(request);
    await screen.findByRole('listitem', { name: /front.jpg/ });
    fireEvent.click(screen.getAllByRole('button', { name: '＋ Thêm ảnh' })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('status 500');
    fireEvent.click(screen.getByRole('button', { name: 'Thử tải lại' }));
    expect(await screen.findByText(/side.jpg/)).toBeInTheDocument();
    expect(fileLoads).toBe(2);
  });

  it('edits alt text and restores the saved draft with Undo', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(path => Promise.resolve(Response.json(path.includes('/images') ? { images: rows } : files)));
    setup(request);
    await screen.findByRole('listitem', { name: /front.jpg/ });
    const alt = screen.getByLabelText(/Mô tả ảnh \(alt\)/);
    fireEvent.change(alt, { target: { value: 'Góc trước' } });
    expect(screen.getByText('Chưa lưu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(screen.getByLabelText(/Mô tả ảnh \(alt\)/)).toHaveValue('Front');
    expect(screen.getByText('Đã lưu')).toBeInTheDocument();
  });

  it('uploads a new image through Files before associating it with the draft', async () => {
    const upload = new File(['image'], 'new.png', { type: 'image/png' });
    const uploaded = { id: 'uploaded-1', originalFileName: 'new.png', contentType: 'image/png', sizeBytes: 5, width: 1000, height: 1000, uploadedBy: '', uploadedAtUtc: '' };
    const request = vi.fn<AdminRequest>().mockImplementation((path, init) => {
      if (path.includes('/images')) return Promise.resolve(Response.json({ images: rows }));
      if (path === '/admin/files') return Promise.resolve(new Response(null, { status: 201 }));
      if (path.includes('q=new.png')) return Promise.resolve(Response.json({ items: [uploaded] }));
      if (path.startsWith('/admin/files?')) return Promise.resolve(Response.json(files));
      return Promise.resolve(new Response(null, { status: init?.method === 'POST' ? 200 : 404 }));
    });
    setup(request);
    await screen.findByRole('listitem', { name: /front.jpg/ });
    fireEvent.click(screen.getAllByRole('button', { name: '＋ Thêm ảnh' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Tải ảnh mới' }));
    expect(screen.getByRole('checkbox', { name: /Tự tạo bản/ })).toBeEnabled();
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [upload] } });
    expect(await screen.findByText(/Đã thêm 1 ảnh/)).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/admin/files', expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));
    expect(request.mock.calls.some(([path]) => path.includes('/derivatives'))).toBe(false);
    expect(screen.getByRole('listitem', { name: /new.png/ })).toBeInTheDocument();
  });
});
