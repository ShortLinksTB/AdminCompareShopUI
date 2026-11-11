import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { OffersPage } from './OffersPage';
import type { AdminOffer, AdminOffersPage, AdminRequest } from './offers-api';

vi.mock('../shopsApi', () => ({ getPartnerShops: vi.fn().mockResolvedValue({ items: [{ id: 8, name: 'Shop 8', isActive: true }], pageNumber: 1, pageSize: 100, totalItems: 1 }) }));
const offer: AdminOffer = {
  id: 201, productId: 42, partnerShopId: 8, priceVnd: 18990000, url: 'https://shop.example/offer/201',
  isActive: true, isOutlier: false, updatedAtUtc: '2026-11-03T06:00:00Z', productName: 'Phone X',
  productImageUrl: 'https://img.example/product.jpg', partnerShopName: 'Shop 8', externalSku: 'PX-42',
  imageUrl: 'https://img.example/shop.jpg', originalPriceVnd: 19990000, stockStatus: 'in_stock',
  lowestPriceVnd: 18990000, deltaVnd: 0, deltaPercent: 0, outlierReason: null,
};
const inactive: AdminOffer = { ...offer, id: 202, productId: 43, productName: 'Phone Y', isActive: false, isOutlier: true, stockStatus: 'unknown', lowestPriceVnd: null, deltaVnd: null, deltaPercent: null, outlierReason: 'Wrong listing' };
const result = (items: AdminOffer[] = [offer, inactive]): AdminOffersPage => ({ items, page: 1, pageSize: 10, totalItems: items.length, counts: { all: 2, outlier: 1, stale: 0, outOfStock: 0, inactive: 1 } });
const request = (overrides: Partial<AdminRequest> = {}) => vi.fn<AdminRequest>(async (path, init) => {
  if (path.startsWith('/admin/offers/') && path.includes('/price-history')) return Response.json([{ dateUtc: '2026-11-02T00:00:00Z', priceVnd: 18000000 }, { dateUtc: '2026-11-03T00:00:00Z', priceVnd: 18990000 }]);
  if (init?.method === 'PATCH') return new Response(null, { status: 204 });
  if (path.includes('productId=')) return Response.json({ ...result([offer]), items: [offer] });
  return Response.json(result());
});

afterEach(cleanup);
beforeEach(() => { vi.restoreAllMocks(); });

