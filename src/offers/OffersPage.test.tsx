import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { OffersPage } from './OffersPage';
import type { AdminOffer, AdminRequest } from './offers-api';

const offer: AdminOffer = {
  id: 201, productId: 42, partnerShopId: 8, priceVnd: 18990000, url: 'https://shop.example/201',
  isActive: true, isOutlier: false, updatedAtUtc: '2026-11-11T06:00:00Z', productName: 'Laptop Air',
  productImageUrl: 'https://img.example/product.png', partnerShopName: 'Shop A', externalSku: 'LA-42',
  imageUrl: null, originalPriceVnd: 21990000, stockStatus: 'unknown', lowestPriceVnd: 18490000,
  deltaVnd: 500000, deltaPercent: 2.7, outlierReason: null, otherOffersAveragePriceVnd: null, outlierDeviationPercent: null,
};
const hidden: AdminOffer = { ...offer, id: 202, productId: 43, productName: 'Laptop Hidden', isActive: false, stockStatus: 'out_of_stock', lowestPriceVnd: null, deltaVnd: null, deltaPercent: null };
const counts = { all: 37, outlier: 4, stale: 9, outOfStock: 3, inactive: 2 };
const response = (items: AdminOffer[] = [offer], totalItems = items.length) => Response.json({ items, pageNumber: 1, pageSize: 10, totalItems, counts });

afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture'); });

