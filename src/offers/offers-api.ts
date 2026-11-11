export type AdminRequest = (path: string, init?: RequestInit) => Promise<Response>;

export type StockStatus = 'in_stock' | 'out_of_stock' | 'unknown';
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
}

export interface OfferCounts {
  all: number;
  outlier: number;
  stale: number;
  outOfStock: number;
  inactive: number;
}

export interface AdminOffersPage {
  items: AdminOffer[];
  page: number;
  pageSize: number;
  totalItems: number;
  counts: OfferCounts;
}

export interface PriceHistoryPoint {
  dateUtc: string;
  priceVnd: number;
}

export interface OffersQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  shopId?: number | null;
  productId?: number | null;
  filter?: OfferFilter;
  sort?: OfferSort;
  staleHours?: number;
}

export class OffersApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'OffersApiError';
  }
}

async function checkedJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'You do not have permission to view offers.'
      : `${fallback} (request failed with status ${response.status}).`;
    throw new OffersApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export async function getAdminOffers(
  requestAdmin: AdminRequest,
  query: OffersQuery = {},
  signal?: AbortSignal,
): Promise<AdminOffersPage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const suffix = params.size ? `?${params.toString()}` : '';
  const response = await requestAdmin(`/admin/offers${suffix}`, { signal });
  return checkedJson<AdminOffersPage>(response, 'Could not load offers');
}

export async function getOfferPriceHistory(
  requestAdmin: AdminRequest,
  offerId: number,
  signal?: AbortSignal,
): Promise<PriceHistoryPoint[]> {
  const response = await requestAdmin(`/admin/offers/${encodeURIComponent(offerId)}/price-history?days=30`, { signal });
  return checkedJson<PriceHistoryPoint[]>(response, 'Could not load price history');
}

export async function updateAdminOffer(
  requestAdmin: AdminRequest,
  offerId: number,
  patch: { isActive?: boolean; isOutlier?: boolean; outlierReason?: string | null },
): Promise<void> {
  const response = await requestAdmin(`/admin/offers/${encodeURIComponent(offerId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'You do not have permission to update offers.'
      : `Could not update offer (request failed with status ${response.status}).`;
    throw new OffersApiError(message, response.status);
  }
}