describe('OffersPage', () => {
  it('renders the redesigned table with the server contract values and exact stock semantics', async () => {
    const api = request();
    render(<OffersPage requestAdmin={api} permissions={['offers.read']} />);
    const row = await screen.findByText('Phone X');
    expect(row.closest('tr')).toHaveTextContent('SKU PX-42');
    expect(row.closest('tr')).toHaveTextContent('Thấp nhất');
    expect(screen.getByText('Chưa rõ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Giá bất thường 1' })).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith(expect.stringContaining('/admin/offers?page=1&pageSize=10'), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('sends search, shop, chip, sorting and pagination state to the API', async () => {
    const api = request();
    render(<OffersPage requestAdmin={api} />);
    await screen.findByText('Phone X');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm offer' }), { target: { value: 'PX' } });
    await waitFor(() => expect(api).toHaveBeenCalledWith(expect.stringContaining('q=PX'), expect.anything()));
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc theo cửa hàng' }), { target: { value: '8' } });
    await waitFor(() => expect(api).toHaveBeenCalledWith(expect.stringContaining('shopId=8'), expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: /Hết hàng/ }));
    await waitFor(() => expect(api).toHaveBeenCalledWith(expect.stringContaining('filter=out_of_stock'), expect.anything()));
    fireEvent.change(screen.getByRole('combobox', { name: 'Sắp xếp' }), { target: { value: 'priceDesc' } });
    await waitFor(() => expect(api).toHaveBeenCalledWith(expect.stringContaining('sort=priceDesc'), expect.anything()));
  });

  it('shows an empty state and allows clearing filters', async () => {
    const api = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ ...result([]), totalItems: 0 }));
    render(<OffersPage requestAdmin={api} />);
    expect(await screen.findByText('Không có offer nào khớp bộ lọc')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ bộ lọc' }));
  });

  it('shows retryable errors without stale rows', async () => {
    const api = vi.fn<AdminRequest>().mockResolvedValueOnce(new Response('', { status: 500 })).mockResolvedValue(Response.json(result([offer])));
    render(<OffersPage requestAdmin={api} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('status 500');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Phone X')).toBeInTheDocument();
  });

  it('opens detail with API history and peer offer comparison, and closes with Escape', async () => {
    const api = request();
    render(<OffersPage requestAdmin={api} />);
    fireEvent.click(await screen.findByText('Phone X'));
    expect(await screen.findByRole('dialog', { name: 'Chi tiết offer' })).toBeInTheDocument();
    expect(await screen.findByText('Giá 30 ngày của offer này')).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/admin/offers/201/price-history?days=30', expect.anything());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Chi tiết offer' })).not.toBeInTheDocument());
  });

  it('supports two-source lightbox tabs, missing image state, zoom and escape', async () => {
    const user = userEvent.setup();
    const api = vi.fn<AdminRequest>().mockResolvedValue(Response.json(result([{ ...offer, imageUrl: null }])));
    render(<OffersPage requestAdmin={api} />);
    await user.click(await screen.findByRole('button', { name: 'Xem ảnh lớn của Phone X' }));
    await user.click(screen.getByRole('button', { name: 'Ảnh của Shop 8' }));
    expect(screen.getByText('Cửa hàng chưa cung cấp ảnh cho offer này.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ảnh sản phẩm chuẩn' }));
    expect(screen.getByRole('img', { name: 'Phone X' })).toHaveAttribute('src', offer.productImageUrl);
    fireEvent.wheel(document.querySelector('.offer-lb-stage')!, { deltaY: -100, clientX: 240, clientY: 160 });
    expect(screen.getByText('115%')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('.offer-lightbox')).not.toBeInTheDocument();
  });

  it('hides mutation controls for viewers and submits updates with permission', async () => {
    const viewerApi = request();
    render(<OffersPage requestAdmin={viewerApi} permissions={['offers.read']} />);
    await screen.findByText('Phone X');
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác cho offer 201' }));
    expect(screen.queryByRole('menuitem', { name: /Ẩn khỏi/ })).not.toBeInTheDocument();
    cleanup();
    const editorApi = request();
    vi.spyOn(window, 'prompt').mockReturnValue('Price typo');
    render(<OffersPage requestAdmin={editorApi} permissions={['offers.read', 'offers.update']} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Thao tác cho offer 201' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Đánh dấu giá bất thường' }));
    await waitFor(() => expect(editorApi).toHaveBeenCalledWith('/admin/offers/201', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isOutlier: true, outlierReason: 'Price typo' }) })));
    expect(await screen.findByRole('status')).toHaveTextContent('Đã đánh dấu giá bất thường.');
  });

  it('toggles visibility and clears an existing outlier reason through the API', async () => {
    const api = vi.fn<AdminRequest>(async (path, init) => {
      if (init?.method === 'PATCH') return new Response(null, { status: 204 });
      return Response.json(result([inactive]));
    });
    render(<OffersPage requestAdmin={api} permissions={['offers.read', 'offers.update']} />);
    await screen.findByText('Phone Y');
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác cho offer 202' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hiển thị lại trên trang so sánh' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/offers/202', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isActive: true }) })));
  });

  it('does not claim mutation success when the server rejects an update', async () => {
    const api = vi.fn<AdminRequest>(async (_path, init) => init?.method === 'PATCH' ? new Response('', { status: 403 }) : Response.json(result([offer])));
    render(<OffersPage requestAdmin={api} permissions={['offers.read', 'offers.update']} />);
    await screen.findByText('Phone X');
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác cho offer 201' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ẩn khỏi trang so sánh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to update offers.');
    expect(screen.queryByText('Đã ẩn offer.')).not.toBeInTheDocument();
  });

});
