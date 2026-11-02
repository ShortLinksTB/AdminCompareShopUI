export type AdminRequest = (path: string, init?: RequestInit) => Promise<Response>;

export interface AdminShop {
  id: number;
  slug: string;
  name: string;
  websiteUrl: string | null;
  isActive: boolean;
}

export interface ShopInput {
  slug: string;
  name: string;
  websiteUrl?: string | null;
  isActive: boolean;
}

export interface ShopPage {
  items: AdminShop[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
}

export class ShopApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ShopApiError';
  }
}

const shopsPath = '/admin/shops';

async function assertResponse(response: Response): Promise<void> {
  if (response.ok) return;

  let detail = '';
  try {
    const body = await response.json() as { message?: string; title?: string; detail?: string; errors?: Record<string, string[]> };
    const validationMessage = body.errors ? Object.values(body.errors).flat().find(Boolean) : undefined;
    detail = body.message ?? body.detail ?? validationMessage ?? body.title ?? '';
  } catch {
    // Some API failures, including the current linked-offer delete case, have no JSON body.
  }
  throw new ShopApiError(detail || `Request failed (${response.status}). Please try again.`, response.status);
}

export async function getShops(requestAdmin: AdminRequest, page: number, pageSize: number, signal?: AbortSignal): Promise<ShopPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const response = await requestAdmin(`${shopsPath}?${params}`, { signal });
  await assertResponse(response);
  return response.json() as Promise<ShopPage>;
}

export async function createShop(requestAdmin: AdminRequest, input: ShopInput): Promise<AdminShop> {
  const response = await requestAdmin(shopsPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await assertResponse(response);
  return response.json() as Promise<AdminShop>;
}

export async function updateShop(requestAdmin: AdminRequest, id: number, input: ShopInput): Promise<AdminShop> {
  const response = await requestAdmin(`${shopsPath}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await assertResponse(response);
  return response.json() as Promise<AdminShop>;
}

export async function deleteShop(requestAdmin: AdminRequest, id: number): Promise<void> {
  const response = await requestAdmin(`${shopsPath}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await assertResponse(response);
}
