import { describe, expect, it, vi } from 'vitest';
import { ArticlesApiError, deleteArticle, fromArticleCategoryValue, getArticle, getArticleAnalytics, getArticles, saveArticle, setArticlePublished, toArticleCategoryValue, toArticleTags } from './articles-api';
import type { AdminRequest } from '../products/products-api';

describe('articles-api', () => {
  it('builds list, detail, save, publish, delete and analytics requests', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(() => Promise.resolve(Response.json({})));
    request.mockResolvedValueOnce(Response.json({ items: [], page: 2, pageSize: 20, totalItems: 0 }));
    const page = await getArticles(request, { page: 2, pageSize: 20, q: ' x ', category: 'all', status: 'Draft' });
    expect(request).toHaveBeenLastCalledWith('/admin/articles?page=2&pageSize=20&q=x&status=Draft', { signal: undefined });
    expect(page.pageNumber).toBe(2);
    await getArticle(request, 3);
    const input = { title: 't', slug: 's', category: 'Đánh giá sản phẩm' as const, excerptText: '', contentMarkdown: '', coverFileId: null, tags: 'one, two' };
    request.mockResolvedValueOnce(Response.json({ id: 1, title: 't', slug: 's', category: 'product-reviews', excerptText: '', contentMarkdown: '', coverFileId: null, tags: ['one', 'two'], status: 'Draft', authorName: '', publishedAtUtc: null, createdAtUtc: '', updatedAtUtc: '', totalViews: 0 }));
    await saveArticle(request, null, input);
    expect(request).toHaveBeenLastCalledWith('/admin/articles', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(request.mock.calls.at(-1)?.[1]?.body))).toMatchObject({ category: 'product-reviews', tags: ['one', 'two'] });
    request.mockResolvedValueOnce(Response.json({ id: 1, title: 't', slug: 's', category: 'product-reviews', excerptText: '', contentMarkdown: '', coverFileId: null, tags: [], status: 'Draft', authorName: '', publishedAtUtc: null, createdAtUtc: '', updatedAtUtc: '', totalViews: 0 }));
    await saveArticle(request, 3, { ...input, tags: null, category: 'Xu hướng thị trường' });
    expect(request).toHaveBeenLastCalledWith('/admin/articles/3', expect.objectContaining({ method: 'PUT' }));
    expect(JSON.parse(String(request.mock.calls.at(-1)?.[1]?.body))).toMatchObject({ category: 'market-trends', tags: [] });
    request.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await setArticlePublished(request, 3, true)).toBeUndefined();
    await setArticlePublished(request, 3, false);
    expect(request).toHaveBeenLastCalledWith('/admin/articles/3/unpublish', { method: 'POST' });
    await deleteArticle(request, 3);
    await getArticleAnalytics(request, 3, 90);
    expect(request).toHaveBeenLastCalledWith('/admin/articles/3/analytics?range=90', { signal: undefined });
  });

  it('maps all category values, tags, and invalid pagination safely', async () => {
    expect(toArticleCategoryValue('Kinh nghiệm mua sắm')).toBe('shopping-tips');
    expect(toArticleCategoryValue('Đánh giá sản phẩm')).toBe('product-reviews');
    expect(toArticleCategoryValue('Xu hướng thị trường')).toBe('market-trends');
    expect(fromArticleCategoryValue('shopping-tips')).toBe('Kinh nghiệm mua sắm');
    expect(fromArticleCategoryValue('product-reviews')).toBe('Đánh giá sản phẩm');
    expect(fromArticleCategoryValue('market-trends')).toBe('Xu hướng thị trường');
    expect(toArticleTags(' a, , b ')).toEqual(['a', 'b']);
    expect(toArticleTags(null)).toEqual([]);
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ items: [], page: 1, pageSize: 10, totalItems: 0 }));
    await getArticles(request, { page: undefined as unknown as number, pageSize: 10, q: '', category: 'all', status: 'all' });
    expect(request).toHaveBeenCalledWith('/admin/articles?page=1&pageSize=10', { signal: undefined });
  });

  it('normalizes wire response page, category, and tags for the UI', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ items: [{ id: 1, title: 't', slug: 's', category: 'market-trends', excerptText: '', contentMarkdown: '', coverFileId: null, tags: ['market', 'news'], status: 'Draft', authorName: '', publishedAtUtc: null, createdAtUtc: '', updatedAtUtc: '', totalViews: 0 }], page: 3, pageSize: 10, totalItems: 25 }));
    const result = await getArticles(request, { page: 2, pageSize: 10, q: '', category: 'all', status: 'all' });
    expect(result).toMatchObject({ pageNumber: 3, items: [{ category: 'Xu hướng thị trường', tags: 'market, news' }] });
  });

  it('maps 401/403 and other failures to errors', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValueOnce(new Response(null, { status: 403 })).mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(getArticle(request, 1)).rejects.toMatchObject({ status: 403, message: expect.stringContaining('permission') });
    await expect(getArticle(request, 1)).rejects.toBeInstanceOf(ArticlesApiError);
  });

  it('surfaces API validation messages when saving an article', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ errors: { excerptText: ['Excerpt is required.'], category: ['Category is invalid.'] } }, { status: 400 }));
    await expect(saveArticle(request, null, { title: 't', slug: 's', category: 'Kinh nghiệm mua sắm', excerptText: '', contentMarkdown: '', coverFileId: null, tags: null }))
      .rejects.toMatchObject({ status: 400, message: 'Excerpt is required. Category is invalid.' });
  });
});
