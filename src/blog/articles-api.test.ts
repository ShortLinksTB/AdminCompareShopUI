import { describe, expect, it, vi } from 'vitest';
import { ArticlesApiError, deleteArticle, getArticle, getArticleAnalytics, getArticles, saveArticle, setArticlePublished } from './articles-api';
import type { AdminRequest } from '../products/products-api';

describe('articles-api', () => {
  it('builds list, detail, save, publish, delete and analytics requests', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(() => Promise.resolve(Response.json({})));
    await getArticles(request, { page: 2, pageSize: 20, q: ' x ', category: 'all', status: 'Draft' });
    expect(request).toHaveBeenLastCalledWith('/admin/articles?page=2&pageSize=20&q=x&status=Draft', { signal: undefined });
    await getArticle(request, 3);
    await saveArticle(request, null, { title: 't', slug: 's', category: 'Đánh giá sản phẩm', excerptText: '', contentMarkdown: '', coverFileId: null, tags: null });
    expect(request).toHaveBeenLastCalledWith('/admin/articles', expect.objectContaining({ method: 'POST' }));
    await saveArticle(request, 3, { title: 't', slug: 's', category: 'Đánh giá sản phẩm', excerptText: '', contentMarkdown: '', coverFileId: null, tags: null });
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
    const request = vi.fn<AdminRequest>().mockResolvedValueOnce(new Response(null, { status: 403 })).mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(getArticle(request, 1)).rejects.toMatchObject({ status: 403, message: expect.stringContaining('permission') });
    await expect(getArticle(request, 1)).rejects.toBeInstanceOf(ArticlesApiError);
  });
});
