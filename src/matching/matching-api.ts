export type Verdict = 'confident' | 'review' | 'likely_new' | 'likely_skip';
export type MatchingCandidate = {
  productId: number; name: string; brand: string | null; score: number;
  level: 'confident' | 'review' | 'variant'; differences: Array<{ attribute: string; source: string | null; candidate: string | null; kind?: string }>;
  attributes: Record<string, string | null>;
};
export type PendingMatching = {
  id: number; name: string; brand: string | null; productId: number | null; createdAtUtc: string;
  isApproved: boolean; externalSku: string | null; dataSourceId: number | null; candidates: MatchingCandidate[];
  source: { imageUrl: string | null; price: number | null; shopName: string | null; sourceName: string | null; sourceUrl: string | null; specificationsJson?: string | null };
  attributes: Record<string, string | null>; verdict: Verdict; groupKey: string | null;
  status: 'pending' | 'skipped'; skipReason?: string | null; skipNote?: string | null;
};
export type MatchingCounts = Record<Verdict | 'all' | 'pending' | 'skipped', number>;
export type MatchingPageResult = { items: PendingMatching[]; page: number; pageSize: number; total: number; counts: MatchingCounts };
export type AdminRequest = (path: string, init?: RequestInit) => Promise<Response>;

const labels: Record<string, string> = { brand: 'Hãng', line: 'Dòng', chip: 'Chip', gpu: 'GPU', ram: 'RAM', ssd: 'Ổ cứng', screen: 'Màn hình', acc: 'Phụ kiện' };
const verdicts = new Set<Verdict>(['confident', 'review', 'likely_new', 'likely_skip']);
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const str = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
const num = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
function mapItem(value: unknown): PendingMatching {
  const item = record(value), source = record(item.source), sourceDetail = record(item.sourceDetail), rawCandidates = Array.isArray(item.candidates) ? item.candidates : [];
  const attributes = record(item.attributes);
  const candidates = rawCandidates.map((candidateValue): MatchingCandidate => {
    const candidate = record(candidateValue), diffs = Array.isArray(candidate.differences) ? candidate.differences : [];
    const rawScore = num(candidate.score) ?? (num(candidate.similarityScore) ?? 0);
    return { productId: Number(candidate.productId), name: str(candidate.name) ?? `Product #${candidate.productId}`, brand: str(candidate.brand), score: rawScore > 1 ? rawScore / 100 : rawScore, level: candidate.level === 'confident' || candidate.level === 'variant' ? candidate.level : 'review', differences: diffs.map(diffValue => { const diff = record(diffValue); const key = String(diff.attribute ?? diff.key ?? ''); return { attribute: labels[key] ?? key, source: str(diff.source ?? diff.sourceValue ?? diff.listingValue ?? diff.left), candidate: str(diff.candidate ?? diff.candidateValue ?? diff.productValue ?? diff.right), kind: str(diff.kind) ?? undefined }; }), attributes: Object.fromEntries(Object.entries(record(candidate.attributes)).map(([key, v]) => [labels[key] ?? key, str(v)])) };
  }).filter(candidate => Number.isFinite(candidate.productId));
  const verdict = verdicts.has(item.verdict as Verdict) ? item.verdict as Verdict : 'review';
  return {
    id: Number(item.id), name: str(item.name) ?? 'Mặt hàng chưa có tên', brand: str(item.brand), productId: num(item.productId), createdAtUtc: str(item.createdAtUtc) ?? '', isApproved: Boolean(item.isApproved), externalSku: str(item.externalSku), dataSourceId: num(item.dataSourceId), candidates,
    source: { imageUrl: str(source.imageUrl ?? source.ImageUrl ?? sourceDetail.imageUrl ?? sourceDetail.ImageUrl), price: num(source.price ?? source.Price ?? sourceDetail.priceVnd ?? sourceDetail.PriceVnd), shopName: str(source.shopName ?? source.partnerShopDisplayName ?? sourceDetail.partnerShopDisplayName ?? sourceDetail.PartnerShopDisplayName), sourceName: str(source.sourceName ?? source.dataSourceDisplayName ?? sourceDetail.dataSourceDisplayName ?? sourceDetail.DataSourceDisplayName), sourceUrl: str(source.url ?? source.sourceUrl), specificationsJson: str(source.specificationsJson ?? sourceDetail.specificationsJson ?? sourceDetail.SpecificationsJson) },
    attributes: Object.fromEntries(Object.entries(attributes).map(([key, v]) => [labels[key] ?? key, str(v)])), verdict, groupKey: str(item.groupKey), status: item.status === 'skipped' ? 'skipped' : 'pending', skipReason: str(item.skipReason), skipNote: str(item.skipNote),
  };
}

