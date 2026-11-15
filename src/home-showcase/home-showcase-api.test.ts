import { describe, expect, it, vi } from 'vitest';
import { getHomeShowcase, getHomeShowcaseFallbacks, issueHomeShowcasePreviewToken, publishHomeShowcase, resetHomeShowcaseDraft, saveHomeShowcaseDraft, type ShowcaseSelection } from './home-showcase-api';

const selection: ShowcaseSelection = { featured: Array(15).fill(null), interestedComputers: Array(15).fill(null) };

describe('home showcase API contract', () => {
  it('loads the same public catalog fallback lists used by the storefront', async () => {
    const product = { id: 9, slug: 'fallback-product', name: 'Fallback product', imageUrl: '/image.png', brand: 'Brand', category: { id: 3, slug: 'computers', name: 'Computers' } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ items: [{ id: 3, slug: 'computers', name: 'Computers' }] }))
      .mockResolvedValueOnce(Response.json({ items: [product] }))
      .mockResolvedValueOnce(Response.json({ items: [product] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getHomeShowcaseFallbacks()).resolves.toEqual({
      featured: [{ id: 9, slug: 'fallback-product', name: 'Fallback product', imageUrl: '/image.png', brand: 'Brand', categoryName: 'Computers', categorySlug: 'computers', isVisible: true }],
      interestedComputers: [{ id: 9, slug: 'fallback-product', name: 'Fallback product', imageUrl: '/image.png', brand: 'Brand', categoryName: 'Computers', categorySlug: 'computers', isVisible: true }],
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://api-compareshop-dev.giamha.online/api/v1/categories',
      'https://api-compareshop-dev.giamha.online/api/v1/products?page=1&pageSize=15',
      'https://api-compareshop-dev.giamha.online/api/v1/products?categoryId=3&page=1&pageSize=15',
    ]);
    vi.unstubAllGlobals();
  });

  it('loads both draft and published snapshots with the abort signal', async () => {
    const signal = new AbortController().signal;
    const result = { draft: { featured: [], interestedComputers: [] }, published: { featured: [], interestedComputers: [] } };
    const requestAdmin = vi.fn().mockResolvedValue(Response.json(result));

    await expect(getHomeShowcase(requestAdmin, signal)).resolves.toEqual(result);
    expect(requestAdmin).toHaveBeenCalledWith('/admin/home-showcase', { signal });
  });

  it('writes the complete 15-slot draft for both sections, including empty slots', async () => {
    const input = { ...selection, featured: [42, ...Array(14).fill(null)] };
    const requestAdmin = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(saveHomeShowcaseDraft(requestAdmin, input)).resolves.toBeUndefined();
    const [, init] = requestAdmin.mock.calls[0];
    expect(init?.method).toBe('PUT');
    const body = JSON.parse(String(init?.body));
    expect(body.featured).toHaveLength(15);
    expect(body.interestedComputers).toHaveLength(15);
    expect(body.featured[0]).toEqual({ slotIndex: 1, productId: 42 });
    expect(body.featured[1]).toEqual({ slotIndex: 2, productId: null });
    expect(body.interestedComputers[14]).toEqual({ slotIndex: 15, productId: null });
  });

  it('uses separate reset, publish, and preview-token endpoints', async () => {
    const requestAdmin = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ token: 'short-lived-token' }));

    await resetHomeShowcaseDraft(requestAdmin);
    await publishHomeShowcase(requestAdmin);
    await expect(issueHomeShowcasePreviewToken(requestAdmin)).resolves.toBe('short-lived-token');
    expect(requestAdmin.mock.calls.map(([path, init]) => [path, init?.method])).toEqual([
      ['/admin/home-showcase/draft/reset', 'POST'],
      ['/admin/home-showcase/publish', 'POST'],
      ['/admin/home-showcase/preview-token', 'POST'],
    ]);
  });

  it('surfaces failed mutation statuses and rejects a missing preview token', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    await expect(publishHomeShowcase(requestAdmin)).rejects.toMatchObject({ status: 500 });
    requestAdmin.mockResolvedValueOnce(Response.json({}));
    await expect(issueHomeShowcasePreviewToken(requestAdmin)).rejects.toThrow('API không trả về token');
  });
});
