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

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('OffersPage', () => {
  it('renders typed fields, accurate stock states, global chip counts, and page totals', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(async () => response([offer, hidden], 20));
    render(<OffersPage requestAdmin={request} />);
    expect(await screen.findByText('Laptop Air')).toBeInTheDocument();
    expect(screen.getByText('SKU LA-42 · Offer #201')).toBeInTheDocument();
    expect(screen.getByText('Chưa rõ')).toBeInTheDocument();
    expect(screen.getByText('Hết hàng', { selector: '.offers-pill' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Giá bất thường/ })).toHaveTextContent('4');
    expect(screen.getByText('1–10 / 20')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Trang tiếp' }));
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

  it('opens both image sources with the approved black overlay and closes with Escape', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(response([offer]));
    render(<OffersPage requestAdmin={request} />);
    await screen.findByText('Laptop Air');
    fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh lớn của Laptop Air' }));
    expect(screen.getByRole('dialog', { name: 'Xem ảnh lớn' })).toHaveClass('offers-lightbox');
    fireEvent.click(screen.getByRole('button', { name: 'Ảnh sản phẩm chuẩn' }));
    expect(screen.getByRole('button', { name: 'Ảnh sản phẩm chuẩn' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Xem ảnh lớn' })).not.toBeInTheDocument();
  });

  it('hides mutations from viewers and sends real PATCH when an editor hides an offer', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(async (_path, init) => init?.method === 'PATCH' ? new Response(null, { status: 204 }) : response([offer]));
    const { rerender } = render(<OffersPage requestAdmin={request} permissions={['offers.read']} />);
    await screen.findByText('Laptop Air');
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác cho offer 201' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác cho offer 201' }));
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
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải offers');
    resolve(new Response('', { status: 500 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('status 500');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Không có offer nào khớp bộ lọc')).toBeInTheDocument();
  });
});

function pageShape(items: AdminOffer[]) { return { items, pageNumber: 1, pageSize: 100, totalItems: items.length, counts }; }
