import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MatchingPage } from './MatchingPage';
// @ts-expect-error Node's built-in fs module is available to Vitest at runtime.
import { readFileSync } from 'node:fs';
import type { AdminRequest } from './matching-api';

const matchingStyles = readFileSync('src/matching/matching.css', 'utf8').replace(/\s+/g, ' ');
const studioStyles = readFileSync('src/ui/studio-ui.css', 'utf8').replace(/\s+/g, ' ');
const item = { id: 12, name: 'Laptop source', brand: 'Acme', externalSku: 'SKU-12', dataSourceId: 4, verdict: 'review', status: 'pending', groupKey: 'g1', source: { imageUrl: 'https://img.example/laptop.jpg', price: 24990000, shopName: 'Shop One' }, attributes: { brand: 'Acme', line: 'Notebook', ram: '16GB' }, candidates: [{ productId: 71, name: 'Laptop product', brand: 'Acme', score: 0.9, level: 'review', differences: [{ attribute: 'RAM', source: '16GB', candidate: '8GB', kind: 'diff' }] }] };
const page = (items: unknown[] = [item]) => Response.json({ items, page: 1, pageSize: 20, total: items.length, counts: { all: 4, pending: 3, skipped: 1, confident: 1, review: 1, likely_new: 1, likely_skip: 1 } });
const request = (responses: Response[]) => vi.fn<AdminRequest>().mockImplementation(async (path, init) => {
  if (path.includes('pageSize=100')) return page();
  if (path.startsWith('/admin/matching?')) return responses.shift() ?? page([]);
  return responses.shift() ?? new Response(null, { status: 204 });
});
const renderPage = (admin: AdminRequest, permissions = ['matching.approve', 'products.create']) => render(<MatchingPage requestAdmin={admin} permissions={permissions} />);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('MatchingPage', () => {
  it('keeps the queue loading state visible until its request resolves', async () => {
    let resolveRequest!: (response: Response) => void;
    const admin = vi.fn<AdminRequest>(() => new Promise(resolve => { resolveRequest = resolve; }));
    renderPage(admin);

    expect(screen.getByRole('status', { name: 'Đang tải hàng đợi' })).toBeInTheDocument();
    await waitFor(() => expect(admin).toHaveBeenCalled());
    resolveRequest(page());
    expect(await screen.findByRole('heading', { name: 'Laptop source' })).toBeInTheDocument();
  });

  it('loads the Studio queue, compares attributes and deliberately approves only the selected candidate', async () => {
    const admin = request([page(), new Response(null, { status: 204 }), page([])]);
    renderPage(admin);
    expect(await screen.findByRole('heading', { name: 'Laptop source' })).toBeInTheDocument();
    expect(screen.getByText('Shop One · SKU SKU-12 · 24.990.000 ₫')).toBeInTheDocument();
    expect(screen.getByText('16GB')).toBeInTheDocument();
    const candidate = screen.getByRole('button', { name: /Laptop product/ });
    expect(candidate).toHaveClass('studio-button', 'studio-button-grid');
    expect(candidate).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(candidate);
    expect(candidate).toHaveAttribute('aria-pressed', 'true');
    expect(within(candidate).getByText('Đang chọn')).toBeInTheDocument();
    expect(screen.getByText('8GB')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Duyệt/ })).toBeEnabled());
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

  it('explains that an empty search does not mean the queue is processed and lets the user clear it', async () => {
    const admin = vi.fn<AdminRequest>().mockImplementation(async path => {
      if (String(path).includes('q=missing')) return page([]);
      return page();
    });
    renderPage(admin);
    await screen.findByRole('heading', { name: 'Laptop source' });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });

    expect(await screen.findByText('Hàng đợi vẫn còn mặt hàng. Hãy đổi từ khóa hoặc xóa tìm kiếm để xem lại.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xóa tìm kiếm' })).toBeInTheDocument();
    expect(screen.queryByText('Hàng đợi đã được xử lý')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa tìm kiếm' }));
    expect(screen.getByRole('status', { name: 'Đang tải hàng đợi' })).toBeInTheDocument();
    expect(screen.queryByText('Hàng đợi đã được xử lý')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Laptop source' })).toBeInTheDocument();
  });

  it('preserves genuine pending and skipped empty states when a search has no queue items', async () => {
    const noQueueItems = { items: [], page: 1, pageSize: 20, total: 0, counts: { all: 0, pending: 0, skipped: 0, confident: 0, review: 0, likely_new: 0, likely_skip: 0 } };
    const admin = vi.fn<AdminRequest>().mockImplementation(async path => {
      if (!path.startsWith('/admin/matching?')) return new Response(null, { status: 204 });
      if (path.includes('q=missing') || path.includes('status=skipped')) return Response.json(noQueueItems);
      return page();
    });
    renderPage(admin);
    await screen.findByRole('heading', { name: 'Laptop source' });

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
    expect(await screen.findByText('Hàng đợi đã được xử lý')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xóa tìm kiếm' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Đã bỏ qua/ }));
    expect(await screen.findByText('Chưa có mặt hàng đã bỏ qua')).toBeInTheDocument();
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
    const fileChoice = screen.getByRole('button', { name: /laptop.png/ });
    expect(fileChoice).toHaveClass('studio-button', 'studio-button-secondary', 'studio-button-stacked');
    expect(fileChoice).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(fileChoice);
    expect(screen.getByRole('button', { name: /laptop.png/ })).toHaveClass('studio-button-cool');
    expect(screen.getByRole('button', { name: /laptop.png/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('button', { name: /laptop.png/ })).getByText('Đang chọn')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dùng ảnh này' }));
    expect(screen.getByRole('button', { name: /Tạo và gắn/ })).toBeEnabled();
    cleanup();
    renderPage(request([page()]), ['matching.approve']);
    await screen.findByRole('heading', { name: 'Laptop source' });
    expect(screen.queryByRole('button', { name: /Tạo sản phẩm mới/ })).not.toBeInTheDocument();
  });

  it('uses shared Studio buttons for queue selection and exposes the pressed state', async () => {
    const second = { ...item, id: 13, name: 'Second source', externalSku: 'SKU-13' };
    renderPage(request([page([item, second])]));
    await screen.findByRole('heading', { name: 'Laptop source' });

    const firstButton = screen.getByRole('button', { name: /Laptop source/ });
    const secondButton = screen.getByRole('button', { name: /Second source/ });
    expect(firstButton).toHaveClass('studio-button', 'studio-button-selected');
    expect(firstButton).toHaveAttribute('aria-current', 'true');
    expect(firstButton).toHaveAttribute('aria-pressed', 'true');
    expect(secondButton).toHaveClass('studio-button', 'studio-button-secondary');
    expect(secondButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(secondButton);
    expect(secondButton).toHaveClass('studio-button-selected');
    expect(secondButton).toHaveAttribute('aria-current', 'true');
    expect(secondButton).toHaveAttribute('aria-pressed', 'true');
    expect(firstButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps shared control styles out of Matching page CSS', () => {
    expect(matchingStyles).not.toMatch(/\.matching-file-grid\s+button/);
    expect(matchingStyles).not.toMatch(/\.matching-[^{}]*\.studio-button/);
    expect(matchingStyles).not.toMatch(/\.matching-[^{}]*\.studio-pill/);
    expect(matchingStyles).not.toMatch(/\.matching-file-option/);
    expect(matchingStyles).not.toMatch(/\.matching-candidate-head\s*\{[^}]*display:/);
    expect(matchingStyles).not.toMatch(/\.matching-candidate-card\.selected/);
    expect(matchingStyles).not.toMatch(/\.matching-candidate-card\s*\{[^}]*border:/);
    expect(matchingStyles).not.toMatch(/\.matching-queue-item(?:\[aria-current=true\]|:hover)?\{[^}]*\b(?:padding|border|border-radius|background|color|box-shadow|cursor):/);
    expect(matchingStyles).not.toMatch(/\.matching-queue-item:hover|\.matching-queue-item\[aria-current=true\]/);
    expect(matchingStyles).not.toMatch(/\.matching-listing-image\{[^}]*\b(?:border|border-radius|background|color|box-shadow):/);
    expect(matchingStyles).not.toMatch(/\.matching-listing-image:hover/);
    expect(matchingStyles).not.toMatch(/\.matching-listing-image\s*\{[^}]*display:/);
    expect(matchingStyles).toContain('.matching-file-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))');
    expect(matchingStyles).toContain('.matching-file-grid{grid-template-columns:repeat(3,minmax(0,1fr))}');
  });

  it('uses the shared brand selection treatment while retaining the shared focus indicator', () => {
    expect(studioStyles).toContain('.studio-button-selected,.studio-button-selected:hover{border-color:var(--studio-brand);background:var(--studio-brand-soft);color:var(--studio-brand-text)}');
    expect(studioStyles).toContain('.studio-button:focus-visible');
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
    const imageControl = screen.getByRole('button', { name: 'Mở ảnh mặt hàng' });
    expect(imageControl).toHaveClass('studio-button', 'studio-button-grid', 'matching-listing-image');
    expect(imageControl).toBeEnabled();
    fireEvent.click(imageControl);
    expect(screen.getByRole('dialog', { name: 'Xem ảnh' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Xem ảnh' })).not.toBeInTheDocument();
  });

  it('approves an explicit candidate for every pending row in a group', async () => {
    const second = { ...item, id: 13, name: 'Same laptop at shop two', externalSku: 'SKU-13' };
    const admin = vi.fn<AdminRequest>().mockImplementation(async (path) => path.startsWith('/admin/matching?') ? page([item, second]) : new Response(null, { status: 204 }));
    renderPage(admin);
    await screen.findByRole('heading', { name: 'Laptop source' });
    fireEvent.click(screen.getAllByRole('button', { name: /Laptop product/ })[0]);
    expect(await screen.findByRole('button', { name: /Duyệt 2 mặt hàng/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Duyệt 2 mặt hàng/ }));
    await waitFor(() => expect(admin).toHaveBeenCalledWith('/admin/matching/approve-group', expect.objectContaining({ body: '{"ids":[12,13],"productId":71}' })));
  });

  it('loads all pending group members across pages, independent of the visible queue page', async () => {
    const second = { ...item, id: 13, name: 'Same laptop on another page', externalSku: 'SKU-13' };
    const admin = vi.fn<AdminRequest>().mockImplementation(async (path) => {
      if (path.startsWith('/admin/matching?') && path.includes('pageSize=100')) {
        const pageNumber = Number(new URLSearchParams(path.split('?')[1]).get('page'));
        if (pageNumber === 1) return Response.json({ items: [item], page: 1, pageSize: 1, total: 2, counts: {} });
        return Response.json({ items: [second], page: 2, pageSize: 1, total: 2, counts: {} });
      }
      if (path.startsWith('/admin/matching?')) return page([item]);
      return new Response(null, { status: 204 });
    });
    renderPage(admin);
    await screen.findByRole('heading', { name: 'Laptop source' });
    expect(await screen.findByRole('switch', { name: 'Duyệt cả nhóm cùng lúc' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /Laptop product/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Duyệt 2 mặt hàng/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Duyệt 2 mặt hàng/ }));
    await waitFor(() => expect(admin).toHaveBeenCalledWith('/admin/matching/approve-group', expect.objectContaining({ body: '{"ids":[12,13],"productId":71}' })));
  });

  it.each(['missing', 'duplicate'] as const)('falls back to a single-item approval when a pending queue page is %s', async pageFault => {
    const admin = vi.fn<AdminRequest>().mockImplementation(async path => {
      if (!path.startsWith('/admin/matching?')) return new Response(null, { status: 204 });
      const params = new URLSearchParams(path.split('?')[1]);
      if (params.get('pageSize') !== '100') return page([item]);
      if (params.get('page') === '1') return Response.json({ items: [item], page: 1, pageSize: 1, total: 2, counts: {} });
      return Response.json({ items: pageFault === 'duplicate' ? [item] : [], page: 2, pageSize: 1, total: 2, counts: {} });
    });
    renderPage(admin);
    await screen.findByRole('heading', { name: 'Laptop source' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được đầy đủ nhóm');
    fireEvent.click(screen.getByRole('button', { name: /Laptop product/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Duyệt/ }));
    await waitFor(() => expect(admin).toHaveBeenCalledWith('/admin/matching/12/approve', expect.objectContaining({ body: '{"productId":71}' })));
    expect(admin).not.toHaveBeenCalledWith('/admin/matching/approve-group', expect.anything());
  });

  it('keeps create-product scoped to the selected item when pending queue completeness fails', async () => {
    const admin = vi.fn<AdminRequest>().mockImplementation(async path => {
      if (!path.startsWith('/admin/matching?')) return new Response(null, { status: 204 });
      const params = new URLSearchParams(path.split('?')[1]);
      if (params.get('pageSize') !== '100') return page([item]);
      return params.get('page') === '1'
        ? Response.json({ items: [item], page: 1, pageSize: 1, total: 2, counts: {} })
        : Response.json({ items: [], page: 2, pageSize: 1, total: 3, counts: {} });
    });
    renderPage(admin);
    await screen.findByRole('heading', { name: 'Laptop source' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được đầy đủ nhóm');
    fireEvent.click(screen.getByRole('button', { name: /Tạo sản phẩm mới/ }));
    expect(await screen.findByText(/tạo sản phẩm chỉ áp dụng cho item đang chọn/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Chưa có ảnh/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và gắn' }));
    await waitFor(() => expect(admin).toHaveBeenCalledWith('/admin/matching/12/create-product', expect.objectContaining({ body: expect.stringContaining('"applyGroup":false') })));
  });

  it('creates from a shop image with edited fields and reports API rejection in the dialog', async () => {
    const admin = vi.fn<AdminRequest>().mockImplementation(async path => path.startsWith('/admin/matching?') ? page() : path.includes('/create-product') ? Response.json({ detail: 'Slug already exists' }, { status: 409 }) : new Response(null, { status: 204 }));
    renderPage(admin);
    await screen.findByRole('heading', { name: 'Laptop source' });
    fireEvent.click(screen.getByRole('button', { name: /Tạo sản phẩm mới/ }));
    expect(screen.getByRole('button', { name: 'Tạo và gắn' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Dùng tạm ảnh của shop/ }));
    expect(screen.getByText('Cần ảnh chuẩn')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tên sản phẩm chuẩn'), { target: { value: 'Laptop custom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và gắn' }));
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('Slug already exists');
    expect(admin).toHaveBeenCalledWith('/admin/matching/12/create-product', expect.objectContaining({ body: expect.stringContaining('"imageChoice":"shop"') }));
  });

  it('surfaces Files picker failures and supports the no-image product choice', async () => {
    const admin = vi.fn<AdminRequest>().mockImplementation(async path => path.startsWith('/admin/matching?') ? page() : path.startsWith('/admin/files?') ? new Response('', { status: 403 }) : new Response(null, { status: 204 }));
    renderPage(admin);
    await screen.findByRole('heading', { name: 'Laptop source' });
    fireEvent.click(screen.getByRole('button', { name: /Tạo sản phẩm mới/ }));
    fireEvent.click(screen.getByRole('button', { name: /Chọn ảnh từ Files/ }));
    expect(await screen.findByText(/permission to load files/i)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('radio', { name: /Chưa có ảnh/ }));
    expect(screen.getByText('Cần ảnh chuẩn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo và gắn' })).toBeEnabled();
  });

  it('renders no-candidate, no-image and skipped-empty states without exposing write actions', async () => {
    const noCandidate = { ...item, candidates: [], source: { ...item.source, imageUrl: null }, verdict: 'likely_skip' };
    const admin = vi.fn<AdminRequest>().mockImplementation(async path => path.startsWith('/admin/matching?') ? path.includes('status=skipped') ? page([]) : page([noCandidate]) : new Response(null, { status: 204 }));
    renderPage(admin, ['matching.read']);
    await screen.findByText('Không tìm thấy ứng viên phù hợp. Chỉ người duyệt mới có thể quyết định tạo sản phẩm mới.');
    expect(screen.getByText('Mặt hàng có thể là phụ kiện hoặc ngoài phạm vi laptop. Bạn có thể bỏ qua với lý do.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở ảnh mặt hàng' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Duyệt/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Đã bỏ qua/ }));
    expect(await screen.findByText('Chưa có mặt hàng đã bỏ qua')).toBeInTheDocument();
  });

  it('handles keyboard candidate selection, approve, create, skip and modifier guards', async () => {
    const admin = vi.fn<AdminRequest>().mockImplementation(async path => path.startsWith('/admin/matching?') ? page() : new Response(null, { status: 204 }));
    renderPage(admin);
    await screen.findByRole('heading', { name: 'Laptop source' });
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
    expect(screen.queryByRole('dialog', { name: 'Tạo sản phẩm mới' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 's' });
    expect(screen.getByRole('dialog', { name: /Bỏ qua mặt hàng/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'N' });
    expect(screen.getByRole('dialog', { name: 'Tạo sản phẩm mới' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(admin).toHaveBeenCalledWith('/admin/matching/12/approve', expect.objectContaining({ method: 'POST' })));
  });
});
