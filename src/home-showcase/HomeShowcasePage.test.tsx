// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import type { AdminRequest } from '../products/products-api';
import { HomeShowcasePage } from './HomeShowcasePage';

const api = vi.hoisted(() => ({ getHomeShowcase: vi.fn(), getHomeShowcaseFallbacks: vi.fn(), saveHomeShowcaseDraft: vi.fn(), resetHomeShowcaseDraft: vi.fn(), publishHomeShowcase: vi.fn(), issueHomeShowcasePreviewToken: vi.fn() }));
const productsApi = vi.hoisted(() => ({ getAdminProducts: vi.fn(), getAdminCategories: vi.fn() }));
vi.mock('./home-showcase-api', async () => ({ ...(await vi.importActual<typeof import('./home-showcase-api')>('./home-showcase-api')), ...api }));
vi.mock('../products/products-api', async () => ({ ...(await vi.importActual<typeof import('../products/products-api')>('../products/products-api')), ...productsApi }));

const apple = { id: 1, slug: 'phone-a', name: 'Phone A', imageUrl: null, brand: 'Apple', categoryName: 'Phones', categorySlug: 'phones', isVisible: true };
const laptop = { id: 2, slug: 'laptop-a', name: 'Laptop A', imageUrl: null, brand: 'Brand A', categoryName: 'Computers', categorySlug: 'computers', isVisible: true };
const hiddenLaptop = { id: 3, slug: 'laptop-hidden', name: 'Hidden Laptop', imageUrl: null, brand: 'Brand B', categoryName: 'Computers', categorySlug: 'computers', isVisible: false };
const camera = { id: 4, slug: 'camera-a', name: 'Camera A', imageUrl: null, brand: 'Camera Co', categoryName: 'Cameras', categorySlug: 'cameras', isVisible: true };
const fallbackFeatured = [apple, laptop, camera];
const fallbackComputers = [laptop];
const slots = (product?: typeof apple) => Array.from({ length: 15 }, (_, index) => ({ slotIndex: index + 1, product: index === 0 ? product || null : null }));
const response = (featured?: typeof apple, interested?: typeof laptop) => ({
  draft: { featured: slots(featured), interestedComputers: slots(interested) },
  published: { featured: slots(featured), interestedComputers: slots(interested) },
});
const productPage = { items: [apple, laptop, hiddenLaptop, camera].map(product => ({
  id: product.id, slug: product.slug, name: product.name, brand: product.brand, description: null,
  seoTitle: null, seoDescription: null, categoryId: product.categorySlug === 'computers' ? 2 : product.categorySlug === 'cameras' ? 3 : 1,
  isActive: product.isVisible, imageUrl: null,
})), pageNumber: 1, pageSize: 100, totalItems: 4 };
const categoryList = [
  { id: 1, name: 'Phones', slug: 'phones', isActive: true },
  { id: 2, name: 'Computers', slug: 'computers', isActive: true },
  { id: 3, name: 'Cameras', slug: 'cameras', isActive: true },
];
const requestAdmin: AdminRequest = vi.fn();
const permissions = ['home_showcase.read', 'home_showcase.update', 'home_showcase.publish'];
const renderPage = () => render(<HomeShowcasePage requestAdmin={requestAdmin} permissions={permissions} />);

