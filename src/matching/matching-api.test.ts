import { describe, expect, it, vi } from 'vitest';
import { approveMatching, approveMatchingGroup, createMatchingProduct, fetchMatchings, restoreMatching, skipMatching } from './matching-api';

const row = { id: 4, name: 'Laptop', verdict: 'confident', source: { ImageUrl: 'https://img.test/a.jpg', Price: 1200 }, attributes: { ram: '16GB' }, candidates: [{ productId: 7, score: 0.91, level: 'confident', differences: [] }] };

describe('matching API boundary', () => {
  it('maps the new paged contract and sends all supported filters', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ items: [row], page: 2, pageSize: 10, total: 21, counts: { all: 21, pending: 20, skipped: 1, confident: 9, review: 5, likely_new: 4, likely_skip: 2 } }));
    const result = await fetchMatchings(request, { status: 'pending', verdict: 'confident', q: ' mac ', page: 2, pageSize: 10 });
    expect(request).toHaveBeenCalledWith('/admin/matching?status=pending&page=2&pageSize=10&verdict=confident&q=mac');
    expect(result.items[0]).toMatchObject({ id: 4, verdict: 'confident', source: { imageUrl: 'https://img.test/a.jpg', price: 1200 }, attributes: { RAM: '16GB' }, candidates: [{ score: 0.91 }] });
    expect(result.counts.confident).toBe(9);
  });

  it('accepts the legacy array response while retaining a useful empty count', async () => {
    const request = vi.fn().mockResolvedValue(Response.json([row]));
    const result = await fetchMatchings(request, { status: 'skipped', verdict: 'all', q: '', page: 1, pageSize: 20 });
    expect(request).toHaveBeenCalledWith('/admin/matching?status=skipped&page=1&pageSize=20');
    expect(result.items).toHaveLength(1);
    expect(result.counts.pending).toBe(1);
  });

  it('reports queue errors and sends explicit single and group decisions', async () => {
    const failing = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    await expect(fetchMatchings(failing, { status: 'pending', verdict: 'all', q: '', page: 1, pageSize: 20 })).rejects.toThrow('Không tải được hàng đợi');
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await approveMatching(request, 4, 7);
    await approveMatchingGroup(request, [4, 5], 7);
    expect(request.mock.calls[0]).toEqual(['/admin/matching/4/approve', expect.objectContaining({ body: '{"productId":7}' })]);
    expect(request.mock.calls[1]).toEqual(['/admin/matching/approve-group', expect.objectContaining({ body: '{"ids":[4,5],"productId":7}' })]);
  });

  it('sends create, skip and restore payloads and surfaces server error text', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await createMatchingProduct(request, 4, { name: 'Laptop', brand: 'Acme', slug: 'laptop', imageChoice: 'files', imageId: 'file-1', applyGroup: true });
    await skipMatching(request, 4, 'other', 'note');
    await restoreMatching(request, 4);
    expect(request.mock.calls.map(call => call[0])).toEqual(['/admin/matching/4/create-product', '/admin/matching/4/skip', '/admin/matching/4/restore']);
    expect(request.mock.calls[0]?.[1]).toMatchObject({ body: '{"name":"Laptop","brand":"Acme","slug":"laptop","imageChoice":"files","imageId":"file-1","applyGroup":true}' });
    const failed = vi.fn().mockResolvedValue(Response.json({ message: 'category unavailable' }, { status: 409 }));
    await expect(restoreMatching(failed, 4)).rejects.toThrow('category unavailable');
  });
});
