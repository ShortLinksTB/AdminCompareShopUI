import { describe, expect, it, vi } from 'vitest';
import { ArticlesApiError, deleteArticle, getArticle, getArticleAnalytics, getArticles, saveArticle, setArticlePublished } from './articles-api';
import type { AdminRequest } from '../products/products-api';

describe('articles-api', () => {
  it('round-trips coverFileId as a nullable GUID string', async () => {
    const coverFileId = '6f9619ff-8b86-d011-b42d-00cf4fc964ff';
    const request = vi.fn<AdminRequest>().mockResolvedValueOnce(Response.json({
      id: 3, title: 't', slug: 's', category: 'product-reviews', excerptText: '', contentMarkdown: '',
      coverFileId, tags: [], status: 'Draft', authorName: 'Andy', publishedAtUtc: null,
      createdAtUtc: '', updatedAtUtc: '', totalViews: 0,
    })).mockResolvedValueOnce(Response.json({
      id: 3, title: 't', slug: 's', category: 'product-reviews', excerptText: '', contentMarkdown: '',
      coverFileId, tags: [], status: 'Draft', authorName: 'Andy', publishedAtUtc: null,
      createdAtUtc: '', updatedAtUtc: '', totalViews: 0,
    })).mockResolvedValueOnce(Response.json({
      id: 3, title: 't', slug: 's', category: 'product-reviews', excerptText: '', contentMarkdown: '',
      coverFileId: null, tags: [], status: 'Draft', authorName: 'Andy', publishedAtUtc: null,
      createdAtUtc: '', updatedAtUtc: '', totalViews: 0,
    }));

    await expect(getArticle(request, 3)).resolves.toMatchObject({ coverFileId });
    const saved = await saveArticle(request, 3, { title: 't', slug: 's', category: 'Đánh giá sản phẩm', excerptText: '', contentMarkdown: '', coverFileId, tags: null });
    expect(saved.coverFileId).toBe(coverFileId);
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toMatchObject({ coverFileId });

    await saveArticle(request, 3, { title: 't', slug: 's', category: 'Đánh giá sản phẩm', excerptText: '', contentMarkdown: '', coverFileId: null, tags: null });
    expect(JSON.parse(String(request.mock.calls[2][1]?.body))).toMatchObject({ coverFileId: null });
  });

  it('builds list, detail, save, publish, delete and analytics requests', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(() => Promise.resolve(Response.json({ items: [], page: 1, pageSize: 10, totalItems: 0 })));
    await getArticles(request, { page: 2, pageSize: 20, q: ' x ', category: 'all', status: 'Draft' });
    expect(request).toHaveBeenLastCalledWith('/admin/articles?page=2&pageSize=20&q=x&status=Draft', { signal: undefined });
    await getArticle(request, 3);
    await saveArticle(request, null, { title: 't', slug: 's', category: 'Đánh giá sản phẩm', excerptText: '', contentMarkdown: '', coverFileId: null, tags: null });
    expect(JSON.parse(request.mock.calls.at(-1)![1]?.body as string)).toMatchObject({ category: 'product-reviews', tags: [] });
    expect(request).toHaveBeenLastCalledWith('/admin/articles', expect.objectContaining({ method: 'POST' }));
    await saveArticle(request, 3, { title: 't', slug: 's', category: 'Xu hướng thị trường', excerptText: '', contentMarkdown: '', coverFileId: null, tags: 'shopping, review' });
    expect(JSON.parse(request.mock.calls.at(-1)![1]?.body as string)).toMatchObject({ category: 'market-trends', tags: ['shopping', 'review'] });
    expect(request).toHaveBeenLastCalledWith('/admin/articles/3', expect.objectContaining({ method: 'PUT' }));
    request.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await setArticlePublished(request, 3, true)).toBeUndefined();
    await setArticlePublished(request, 3, false);
    expect(request).toHaveBeenLastCalledWith('/admin/articles/3/unpublish', { method: 'POST' });
    await deleteArticle(request, 3);
    await getArticleAnalytics(request, 3, 90);
    expect(request).toHaveBeenLastCalledWith('/admin/articles/3/analytics?range=90', { signal: undefined });
  });

  it('maps 401/403 and other failures to errors', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValueOnce(new Response(null, { status: 403 })).mockResolvedValueOnce(Response.json({ title: 'One or more validation errors occurred.', errors: { ExcerptText: ['Short description is required.'] } }, { status: 400 })).mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(getArticle(request, 1)).rejects.toMatchObject({ status: 403, message: expect.stringContaining('permission') });
    await expect(getArticle(request, 1)).rejects.toMatchObject({ status: 400, message: 'Short description is required.' });
    await expect(getArticle(request, 1)).rejects.toBeInstanceOf(ArticlesApiError);
  });

  it('maps API page and category values into the UI model and guards an invalid requested page', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(() => Promise.resolve(Response.json({ items: [{ id: 1, title: 't', slug: 't', category: 'shopping-tips', tags: ['one', 'two'] }], page: 2, pageSize: 10, totalItems: 11 })));
    await expect(getArticles(request, { page: 1, pageSize: 10, q: '', category: 'all', status: 'all' })).resolves.toMatchObject({ pageNumber: 2, items: [{ category: 'Kinh nghiệm mua sắm', tags: 'one, two' }] });
    await getArticles(request, { page: Number.NaN, pageSize: 10, q: '', category: 'all', status: 'all' });
    expect(request).toHaveBeenLastCalledWith('/admin/articles?page=1&pageSize=10', { signal: undefined });
  });

  it('maps localized category filters to API values', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ items: [], page: 1, pageSize: 10, totalItems: 0 }));
    await getArticles(request, { page: 1, pageSize: 10, q: '', category: 'Đánh giá sản phẩm', status: 'all' });
    expect(request).toHaveBeenCalledWith('/admin/articles?page=1&pageSize=10&category=product-reviews', { signal: undefined });
  });
});
