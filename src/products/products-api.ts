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
  if (!response.ok) throw new ProductsApiError(`Could not save product (request failed with status ${response.status}).`, response.status);
}

export async function deleteAdminProduct(requestAdmin: AdminRequest, id: number): Promise<void> {
  const response = await requestAdmin(`/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new ProductsApiError(`Could not delete product (request failed with status ${response.status}).`, response.status);
}