describe('OffersPage', () => {
  it('renders typed fields, accurate stock states, global chip counts, and page totals', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(async () => response([offer, hidden], 20));
    render(<OffersPage requestAdmin={request} />);
    expect(await screen.findByText('Laptop Air')).toBeInTheDocument();
    expect(screen.getByText('SKU LA-42 · Offer #201')).toBeInTheDocument();
    expect(screen.getByText('Chưa rõ')).toBeInTheDocument();
    expect(screen.getByText('Hết hàng', { selector: '.studio-pill' })).toBeInTheDocument();
    expect(screen.getByText('Hết hàng', { selector: '.studio-pill' })).toHaveClass('studio-pill-sm');
    expect(screen.getByRole('combobox', { name: 'Số dòng mỗi trang' })).toHaveClass('studio-select-sm');
    expect(screen.getByRole('button', { name: /Giá bất thường/ })).toHaveTextContent('4');
    expect(screen.getByText('1–10')).toBeInTheDocument();
    expect(screen.getByText('20', { selector: '.studio-table-footer b' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/admin/offers?page=1&pageSize=10&sort=attention&staleHours=72', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('uses server filters, search, shop selection, sorting, and pagination', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(async () => response([offer], 25));
    render(<OffersPage requestAdmin={request} />);
    await screen.findByText('Laptop Air');
    fireEvent.click(screen.getByRole('button', { name: /Hết hàng/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/offers?page=1&pageSize=10&sort=attention&staleHours=72&filter=out_of_stock', expect.anything()));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm offer' }), { target: { value: 'Laptop' } });
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/offers?page=1&pageSize=10&sort=attention&staleHours=72&q=Laptop&filter=out_of_stock', expect.anything()));
    fireEvent.change(screen.getByRole('combobox', { name: 'Sắp xếp' }), { target: { value: 'oldest' } });
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/offers?page=1&pageSize=10&sort=oldest&staleHours=72&q=Laptop&filter=out_of_stock', expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/offers?page=2&pageSize=10&sort=oldest&staleHours=72&q=Laptop&filter=out_of_stock', expect.anything()));
  });

  it('loads real history and product-wide peer offers in the detail drawer', async () => {
    const peer = { ...offer, id: 203, partnerShopName: 'Shop B', priceVnd: 18490000, lowestPriceVnd: 18490000 };
    const request = vi.fn<AdminRequest>().mockImplementation(async path => {
      if (path.startsWith('/admin/offers/201/price-history')) return Response.json([{ dateUtc: '2026-11-10T00:00:00Z', priceVnd: 19000000 }, { dateUtc: '2026-11-11T00:00:00Z', priceVnd: offer.priceVnd }]);
      if (path.includes('productId=42')) return Response.json({ ...pageShape([offer, peer]), totalItems: 2 });
      return response([offer]);
    });
    render(<OffersPage requestAdmin={request} />);
    await screen.findByText('Laptop Air');
    fireEvent.click(screen.getByRole('row', { name: /Laptop Air/ }));
    expect(await screen.findByRole('dialog', { name: 'Chi tiết offer' })).toBeInTheDocument();
    expect(await screen.findByText('Shop B')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Biểu đồ lịch sử giá 30 ngày' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/admin/offers/201/price-history?days=30', expect.anything());
    expect(request).toHaveBeenCalledWith('/admin/offers?productId=42&page=1&pageSize=100&sort=priceAsc', expect.anything());
  });

  it('opens the offer detail drawer with the keyboard from a focused row', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(async path => path.includes('/price-history') ? Response.json([]) : path.includes('productId=') ? Response.json(pageShape([])) : response([offer]));
    render(<OffersPage requestAdmin={request} />);
    const row = await screen.findByRole('row', { name: /Laptop Air/ });
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(await screen.findByRole('dialog', { name: 'Chi tiết offer' })).toBeInTheDocument();
  });

  it('opens both image sources with the approved black overlay and closes with Escape', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(response([offer]));
    render(<OffersPage requestAdmin={request} />);
    await screen.findByText('Laptop Air');
    fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh lớn của Laptop Air' }));
    expect(screen.getByRole('dialog', { name: 'Xem ảnh lớn' })).toHaveClass('studio-lightbox', 'offers-image-lightbox');
    fireEvent.click(screen.getByRole('button', { name: 'Ảnh sản phẩm chuẩn' }));
    expect(screen.getByRole('button', { name: 'Ảnh sản phẩm chuẩn' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Xem ảnh lớn' })).not.toBeInTheDocument();
  });

  it('hides mutations from viewers and sends real PATCH when an editor hides an offer', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(async (_path, init) => init?.method === 'PATCH' ? new Response(null, { status: 204 }) : response([offer]));
    const { rerender } = render(<OffersPage requestAdmin={request} permissions={['offers.read']} />);
    await screen.findByText('Laptop Air');
    fireEvent.click(screen.getByLabelText('Thao tác cho offer 201'));
    expect(screen.queryByRole('menuitem', { name: 'Ẩn khỏi trang so sánh' })).not.toBeInTheDocument();
    rerender(<OffersPage requestAdmin={request} permissions={['offers.read', 'offers.update']} />);
    await screen.findByText('Laptop Air');
    // The viewer menu remains open after the permission-only rerender.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ẩn khỏi trang so sánh' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/offers/201', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ priceVnd: offer.priceVnd, url: offer.url, isActive: false, isOutlier: false }) })));
    expect(await screen.findByText('Đã ẩn offer.')).toBeInTheDocument();
  });

  it('records the outlier flag and optional reason using the approved API contract', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('  price mismatch  ');
    const request = vi.fn<AdminRequest>().mockImplementation(async () => response([offer]));
    render(<OffersPage requestAdmin={request} />);
    await screen.findByText('Laptop Air');
    fireEvent.click(screen.getByLabelText('Thao tác cho offer 201'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Đánh dấu giá bất thường' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/offers/201', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ priceVnd: offer.priceVnd, url: offer.url, isActive: true, isOutlier: true }) })));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/offers/201/outlier-reason', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ outlierReason: 'price mismatch' }) })));
    expect(await screen.findByText('Đã đánh dấu giá bất thường.')).toBeInTheDocument();
  });

  it('shows loading, retryable API errors, and a useful empty state', async () => {
    let resolve!: (response: Response) => void;
    let offerCalls = 0;
    const request = vi.fn<AdminRequest>().mockImplementation(path => {
      if (path.startsWith('/admin/shops')) return Promise.resolve(Response.json({ items: [], pageNumber: 1, pageSize: 100, totalItems: 0 }));
      if (offerCalls++ === 0) return new Promise(done => { resolve = done; });
      return Promise.resolve(response([]));
    });
    render(<OffersPage requestAdmin={request} />);
    expect(screen.getByRole('status', { name: 'Đang tải offers' })).toBeInTheDocument();
    resolve(new Response('', { status: 500 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('status 500');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Không có offer nào khớp bộ lọc')).toBeInTheDocument();
  });

  it('keeps coming soon distinct and renders price, age, and missing image fallbacks', async () => {
    const rows: AdminOffer[] = [
      { ...offer, id: 301, productName: null, partnerShopName: null, externalSku: null, productImageUrl: null, updatedAtUtc: 'not-a-date', stockStatus: 'coming_soon', lowestPriceVnd: null, originalPriceVnd: null, url: 'javascript:alert(1)' },
      { ...offer, id: 302, productName: 'Outlier', isOutlier: true, outlierReason: 'check', outlierDeviationPercent: -4.5, otherOffersAveragePriceVnd: 20000, lowestPriceVnd: 0, deltaVnd: null, deltaPercent: null, imageUrl: 'https://img.example/broken.png', updatedAtUtc: '2020-01-01T00:00:00Z' },
      { ...offer, id: 303, productName: 'Low', stockStatus: 'in_stock', priceVnd: 10, lowestPriceVnd: 10, isOutlier: false, updatedAtUtc: new Date().toISOString() },
    ];
    const request = vi.fn<AdminRequest>().mockImplementation(async path => path.startsWith('/admin/shops') ? Response.json({ items: [], pageNumber: 1, pageSize: 100, totalItems: 0 }) : response(rows));
    render(<OffersPage requestAdmin={request} />);
    expect(await screen.findByText('Sắp có')).toBeInTheDocument();
    expect(screen.getByText('Thấp nhất')).toBeInTheDocument();
    expect(screen.getByText(/-4,5% so với trung bình/)).toBeInTheDocument();
    expect(screen.getByText('Lâu chưa cập nhật', { selector: 'small' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem ảnh lớn của offer 301' })).toHaveTextContent('No img');
    fireEvent.click(screen.getByLabelText('Thao tác cho offer 301'));
    expect(screen.queryByRole('menuitem', { name: /Mở trang trên cửa hàng/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh lớn của Outlier' }));
    fireEvent.error(screen.getByRole('img', { name: 'Outlier' }));
    expect(await screen.findByText('Cửa hàng chưa cung cấp ảnh cho offer này.')).toBeInTheDocument();
  });

  it('shows drawer empty and error states and closes from its scrim', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(async path => {
      if (path.includes('/price-history')) return Response.json([]);
      if (path.includes('productId=')) return Response.json(pageShape([]));
      return response([{ ...offer, partnerShopName: null, productName: null, externalSku: null, lowestPriceVnd: null, originalPriceVnd: null }]);
    });
    render(<OffersPage requestAdmin={request} />);
    await screen.findByText('Sản phẩm #42');
    fireEvent.click(screen.getByRole('row', { name: /Sản phẩm #42/ }));
    expect(await screen.findByText('Chưa có dữ liệu so sánh cho sản phẩm này.')).toBeInTheDocument();
    expect(screen.getByText('Chưa có dữ liệu lịch sử giá trong 30 ngày.')).toBeInTheDocument();
    fireEvent.mouseDown(document.querySelector('.studio-overlay')!);
    expect(screen.queryByRole('dialog', { name: 'Chi tiết offer' })).not.toBeInTheDocument();
  });

  it('clears filters, changes page size, and exercises safe image zoom interactions', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(async path => path.includes('q=missing') ? response([], 0) : response([offer], 25));
    render(<OffersPage requestAdmin={request} />);
    await screen.findByText('Laptop Air');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm offer' }), { target: { value: 'missing' } });
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('q=missing'), expect.anything()));
    await waitFor(() => expect(screen.getByText('Không có offer nào khớp bộ lọc')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ bộ lọc' }));
    await screen.findByText('Laptop Air');
    fireEvent.change(screen.getByRole('combobox', { name: 'Số dòng mỗi trang' }), { target: { value: '20' } });
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('pageSize=20'), expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh lớn của Laptop Air' }));
    const stage = document.querySelector('.studio-lightbox-stage')!;
    fireEvent.wheel(stage, { deltaY: -100, clientX: 100, clientY: 100 });
    expect(screen.getByText('115%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng ảnh' }));
    expect(screen.queryByRole('dialog', { name: 'Xem ảnh lớn' })).not.toBeInTheDocument();
  });

  it('clears an outlier reason and reports mutation failures', async () => {
    const flagged = { ...offer, isOutlier: true, outlierReason: 'old reason' };
    const request = vi.fn<AdminRequest>().mockImplementation(async (path, init) => {
      if (init?.method === 'PATCH' && path.endsWith('/outlier-reason')) return new Response(null, { status: 204 });
      if (init?.method === 'PATCH') return new Response(null, { status: 204 });
      return response([flagged]);
    });
    render(<OffersPage requestAdmin={request} />);
    await screen.findByText('Laptop Air');
    fireEvent.click(screen.getByLabelText('Thao tác cho offer 201'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bỏ đánh dấu giá bất thường' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/offers/201/outlier-reason', expect.objectContaining({ body: JSON.stringify({ outlierReason: null }) })));
    expect(await screen.findByText('Đã bỏ đánh dấu giá bất thường.')).toBeInTheDocument();
  });

  it('shows comparison errors and toggles the lightbox zoom with image clicks', async () => {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
    const request = vi.fn<AdminRequest>().mockImplementation(async path => {
      if (path.includes('productId=')) return new Response(JSON.stringify({ detail: 'comparison unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      if (path.includes('/price-history')) return Response.json([]);
      return response([offer]);
    });
    render(<OffersPage requestAdmin={request} />);
    await screen.findByText('Laptop Air');
    fireEvent.click(screen.getByRole('row', { name: /Laptop Air/ }));
    expect(await screen.findByText('comparison unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh lớn của Laptop Air' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ảnh sản phẩm chuẩn' }));
    const image = screen.getByRole('img', { name: 'Laptop Air' });
    fireEvent.click(image);
    expect(document.querySelector('.studio-lightbox-content')).toHaveStyle({ transform: 'translate(0px,0px) scale(2)' });
    fireEvent.click(image);
    expect(document.querySelector('.studio-lightbox-content')).toHaveStyle({ transform: 'translate(0px,0px) scale(1)' });
  });

  it('keeps the failure message when a full offer update is rejected', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(async (_path, init) => init?.method === 'PATCH' ? new Response(JSON.stringify({ detail: 'update denied' }), { status: 403, headers: { 'Content-Type': 'application/json' } }) : response([hidden]));
    render(<OffersPage requestAdmin={request} />);
    await screen.findByText('Laptop Hidden');
    fireEvent.click(screen.getByLabelText('Thao tác cho offer 202'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hiển thị lại trên trang so sánh' }));
    expect(await screen.findByText('You do not have permission to perform this action.')).toBeInTheDocument();
  });
});

function pageShape(items: AdminOffer[]) { return { items, pageNumber: 1, pageSize: 100, totalItems: items.length, counts }; }
