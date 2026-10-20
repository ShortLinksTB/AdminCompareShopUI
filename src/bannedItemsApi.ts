export type BanTargetType = 'Brand' | 'Product';

export interface BannedItem {
  id: string;
  targetType: BanTargetType;
  brandName?: string | null;
  productId?: string | null;
  productName?: string | null;
  reason?: string | null;
  isActive: boolean;
  createdBy?: string | null;
  createdAtUtc: string;
  revokedBy?: string | null;
  revokedAtUtc?: string | null;
}

export interface Page<T> {
  items: T[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
}

export interface ProductTarget {
  id: number;
  name: string;
  brand?: string | null;
  isActive: boolean;
}

export interface BanFilters {
  targetType: 'all' | BanTargetType;
  active: boolean;
  search: string;
  page: number;
  pageSize: number;
}

export class BanApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'BanApiError';
  }
}

const apiBase = (import.meta.env.VITE_COMPARESHOP_API_URL ?? '').replace(/\/$/, '');
const bansUrl = `${apiBase}/admin/compliance/bans`;
const productsUrl = `${apiBase}/admin/products`;

function headers(): HeadersInit {
  const token = window.localStorage.getItem('adminAccessToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function assertResponse(response: Response): Promise<void> {
  if (response.ok) return;

  let detail = '';
  try {
    const body = await response.json() as { message?: string; title?: string; detail?: string };
    detail = body.message ?? body.detail ?? body.title ?? '';
  } catch {
    // Keep the status-specific message below when the API has no JSON error body.
  }

  const statusMessage = response.status === 400
    ? 'The target details are invalid. Check the selected type and required fields.'
    : response.status === 404
      ? 'The selected product or ban could not be found.'
      : response.status === 409
        ? 'An active ban already exists for this target.'
        : response.status === 401 || response.status === 403
          ? 'You do not have permission to manage banned items.'
        : `Request failed (${response.status}). Please try again.`;
  throw new BanApiError(detail || statusMessage, response.status);
}

export async function getBannedItems(filters: BanFilters, signal?: AbortSignal): Promise<Page<BannedItem>> {
  const params = new URLSearchParams({
    active: String(filters.active),
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });
  if (filters.targetType !== 'all') params.set('targetType', filters.targetType);
  if (filters.search.trim()) params.set('search', filters.search.trim());

  const response = await fetch(`${bansUrl}?${params}`, {
    credentials: 'include',
    headers: headers(),
    signal,
  });
  await assertResponse(response);
  return response.json() as Promise<Page<BannedItem>>;
}

export async function getProductTargets(signal?: AbortSignal): Promise<ProductTarget[]> {
  const fetchPage = async (page: number) => {
    const response = await fetch(`${productsUrl}?page=${page}&pageSize=100`, {
      credentials: 'include',
      headers: headers(),
      signal,
    });
    await assertResponse(response);
    return response.json() as Promise<Page<ProductTarget>>;
  };

  const firstPage = await fetchPage(1);
  const pageCount = Math.ceil(firstPage.totalItems / firstPage.pageSize);
  if (pageCount <= 1) return firstPage.items;
  const remaining = await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => fetchPage(index + 2)));
  return [...firstPage.items, ...remaining.flatMap(result => result.items)];
}

export async function createBannedItem(input: { targetType: 'Brand'; brandName: string; reason: string } | { targetType: 'Product'; productId: number; reason: string }): Promise<void> {
  const response = await fetch(bansUrl, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify(input),
  });
  await assertResponse(response);
}

export async function revokeBannedItem(id: string): Promise<void> {
  const response = await fetch(`${bansUrl}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: headers(),
  });
  await assertResponse(response);
}
