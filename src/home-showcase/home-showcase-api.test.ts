import { describe, expect, it, vi } from 'vitest';
import { getHomeShowcase, issueHomeShowcasePreviewToken, publishHomeShowcase, resetHomeShowcaseDraft, saveHomeShowcaseDraft, type ShowcaseSelection } from './home-showcase-api';

const selection: ShowcaseSelection = { featured: Array(15).fill(null), interestedComputers: Array(15).fill(null) };

describe('home showcase API contract', () => {
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
