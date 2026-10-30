export type MatchingCandidate = {
  productId: number;
  name: string;
  brand: string | null;
  similarityScore: number;
};

export type PendingMatching = {
  id: number;
  name: string;
  brand: string | null;
  productId: number | null;
  createdAtUtc: string;
  isApproved: boolean;
  externalSku: string | null;
  dataSourceId: number | null;
  candidates: MatchingCandidate[];
};

export type AdminRequest = (path: string, init?: RequestInit) => Promise<Response>;

async function ensureSuccess(response: Response, fallback: string): Promise<void> {
  if (!response.ok) throw new Error(fallback);
}

export async function fetchPendingMatchings(requestAdmin: AdminRequest): Promise<PendingMatching[]> {
  const response = await requestAdmin('/admin/matching');
  await ensureSuccess(response, 'Không tải được danh sách chờ duyệt. Vui lòng thử lại.');
  return response.json() as Promise<PendingMatching[]>;
}

export async function approveMatching(requestAdmin: AdminRequest, matchingId: number, productId: number): Promise<void> {
  const response = await requestAdmin(`/admin/matching/${matchingId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId }),
  });
  await ensureSuccess(response, 'Duyệt thất bại do lỗi mạng. Lựa chọn của bạn vẫn được giữ.');
}

export function reconcileSelections(
  previous: Record<number, MatchingCandidate>,
  matchings: PendingMatching[],
): Record<number, MatchingCandidate> {
  return Object.fromEntries(Object.entries(previous).filter(([matchingId, productId]) => {
    const matching = matchings.find(item => item.id === Number(matchingId));
    const candidate = matching?.candidates.find(item => item.productId === productId.productId);
    return candidate?.name === productId.name
      && candidate.brand === productId.brand
      && candidate.similarityScore === productId.similarityScore;
  }).map(([matchingId, candidate]) => [Number(matchingId), candidate]));
}
