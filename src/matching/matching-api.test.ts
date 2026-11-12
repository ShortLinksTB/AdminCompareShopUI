import { describe, expect, it, vi } from 'vitest';
import { approveMatching, approveMatchingGroup, createMatchingProduct, fetchAllPendingMatchings, fetchMatchings, restoreMatching, skipMatching } from './matching-api';

const row = { id: 4, name: 'Laptop', verdict: 'confident', source: { ImageUrl: 'https://img.test/a.jpg', Price: 1200 }, attributes: { ram: '16GB' }, candidates: [{ productId: 7, score: 0.91, level: 'confident', differences: [] }] };

describe('matching API boundary', () => {
  it('maps the new paged contract and sends all supported filters', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ items: [row], page: 2, pageSize: 10, total: 21, counts: { all: 21, pending: 20, skipped: 1, confident: 9, review: 5, likely_new: 4, likely_skip: 2 } }));
    const result = await fetchMatchings(request, { status: 'pending', verdict: 'confident', q: ' mac ', page: 2, pageSize: 10 });
    expect(request).toHaveBeenCalledWith('/admin/matching?status=pending&page=2&pageSize=10&verdict=confident&q=mac');
    expect(result.items[0]).toMatchObject({ id: 4, verdict: 'confident', source: { imageUrl: 'https://img.test/a.jpg', price: 1200 }, attributes: { RAM: '16GB' }, candidates: [{ score: 0.91 }] });
    expect(result.counts.confident).toBe(9);
  });

  it('recognizes the API totalItems pagination field required to verify complete groups', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ items: [row], page: 1, pageSize: 100, totalItems: 75, counts: {} }));
    const result = await fetchMatchings(request, { status: 'pending', verdict: 'all', q: '', page: 1, pageSize: 100 });
    expect(result).toMatchObject({ total: 75, page: 1, pageSize: 100, hasPaginationMetadata: true });
  });

  it('accepts the legacy array response while retaining a useful empty count', async () => {
    const request = vi.fn().mockResolvedValue(Response.json([row]));
    const result = await fetchMatchings(request, { status: 'skipped', verdict: 'all', q: '', page: 1, pageSize: 20 });
    expect(request).toHaveBeenCalledWith('/admin/matching?status=skipped&page=1&pageSize=20');
    expect(result.items).toHaveLength(1);
    expect(result.counts.pending).toBe(1);
  });

  it('recognizes root totalItems and loads every page before confirming a group', async () => {
    const firstPage = { ...row, id: 2041, groupKey: 'qc-group' };
    const secondPage = { ...row, id: 2042, groupKey: 'qc-group' };
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ items: [firstPage], page: 1, pageSize: 1, totalItems: 2 }))
      .mockResolvedValueOnce(Response.json({ items: [secondPage], page: 2, pageSize: 1, totalItems: 2 }));

    await expect(fetchAllPendingMatchings(request)).resolves.toMatchObject([
      { id: 2041, groupKey: 'qc-group' },
      { id: 2042, groupKey: 'qc-group' },
    ]);
    expect(request).toHaveBeenNthCalledWith(2, '/admin/matching?status=pending&page=2&pageSize=100');
  });

  it('recognizes nested pagination.totalItems without weakening page consistency checks', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ items: [row], page: 1, pageSize: 1, pagination: { totalItems: 2 } }))
      .mockResolvedValueOnce(Response.json({ items: [{ ...row, id: 5 }], page: 2, pageSize: 1, pagination: { totalItems: 3 } }));

    await expect(fetchAllPendingMatchings(request)).rejects.toThrow('không nhất quán');
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
    await createMatchingProduct(request, 4, { name: 'Laptop', brand: 'Acme', description: null, categoryId: 9, imageUrl: 'https://api.example/files/file-1', imageChoice: 'files', applyToIds: [4, 5] });
    await skipMatching(request, 4, 'other', 'note');
    await restoreMatching(request, 4);
    expect(request.mock.calls.map(call => call[0])).toEqual(['/admin/matching/4/create-product', '/admin/matching/4/skip', '/admin/matching/4/restore']);
    expect(request.mock.calls[0]?.[1]).toMatchObject({ body: '{"name":"Laptop","brand":"Acme","description":null,"categoryId":9,"imageUrl":"https://api.example/files/file-1","imageChoice":"files","applyToIds":[4,5]}' });
    const failed = vi.fn().mockResolvedValue(Response.json({ message: 'category unavailable' }, { status: 409 }));
    await expect(restoreMatching(failed, 4)).rejects.toThrow('category unavailable');
  });
});