export async function fetchMatchings(request: AdminRequest, query: { status: 'pending' | 'skipped'; verdict: string; q: string; page: number; pageSize: number }): Promise<MatchingPageResult> {
  const params = new URLSearchParams({ status: query.status, page: String(query.page), pageSize: String(query.pageSize) });
  if (query.verdict !== 'all') params.set('verdict', query.verdict);
  if (query.q.trim()) params.set('q', query.q.trim());
  const response = await request(`/admin/matching?${params}`);
  if (!response.ok) throw new Error(response.status === 403 ? 'Bạn không có quyền xem hàng đợi Product Matching.' : 'Không tải được hàng đợi. Vui lòng thử lại.');
  const body: unknown = await response.json();
  const root = record(body), items = Array.isArray(body) ? body : Array.isArray(root.items) ? root.items : [];
  const rawCounts = record(root.counts);
  const mapped = items.map(mapItem);
  const counts: MatchingCounts = { all: num(rawCounts.all) ?? mapped.length, pending: num(rawCounts.pending) ?? mapped.filter(i => i.status === 'pending').length, skipped: num(rawCounts.skipped) ?? mapped.filter(i => i.status === 'skipped').length, confident: num(rawCounts.confident) ?? 0, review: num(rawCounts.review) ?? 0, likely_new: num(rawCounts.likely_new) ?? 0, likely_skip: num(rawCounts.likely_skip) ?? 0 };
  return { items: mapped, page: num(root.page) ?? query.page, pageSize: num(root.pageSize) ?? query.pageSize, total: num(root.total) ?? num(record(root.pagination).total) ?? mapped.length, counts };
}
async function post(request: AdminRequest, path: string, body?: unknown): Promise<unknown> {
  const response = await request(path, { method: 'POST', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  if (!response.ok) { let message = `Thao tác thất bại (${response.status}).`; try { const data = record(await response.json()); message = str(data.message ?? data.title ?? data.detail) ?? message; } catch { /* Keep stable fallback for an empty error response. */ } throw new Error(message); }
  if (response.status === 204) return undefined;
  try { return await response.json(); } catch { return undefined; }
}
export const approveMatching = (request: AdminRequest, id: number, productId: number) => post(request, `/admin/matching/${id}/approve`, { productId });
export const approveMatchingGroup = (request: AdminRequest, ids: number[], productId: number) => post(request, '/admin/matching/approve-group', { ids, productId });
export const createMatchingProduct = (request: AdminRequest, id: number, input: { name: string; brand: string; slug: string; imageChoice: 'files' | 'shop' | 'none'; imageId: string | null; applyGroup: boolean }) => post(request, `/admin/matching/${id}/create-product`, input);
export const skipMatching = (request: AdminRequest, id: number, reason: string, note: string) => post(request, `/admin/matching/${id}/skip`, { reason, note });
export const restoreMatching = (request: AdminRequest, id: number) => post(request, `/admin/matching/${id}/restore`);
export function displayVerdict(verdict: Verdict): string { return ({ confident: 'Chắc chắn', review: 'Cần xem', likely_new: 'Sản phẩm mới', likely_skip: 'Có thể bỏ qua' })[verdict]; }
export function formatPrice(price: number | null): string { return price === null ? 'Chưa có giá' : new Intl.NumberFormat('vi-VN').format(price) + ' ₫'; }