describe('Home Showcase editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getHomeShowcase.mockResolvedValue(response(apple, laptop));
    api.getHomeShowcaseFallbacks.mockResolvedValue({ featured: fallbackFeatured, interestedComputers: fallbackComputers });
    api.saveHomeShowcaseDraft.mockResolvedValue(undefined);
    api.resetHomeShowcaseDraft.mockResolvedValue(undefined);
    api.publishHomeShowcase.mockResolvedValue(undefined);
    api.issueHomeShowcasePreviewToken.mockResolvedValue('preview-secret');
    productsApi.getAdminProducts.mockResolvedValue(productPage);
    productsApi.getAdminCategories.mockResolvedValue(categoryList);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('renders the two 15-slot sections, hero relationship, hidden label and responsive preview controls', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Trang chủ' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Sản phẩm nổi bật/ })).toHaveTextContent('1/15');
    expect(screen.getByRole('tab', { name: /Máy tính được quan tâm/ })).toHaveTextContent('1/15');
    expect(screen.getByRole('list', { name: 'Sản phẩm nổi bật: 15 ô' }).children).toHaveLength(15);
    expect(screen.getByText('🔥 Sản phẩm nổi bật')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Điện thoại' })).toBeInTheDocument();
    expect(screen.getByText('Bản nháp trùng bản đang chạy')).toBeInTheDocument();
  });

  it('renders storefront fallback products in empty draft and live preview sections, including the first three hero items', async () => {
    api.getHomeShowcase.mockResolvedValue(response());
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Trang chủ' });

    const hero = document.querySelector('.showcase-site__hero-card');
    expect(hero).toHaveTextContent('Phone A');
    expect(hero).toHaveTextContent('Laptop A');
    expect(hero).toHaveTextContent('Camera A');
    expect(document.querySelector('.showcase-site__hero-card')).not.toHaveTextContent('Chưa có sản phẩm nổi bật');
    const featuredSection = document.querySelectorAll('.showcase-site__section')[0];
    const computersSection = document.querySelectorAll('.showcase-site__section')[1];
    expect(featuredSection).toHaveTextContent('Phone A');
    expect(featuredSection).toHaveTextContent('Camera A');
    expect(computersSection).toHaveTextContent('Laptop A');

    await user.click(screen.getByRole('button', { name: 'Đang chạy' }));
    expect(document.querySelector('.showcase-site__hero-card')).toHaveTextContent('Phone A');
    expect(document.querySelectorAll('.showcase-site__section')[1]).toHaveTextContent('Laptop A');
    expect(api.getHomeShowcaseFallbacks).toHaveBeenCalledOnce();
  });

  it('only offers Computers in the interested-computers picker and labels hidden products', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Trang chủ' });
    await user.click(screen.getByRole('tab', { name: /Máy tính được quan tâm/ }));
    await user.click(screen.getAllByRole('button', { name: /Chọn sản phẩm/ })[1]);
    expect(await screen.findByRole('dialog', { name: 'Chọn sản phẩm' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Hidden Laptop/ })).toHaveTextContent('Đang ẩn');
    expect(screen.getByRole('button', { name: /Laptop A/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Camera A/ })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Lọc danh mục' })).toBeDisabled();
  });

  it('prevents duplicate assignment and keeps the editor selection when draft save fails', async () => {
    const user = userEvent.setup();
    api.saveHomeShowcaseDraft.mockRejectedValueOnce(new Error('network unavailable'));
    renderPage();
    await screen.findByRole('heading', { name: 'Trang chủ' });
    await user.click(screen.getAllByRole('button', { name: /Chọn sản phẩm/ })[0]);
    expect(await screen.findByRole('button', { name: /Phone A/ })).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: /Máy tính được quan tâm/ }));
    await user.click(screen.getAllByRole('button', { name: /Chọn sản phẩm/ })[1]);
    await user.click(await screen.findByRole('button', { name: /Hidden Laptop/ }));
    expect(screen.getByText('Hidden Laptop')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Các thay đổi trên màn hình vẫn được giữ');
    expect(screen.getByText('Hidden Laptop')).toBeInTheDocument();
    expect(api.saveHomeShowcaseDraft).toHaveBeenCalledWith(requestAdmin, expect.objectContaining({ interestedComputers: expect.arrayContaining([3]) }));
  });

  it('moves products with the arrow controls and saves the complete draft without publishing it', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Trang chủ' });
    const grid = screen.getByRole('list', { name: 'Sản phẩm nổi bật: 15 ô' });
    const firstSlotMove = within(grid).getByRole('button', { name: 'Chuyển ô 1 sang phải' });
    await user.click(firstSlotMove);
    expect(within(grid).getAllByRole('listitem')[1]).toHaveTextContent('Phone A');
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(api.saveHomeShowcaseDraft).toHaveBeenCalledOnce());
    expect(await screen.findByText('Đã lưu nháp. Trang chủ công khai chưa thay đổi cho tới khi publish.')).toBeInTheDocument();
    expect(screen.getByText('Nháp chưa publish')).toBeInTheDocument();
    expect(api.publishHomeShowcase).not.toHaveBeenCalled();
  });

  it('clears a section and labels empty-slot fallback before publishing', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Trang chủ' });
    await user.click(screen.getByRole('button', { name: 'Xoá hết' }));
    expect(screen.getByRole('list', { name: 'Sản phẩm nổi bật: 15 ô' }).children).toHaveLength(15);
    expect(screen.getByText(/Chưa chọn ô nào: trang chủ sẽ dùng 15 sản phẩm đầu làm fallback/)).toBeInTheDocument();
    expect(screen.getByText('Chưa lưu nháp')).toBeInTheDocument();
  });

  it('confirms publish with a per-slot old-to-new diff and leaves published state unchanged on failure', async () => {
    const user = userEvent.setup();
    api.publishHomeShowcase.mockRejectedValueOnce(new Error('server rejected'));
    renderPage();
    await screen.findByRole('heading', { name: 'Trang chủ' });
    await user.click(screen.getAllByRole('button', { name: 'Đổi' })[0]);
    await user.click(await screen.findByRole('button', { name: /Camera A/ }));
    await user.click(screen.getByRole('button', { name: 'Publish lên trang chủ' }));
    const dialog = screen.getByRole('dialog', { name: 'Publish lên trang chủ?' });
    expect(within(dialog).getByText(/Sản phẩm nổi bật · Ô 1 \(thẻ hero\)/)).toBeInTheDocument();
    expect(within(dialog).getByRole('list').querySelector('li')).toHaveTextContent('Phone A → Camera A');
    await user.click(within(dialog).getByRole('button', { name: 'Publish ngay' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bản đang chạy và nội dung đang sửa vẫn được giữ');
    expect(screen.getAllByText('Camera A').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Đang chạy' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('publishes only after confirmation and switches the preview back to the published selection', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Trang chủ' });
    await user.click(screen.getAllByRole('button', { name: 'Đổi' })[0]);
    await user.click(await screen.findByRole('button', { name: /Camera A/ }));
    await user.click(screen.getByRole('button', { name: 'Publish lên trang chủ' }));
    await user.click(screen.getByRole('button', { name: 'Publish ngay' }));
    await waitFor(() => expect(api.publishHomeShowcase).toHaveBeenCalledOnce());
    expect(await screen.findByText('Đã publish. Trang chủ công khai sẽ cập nhật sau khi cache được làm mới.')).toBeInTheDocument();
    expect(screen.getAllByText('Đang chạy').length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog', { name: 'Publish lên trang chủ?' })).not.toBeInTheDocument();
  });

  it('requires a second confirmation before reset and restores the live snapshot', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Trang chủ' });
    await user.click(screen.getAllByRole('button', { name: 'Đổi' })[0]);
    await user.click(await screen.findByRole('button', { name: /Camera A/ }));
    const reset = screen.getByRole('button', { name: 'Hoàn tác về bản đang chạy' });
    await user.click(reset);
    expect(screen.getByRole('button', { name: 'Bấm lại để xác nhận' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bấm lại để xác nhận' }));
    await waitFor(() => expect(api.resetHomeShowcaseDraft).toHaveBeenCalledOnce());
    expect(screen.getAllByText('Phone A').length).toBeGreaterThan(0);
    expect(screen.queryByText('Camera A')).not.toBeInTheDocument();
  });

  it('opens the website draft preview with its short-lived token in the URL fragment', async () => {
    const user = userEvent.setup();
    const replace = vi.fn();
    const previewWindow = { opener: {}, location: { replace }, close: vi.fn() } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(previewWindow);
    renderPage();
    await screen.findByRole('heading', { name: 'Trang chủ' });
    await user.click(screen.getByRole('button', { name: '↗ Mở tab mới' }));
    await waitFor(() => expect(replace).toHaveBeenCalledOnce());
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(previewWindow.opener).toBeNull();
    const url = new URL(replace.mock.calls[0][0]);
    expect(url.origin).toBe('https://compareshop-dev.giamha.online');
    expect(url.search).toBe('');
    expect(url.hash).toBe('#homeShowcasePreview=preview-secret');
  });

  it('closes preview overlay with Escape and reports a blocked popup', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'open').mockReturnValue(null);
    renderPage();
    await screen.findByRole('heading', { name: 'Trang chủ' });
    await user.click(screen.getByRole('button', { name: '⤢ Toàn màn hình' }));
    expect(screen.getByRole('dialog', { name: 'Xem trước toàn trang chủ' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Xem trước toàn trang chủ' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '↗ Mở tab mới' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('đã chặn tab xem trước');
    expect(api.issueHomeShowcasePreviewToken).not.toHaveBeenCalled();
  });

  it('shows a retry state when the initial API read fails and hides editing actions without permission', async () => {
    api.getHomeShowcase.mockRejectedValueOnce(new Error('offline'));
    render(<HomeShowcasePage requestAdmin={requestAdmin} permissions={['home_showcase.read']} />);
    expect(await screen.findByText('Không tải được cấu hình trang chủ.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('tab', { name: /Sản phẩm nổi bật/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu nháp' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish lên trang chủ' })).toBeDisabled();
  });
});
