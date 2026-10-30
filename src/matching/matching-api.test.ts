import { describe, expect, it, vi } from 'vitest';
import { approveMatching, fetchPendingMatchings, reconcileSelections, type PendingMatching } from './matching-api';

const pending: PendingMatching = {
  id: 12,
  name: 'Laptop source',
  brand: 'Acme',
  productId: null,
  createdAtUtc: '2026-10-29T00:00:00Z',
  isApproved: false,
  externalSku: 'SKU-12',
  dataSourceId: 4,
  candidates: [
    { productId: 71, name: 'Laptop product', brand: 'Acme', similarityScore: 0.9 },
    { productId: 72, name: 'Another laptop', brand: 'Acme', similarityScore: 0.6 },
  ],
};

describe('matching API boundary', () => {
  it('loads the pending queue from the existing admin endpoint', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(Response.json([pending]));

    await expect(fetchPendingMatchings(requestAdmin)).resolves.toEqual([pending]);
    expect(requestAdmin).toHaveBeenCalledWith('/admin/matching');
  });

  it('surfaces an actionable message when queue loading fails', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response('', { status: 503 }));

    await expect(fetchPendingMatchings(requestAdmin)).rejects.toThrow('Không tải được danh sách chờ duyệt. Vui lòng thử lại.');
  });

  it('sends only the explicitly selected product id for approval', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await approveMatching(requestAdmin, 12, 72);
    expect(requestAdmin).toHaveBeenCalledWith('/admin/matching/12/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"productId":72}',
    });
  });

  it('rejects failed approvals so the page can retain the selection for retry', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response('', { status: 500 }));

    await expect(approveMatching(requestAdmin, 12, 71)).rejects.toThrow('Duyệt thất bại');
  });

  it('clears selections for removed or changed candidates and keeps unchanged candidates', () => {
    const changed = { ...pending, candidates: [{ ...pending.candidates[0], similarityScore: 0.4 }] };
    const selections = {
      12: pending.candidates[0],
      13: { ...pending.candidates[1] },
    };

    expect(reconcileSelections(selections, [changed])).toEqual({});
    expect(reconcileSelections({ 12: pending.candidates[0] }, [pending])).toEqual({ 12: pending.candidates[0] });
  });
});
