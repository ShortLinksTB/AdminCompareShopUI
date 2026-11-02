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
): Promise<AdminProductPage> {
  const response = await requestAdmin(`/admin/products?page=${page}&pageSize=${pageSize}`, { signal });
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'You do not have permission to view products.'
      : `Could not load products (request failed with status ${response.status}).`;
    throw new ProductsApiError(message, response.status);
  }

  return response.json() as Promise<AdminProductPage>;
}
