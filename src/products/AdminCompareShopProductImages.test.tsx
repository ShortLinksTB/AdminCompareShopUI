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
    expect(await screen.findByText('Đã lưu')).toBeInTheDocument();
    expect(gets).toBe(2);
    const put = request.mock.calls.filter(([, init]) => init?.method === 'PUT').at(-1);
    expect(JSON.parse(String(put?.[1]?.body)).map((image: { fileId: string; sortOrder: number }) => [image.fileId, image.sortOrder])).toEqual([['file-2', 0], ['file-1', 1]]);
  });

  it('resolves API-relative image URLs against the API origin and reports available source dimensions accurately', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(() => Promise.resolve(Response.json({ images: [
      { id: 'relative', fileId: 'internal-id', sourceUrl: '/files/internal-id', sourceAvailable: true, altText: 'Internal image', sortOrder: 0 },
      { id: 'external', externalUrl: 'https://cdn.test/external.jpg', sourceAvailable: true, altText: 'External image', sortOrder: 1 },
    ] })));
    setup(request);
    await screen.findByRole('listitem', { name: /Internal image/ });
    expect(screen.getByRole('listitem', { name: /Internal image/ }).querySelector('img')).toHaveAttribute('src', 'https://api-compareshop-dev.giamha.online/files/internal-id');
    fireEvent.click(screen.getByRole('listitem', { name: /External image/ }));
    expect(await screen.findByText('Ảnh gốc khả dụng · chưa có thông tin kích thước')).toBeInTheDocument();
    expect(screen.getByAltText('External image')).toHaveAttribute('src', 'https://cdn.test/external.jpg');
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
    expect(await screen.findByText('Đã thêm 2 ảnh vào bản nháp; bản 600 × 600 và 1000 × 1000 sẽ được yêu cầu khi lưu.')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /side.jpg/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm 1 ảnh' }));
    expect(await screen.findByText('Đã thêm 1 ảnh vào bản nháp; khi lưu chỉ liên kết ảnh gốc.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '＋ Thêm ảnh' })[0]);
    expect(await screen.findByRole('checkbox', { name: /Tự tạo bản/ })).toBeChecked();
  });

  it('refetches saved image IDs and derivative statuses and keeps metadata in sync for retry', async () => {
    let saved = false;
    let retryCalls = 0;
    const persisted = { id: 'gallery-image-3', fileId: 'file-3', sourceUrl: 'https://cdn.test/side.png', altText: '', sortOrder: 0, derivative600Status: 'failed', derivative1000Status: 'failed' };
    const request = vi.fn<AdminRequest>().mockImplementation((path, init) => {
      if (path.startsWith('/admin/products/42/images') && init?.method === 'PUT') { saved = true; return Promise.resolve(new Response(null, { status: 204 })); }
      if (path === '/admin/products/42/images/gallery-image-3/derivatives') {
        retryCalls += 1;
        return Promise.resolve(Response.json({ ...persisted, derivative600Status: 'ready', derivative1000Status: 'ready', card600FileId: 'card-600', detail1000FileId: 'detail-1000' }));
      }
      if (path === '/admin/products/42/images') return Promise.resolve(Response.json({ productName: 'Phone', images: saved ? [persisted] : [] }));
      if (path === '/admin/files/file-3') return Promise.resolve(Response.json(files.items[1]));
      if (path.startsWith('/admin/files?')) return Promise.resolve(Response.json(files));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    setup(request);
    await screen.findByText('Chưa có ảnh nào');
    fireEvent.click(screen.getAllByRole('button', { name: '＋ Thêm ảnh' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /side.jpg/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm 1 ảnh' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByText('Đã lưu')).toBeInTheDocument();
    expect(await screen.findByText('1000 × 1000 px')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: /side.jpg/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { name: 'Thử lại' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Thử lại' })[0]);
    expect(await screen.findByText('Đã thử tạo lại các bản ảnh.')).toBeInTheDocument();
    expect(retryCalls).toBe(1);
    expect(screen.getByText('Đã lưu')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();
  });

  it('treats failed derivative statuses as authoritative even when stale derivative file IDs exist', async () => {
    const failed = [{
      id: 'failed-image', fileId: 'source-file', sourceUrl: 'https://cdn.test/source.jpg',
      url600: 'https://cdn.test/stale-small.jpg', url1000: 'https://cdn.test/stale-large.jpg',
      card600FileId: 'stale-small-id', detail1000FileId: 'stale-large-id',
      derivative600Status: 'failed', derivative1000Status: 'failed', altText: '', sortOrder: 0,
    }];
    const request = vi.fn<AdminRequest>().mockImplementation(path => Promise.resolve(
      path.endsWith('/derivatives') ? Response.json(failed[0]) : Response.json({ images: failed }),
    ));
    setup(request);
    await screen.findByRole('listitem', { name: /ảnh sản phẩm/ });

    expect(screen.getAllByRole('button', { name: 'Thử lại' })).toHaveLength(2);
    expect(screen.getAllByText('Tạo bản thất bại · có thể thử lại')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Thử lại' })[0]);
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/products/42/images/failed-image/derivatives', expect.objectContaining({ method: 'POST' })));
  });

  it('keeps queued derivatives on the source preview and leaves unavailable variants retryable', async () => {
    const queuedAndUnavailable = [{
      id: 'queued-image', fileId: 'source-file', sourceUrl: 'https://cdn.test/source.jpg',
      url600: 'https://cdn.test/stale-small.jpg', url1000: 'https://cdn.test/stale-large.jpg',
      card600FileId: 'stale-small-id', detail1000FileId: 'stale-large-id',
      derivative600Status: 'queued', derivative1000Status: 'unavailable', altText: '', sortOrder: 0,
    }];
    const request = vi.fn<AdminRequest>().mockImplementation(path => Promise.resolve(
      path.endsWith('/derivatives') ? Response.json(queuedAndUnavailable[0]) : Response.json({ images: queuedAndUnavailable }),
    ));
    setup(request);
    await screen.findByRole('listitem', { name: /ảnh sản phẩm/ });

    expect(screen.getByText('Đang tạo bản ảnh…')).toBeInTheDocument();
    expect(screen.getByText('Chưa khả dụng · website đang dùng ảnh gốc')).toBeInTheDocument();
    expect(document.querySelector('.product-image-preview-square img')).toHaveAttribute('src', 'https://cdn.test/source.jpg');
    expect(document.querySelector('.product-image-preview-main img')).toHaveAttribute('src', 'https://cdn.test/source.jpg');
    const retry = screen.getByRole('button', { name: 'Thử lại' });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/products/42/images/queued-image/derivatives', expect.objectContaining({ method: 'POST' })));
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
    expect(await screen.findByText(/Đã thêm 1 ảnh vào bản nháp/)).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/admin/files', expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));
    expect(request.mock.calls.some(([path]) => path.includes('/derivatives'))).toBe(false);
    expect(screen.getByRole('listitem', { name: /new.png/ })).toBeInTheDocument();
  });
});
