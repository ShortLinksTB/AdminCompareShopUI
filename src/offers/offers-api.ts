export type AdminRequest = (path: string, init?: RequestInit) => Promise<Response>;

export type StockStatus = 'in_stock' | 'out_of_stock' | 'coming_soon' | 'unknown';
export type OfferFilter = 'all' | 'outlier' | 'stale' | 'out_of_stock' | 'inactive';
export type OfferSort = 'attention' | 'oldest' | 'priceAsc' | 'priceDesc' | 'name';

export interface AdminOffer {
  id: number;
  productId: number;
  partnerShopId: number;
  priceVnd: number;
  url: string | null;
  isActive: boolean;
  isOutlier: boolean;
  updatedAtUtc: string;
  productName: string | null;
  productImageUrl: string | null;
  partnerShopName: string | null;
  externalSku: string | null;
  imageUrl: string | null;
  originalPriceVnd: number | null;
  stockStatus: StockStatus;
  lowestPriceVnd: number | null;
  deltaVnd: number | null;
  deltaPercent: number | null;
  outlierReason: string | null;
  otherOffersAveragePriceVnd: number | null;
  outlierDeviationPercent: number | null;
}

export interface OfferCounts {
  all: number;
  outlier: number;
  stale: number;
  out_of_stock: number;
  inactive: number;
}

export interface AdminOfferPage {
  items: AdminOffer[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
  counts: OfferCounts;
}

export interface PriceHistoryPoint { dateUtc: string; priceVnd: number }

export class OffersApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'OffersApiError';
  }
}

async function ensureOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  if (response.status === 401 || response.status === 403) {
    throw new OffersApiError('You do not have permission to perform this action.', response.status);
  }
  let detail = '';
  try {
    const body = await response.json() as { message?: string; detail?: string; title?: string };
    detail = body.message || body.detail || body.title || '';
  } catch { /* non-JSON error response */ }
  throw new OffersApiError(detail || `${fallback} (request failed with status ${response.status}).`, response.status);
}

export async function getAdminOffers(
  requestAdmin: AdminRequest,
  query: { page: number; pageSize: number; q: string; shopId: number | null; filter: OfferFilter; sort: OfferSort; staleHours?: number },
  signal?: AbortSignal,
): Promise<AdminOfferPage> {
  const params = new URLSearchParams({
    page: String(query.page), pageSize: String(query.pageSize), sort: query.sort,
    staleHours: String(query.staleHours ?? 72),
  });
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.shopId !== null) params.set('shopId', String(query.shopId));
  if (query.filter !== 'all') params.set('filter', query.filter);
  const response = await requestAdmin(`/admin/offers?${params}`, { signal });
  await ensureOk(response, 'Could not load offers');
  return response.json() as Promise<AdminOfferPage>;
}

export async function getAllAdminOffers(requestAdmin: AdminRequest, signal?: AbortSignal): Promise<AdminOffer[]> {
  const first = await getAdminOffers(requestAdmin, { page: 1, pageSize: 100, q: '', shopId: null, filter: 'all', sort: 'attention' }, signal);
  const pages = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(first.totalItems / first.pageSize) - 1) }, (_, index) =>
    getAdminOffers(requestAdmin, { page: index + 2, pageSize: first.pageSize, q: '', shopId: null, filter: 'all', sort: 'attention' }, signal)));
  return [ ...first.items, ...pages.flatMap(result => result.items) ];
}

export async function getOfferPriceHistory(requestAdmin: AdminRequest, id: number, signal?: AbortSignal): Promise<PriceHistoryPoint[]> {
  const response = await requestAdmin(`/admin/offers/${encodeURIComponent(id)}/price-history?days=30`, { signal });
  await ensureOk(response, 'Could not load price history');
  return response.json() as Promise<PriceHistoryPoint[]>;
}

export async function getAdminProductOffers(requestAdmin: AdminRequest, productId: number, signal?: AbortSignal): Promise<AdminOffer[]> {
  const params = new URLSearchParams({ productId: String(productId), page: '1', pageSize: '100', sort: 'priceAsc' });
  const response = await requestAdmin(`/admin/offers?${params}`, { signal });
  await ensureOk(response, 'Could not load shop price comparison');
  const result = await response.json() as AdminOfferPage;
  return result.items;
}

export async function updateAdminOffer(
  requestAdmin: AdminRequest,
  id: number,
  patch: { priceVnd: number; url: string | null; isActive: boolean; isOutlier: boolean },
): Promise<void> {
  const response = await requestAdmin(`/admin/offers/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  });
  await ensureOk(response, 'Could not update offer');
}

export async function updateAdminOfferOutlierReason(requestAdmin: AdminRequest, id: number, outlierReason: string | null): Promise<void> {
  const response = await requestAdmin(`/admin/offers/${encodeURIComponent(id)}/outlier-reason`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outlierReason }),
  });
  await ensureOk(response, 'Could not save outlier reason');
}
