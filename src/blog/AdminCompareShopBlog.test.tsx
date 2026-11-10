import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminCompareShopBlog } from './AdminCompareShopBlog';
import type { Article } from './articles-api';
import type { AdminRequest } from '../products/products-api';

const article = (over: Partial<Article> = {}): Article => ({ id: 1, title: 'Cách săn sale', slug: 'cach-san-sale', category: 'Kinh nghiệm mua sắm', excerptText: 'ex', contentMarkdown: '## Hi', coverFileId: '6f9619ff-8b86-d011-b42d-00cf4fc964ff', tags: 'a', status: 'Published', authorName: 'Andy', publishedAtUtc: '2026-11-01T00:00:00Z', createdAtUtc: '2026-11-01T00:00:00Z', updatedAtUtc: '2026-11-02T00:00:00Z', totalViews: 1234, ...over });
const draft = article({ id: 2, title: 'Bản nháp', slug: 'ban-nhap', status: 'Draft', coverFileId: null, publishedAtUtc: null, totalViews: 0 });
const ALL = ['articles.read', 'articles.create', 'articles.update', 'articles.publish', 'articles.delete'];

function setup(permissions = ALL, overrides: (path: string, init?: RequestInit) => Response | undefined = () => undefined) {
  const request = vi.fn<AdminRequest>().mockImplementation((path, init) => {
    const custom = overrides(path, init);
    if (custom) return Promise.resolve(custom);
    if (path.startsWith('/admin/articles?')) return Promise.resolve(Response.json({ items: [article(), draft], page: 1, pageSize: 10, totalItems: 2 }));
    if (path.includes('/analytics')) return Promise.resolve(Response.json({ rangeDays: 30, fromDateUtc: '', throughDateUtc: '', totalViews: 1, averageViewsPerDay: 1 / 30, peakDateUtc: new Date().toISOString().slice(0, 10), peakViews: 1, previousPeriodTotalViews: 0, changePercent: null, daily: [{ dateUtc: new Date().toISOString().slice(0, 10), views: 1 }] }));
    if (path.startsWith('/admin/files')) return Promise.resolve(Response.json({ items: [{ id: '6f9619ff-8b86-d011-b42d-00cf4fc964ff', originalFileName: 'pic.png', contentType: 'image/png', sizeBytes: 1, width: 1, height: 1, uploadedBy: 'a', uploadedAtUtc: '' }], pageNumber: 1, pageSize: 100, totalItems: 1 }));
    if (init?.method === 'POST' || init?.method === 'PUT' || init?.method === 'DELETE') return Promise.resolve(Response.json(article()));
    return Promise.resolve(Response.json(article()));
  });
  render(<MemoryRouter><AdminCompareShopBlog requestAdmin={request} permissions={permissions} authorName="Andy" /></MemoryRouter>);
  return request;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('AdminCompareShopBlog', () => {
  it('renders real list with views column, draft dash, and No img fallback', async () => {
    const request = setup();
    expect(screen.getByText('Loading articles…')).toBeInTheDocument();
    expect(await screen.findByText('Cách săn sale')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/admin/articles?page=1&pageSize=10', expect.anything());
    expect(screen.getByText('1.234')).toBeInTheDocument();
    expect(screen.getByText('No img')).toBeInTheDocument();
    const img = document.querySelector('img')!;
    fireEvent.error(img);
    await waitFor(() => expect(screen.getAllByText('No img')).toHaveLength(2));
  });

  it('passes search and filters to the API', async () => {
    const user = userEvent.setup();
    const request = setup();
    await screen.findByText('Cách săn sale');
    await user.type(screen.getByLabelText('Search posts'), 'sale');
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'Draft');
    await user.selectOptions(screen.getByLabelText('Filter by category'), 'Đánh giá sản phẩm');
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringMatching(/q=sale.*category=.*status=Draft|status=Draft.*/), expect.anything()));
  });

  it('shows empty and error states', async () => {
    setup(ALL, path => path.startsWith('/admin/articles?') ? Response.json({ items: [], page: 1, pageSize: 10, totalItems: 0 }) : undefined);
    expect(await screen.findByText('No articles found.')).toBeInTheDocument();
    cleanup();
    setup(ALL, path => path.startsWith('/admin/articles?') ? new Response(null, { status: 403 }) : undefined);
    expect(await screen.findByRole('alert')).toHaveTextContent('permission');
  });

  it('hides actions without permissions', async () => {
    const user = userEvent.setup();
    setup(['articles.read']);
    await screen.findByText('Cách săn sale');
    expect(screen.queryByText('＋ Bài viết mới')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Actions for Cách săn sale'));
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Unpublish')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    expect(screen.getByText('View analytics')).toBeInTheDocument();
  });

  it('publishes, unpublishes and deletes via real endpoints', async () => {
    const user = userEvent.setup();
    const request = setup();
    await screen.findByText('Cách săn sale');
    await user.click(screen.getByLabelText('Actions for Bản nháp'));
    await user.click(screen.getByText('Publish'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/articles/2/publish', { method: 'POST' }));
    await user.click(screen.getByLabelText('Actions for Cách săn sale'));
    await user.click(screen.getByText('Unpublish'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/articles/1/unpublish', { method: 'POST' }));
    await user.click(screen.getByLabelText('Actions for Cách săn sale'));
    await user.click(screen.getByText('Delete'));
    await user.click(screen.getByText('Delete article'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/articles/1', { method: 'DELETE' }));
  });

  it('copies the full public link', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup();
    await screen.findByText('Cách săn sale');
    await user.click(screen.getByLabelText('Copy link for Cách săn sale'));
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^https?:\/\/.+\/blog\/cach-san-sale$/));
  });

  it('creates an article with Markdown and a cover chosen from Files', async () => {
    const user = userEvent.setup();
    const request = setup();
    await screen.findByText('Cách săn sale');
    await user.click(screen.getByText('＋ Bài viết mới'));
    await user.type(screen.getByLabelText('Article title'), 'Bài mới');
    await user.type(screen.getByLabelText('Tags'), 'shopping, review');
    await user.type(screen.getByLabelText('Article Markdown'), 'hello');
    await user.type(screen.getByPlaceholderText('A short summary for the article card'), 'Tóm tắt bài viết');
    await user.click(screen.getByText('H2'));
    expect(screen.getByRole('tab', { name: 'Write' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'false');
    await user.click(screen.getByText('Preview'));
    expect(screen.getByRole('heading', { name: 'Bài mới' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Write' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByText('Write'));
    await user.click(screen.getByText('Choose from Files'));
    await user.click(await screen.findByText('pic.png'));
    expect(screen.getByRole('img', { name: 'Selected cover' })).toHaveAttribute('src', 'https://api-compareshop-dev.giamha.online/files/6f9619ff-8b86-d011-b42d-00cf4fc964ff');
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/admin/files?'), expect.anything());
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      const call = request.mock.calls.find(([path, init]) => path === '/admin/articles' && init?.method === 'POST');
      expect(call).toBeTruthy();
      expect(JSON.parse(String(call![1]!.body))).toMatchObject({ title: 'Bài mới', slug: 'bai-moi', coverFileId: '6f9619ff-8b86-d011-b42d-00cf4fc964ff', category: 'shopping-tips', tags: ['shopping', 'review'], excerptText: 'Tóm tắt bài viết' });
    });
  });

  it('uses the API page field without ever requesting an undefined page', async () => {
    const request = setup();
    await screen.findByText('Cách săn sale');
    expect(request.mock.calls.map(([path]) => path).filter(path => path.includes('/admin/articles?'))).toEqual(['/admin/articles?page=1&pageSize=10']);
    expect(request).not.toHaveBeenCalledWith(expect.stringContaining('page=undefined'), expect.anything());
  });

  it('edits an article and shows save errors', async () => {
    const user = userEvent.setup();
    setup(ALL, (path, init) => init?.method === 'PUT' ? new Response(null, { status: 500 }) : undefined);
    await screen.findByText('Cách săn sale');
    await user.click(screen.getByLabelText('Actions for Cách săn sale'));
    await user.click(screen.getByText('Edit'));
    expect(await screen.findByText('Edit article')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('status 500');
  });

  it('zooms the cover lightbox and closes with Escape', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText('Cách săn sale');
    await user.click(screen.getByLabelText('Zoom cover'));
    const dialog = screen.getByRole('dialog', { name: 'Cover image preview' });
    expect(within(dialog).getByText('100%')).toBeInTheDocument();
    await user.click(dialog.querySelector('.blog-lightbox-box')!);
    expect(within(dialog).getByText('200%')).toBeInTheDocument();
    fireEvent.wheel(dialog.querySelector('.blog-lightbox-box')!, { deltaY: -100 });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('loads 7/30/90 day analytics with chart and table', async () => {
    const user = userEvent.setup();
    const request = setup();
    await screen.findByText('Cách săn sale');
    await user.click(screen.getByLabelText('Actions for Cách săn sale'));
    await user.click(screen.getByText('View analytics'));
    expect(await screen.findByRole('img', { name: '30 day views chart' })).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Analytics: Cách săn sale' });
    expect(within(dialog).getByText('1', { selector: '.blog-metrics article:first-child strong' })).toBeInTheDocument();
    await user.click(screen.getByText('7 days'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/articles/1/analytics?range=7', expect.anything()));
    await user.click(screen.getByText('90 days'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/articles/1/analytics?range=90', expect.anything()));
    await user.click(screen.getByText('Table'));
    expect(screen.getAllByRole('row').length).toBeGreaterThan(90);
    expect(within(dialog).getByRole('row', { name: `${new Date().toISOString().slice(0, 10)} 1` })).toBeInTheDocument();
  });
});
