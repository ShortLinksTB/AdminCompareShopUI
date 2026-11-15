import { describe, expect, it, vi } from 'vitest';
import { getHomeShowcase, getHomeShowcaseFallbacks, issueHomeShowcasePreviewToken, publishHomeShowcase, resetHomeShowcaseDraft, saveHomeShowcaseDraft } from './home-showcase-api';

describe('home showcase API contract', () => {
  it('loads published fallback lists from the public showcase endpoint without requiring a Computers category lookup', async () => {
    const product = { id: 9, slug: 'fallback-product', name: 'Fallback product', imageUrl: '/image.png', brand: 'Brand', category: { id: 3, slug: 'computers', name: 'Computers' } };
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ featured: [product], interestedComputers: [product] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getHomeShowcaseFallbacks()).resolves.toEqual({
      featured: [{ id: 9, slug: 'fallback-product', name: 'Fallback product', imageUrl: '/image.png', brand: 'Brand', categoryName: 'Computers', categorySlug: 'computers', isVisible: true }],
      interestedComputers: [{ id: 9, slug: 'fallback-product', name: 'Fallback product', imageUrl: '/image.png', brand: 'Brand', categoryName: 'Computers', categorySlug: 'computers', isVisible: true }],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('https://api-compareshop-dev.giamha.online/api/v1/home/showcase', { signal: undefined });
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
    const input = {
      featured: [42, null, 17, ...Array(12).fill(null)],
      interestedComputers: [null, 84, ...Array(13).fill(null)],
    };
    const requestAdmin = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(saveHomeShowcaseDraft(requestAdmin, input)).resolves.toBeUndefined();
    const [path, init] = requestAdmin.mock.calls[0];
    expect(path).toBe('/admin/home-showcase/draft');
    expect(init?.method).toBe('PUT');
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual(input);
    expect(body.featured).toHaveLength(15);
    expect(body.interestedComputers).toHaveLength(15);
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
