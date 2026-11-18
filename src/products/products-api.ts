export type AdminRequest = (path: string, init?: RequestInit) => Promise<Response>;

export interface AdminProduct {
  id: number;
  slug: string;
  name: string;
  brand: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  categoryId: number;
  isActive: boolean;
  imageUrl: string | null;
}

export interface AdminCategory {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  parentCategoryId?: number | null;
}

export interface ProductInput {
  slug: string;
  name: string;
  brand: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  categoryId: number;
  isActive: boolean;
  imageUrl: string | null;
}

export interface AdminProductMatching {
  id: number;
  name: string;
  externalSku: string | null;
  dataSourceId: number | string | null;
  dataSourceDisplayName: string | null;
  createdAtUtc: string;
}

export interface AdminProductPage {
  items: AdminProduct[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
}

export class ProductsApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ProductsApiError';
  }
}

export function productSlugFromName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function mutationError(response: Response, action: string, permissionMessage: string): Promise<ProductsApiError> {
  const fallback = response.status === 401 || response.status === 403
    ? permissionMessage
    : `${action} (request failed with status ${response.status}).`;
  let detail = '';
  try {
    const body = await response.json() as { message?: unknown; detail?: unknown; title?: unknown; errors?: unknown };
    const errors = body.errors && typeof body.errors === 'object'
      ? Object.values(body.errors as Record<string, unknown>).flatMap(value => Array.isArray(value) ? value : [value]).filter(value => typeof value === 'string').join(' ')
      : '';
    detail = [body.message, body.detail, errors, body.title].find(value => typeof value === 'string' && value.trim()) as string | undefined ?? '';
  } catch { /* Use the actionable status fallback for empty/non-JSON responses. */ }
  return new ProductsApiError(detail || fallback, response.status);
}

export async function getAdminProducts(
  requestAdmin: AdminRequest,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
  isActive?: boolean | null,
): Promise<AdminProductPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (isActive !== undefined && isActive !== null) params.set('isActive', String(isActive));
  const response = await requestAdmin(`/admin/products?${params}`, { signal });
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'You do not have permission to view products.'
      : `Could not load products (request failed with status ${response.status}).`;
    throw new ProductsApiError(message, response.status);
  }

  return response.json() as Promise<AdminProductPage>;
}

export async function getAdminCategories(requestAdmin: AdminRequest, signal?: AbortSignal): Promise<AdminCategory[]> {
  const response = await requestAdmin('/admin/categories?page=1&pageSize=100', { signal });
  if (!response.ok) throw new ProductsApiError(`Could not load categories (request failed with status ${response.status}).`, response.status);
  const page = await response.json() as { items: AdminCategory[] };
  return page.items;
}

export async function updateAdminProduct(requestAdmin: AdminRequest, id: number, input: ProductInput): Promise<void> {
  const response = await requestAdmin(`/admin/products/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!response.ok) throw await mutationError(response, 'Could not save product', 'You do not have permission to update products.');
}

export async function createAdminProduct(requestAdmin: AdminRequest, input: ProductInput): Promise<AdminProduct | null> {
  let response: Response;
  try {
    response = await requestAdmin('/admin/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
  } catch {
    throw new ProductsApiError('Could not reach the server to create this product. Check your connection and try again.', 0);
  }
  if (!response.ok) throw await mutationError(response, 'Could not create product', 'You do not have permission to create products.');
  if (response.status === 204) return null;
  try { return await response.json() as AdminProduct; }
  catch { return null; }
}

export async function deleteAdminProduct(requestAdmin: AdminRequest, id: number): Promise<void> {
  const response = await requestAdmin(`/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new ProductsApiError(`Could not delete product (request failed with status ${response.status}).`, response.status);
}

export async function getAdminProductMatchings(requestAdmin: AdminRequest, productId: number, signal?: AbortSignal): Promise<AdminProductMatching[]> {
  const response = await requestAdmin(`/admin/products/${encodeURIComponent(productId)}/matchings`, { signal });
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'You do not have permission to view product matchings.'
      : `Could not load product matchings (request failed with status ${response.status}).`;
    throw new ProductsApiError(message, response.status);
  }
  return response.json() as Promise<AdminProductMatching[]>;
}

export async function unlinkAdminProductMatching(requestAdmin: AdminRequest, matchingId: number): Promise<void> {
  const response = await requestAdmin(`/admin/matching/${encodeURIComponent(matchingId)}`, { method: 'DELETE' });
  if (!response.ok) throw new ProductsApiError(`Could not remove matching (request failed with status ${response.status}).`, response.status);
}
