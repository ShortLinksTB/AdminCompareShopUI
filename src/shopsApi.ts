import type { AdminRequest, Page } from './bannedItemsApi';

export interface PartnerShop {
  id: number;
  slug: string;
  name: string;
  websiteUrl?: string | null;
  isActive: boolean;
}

export interface ShopInput {
  slug: string;
  name: string;
  websiteUrl?: string;
  isActive: boolean;
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
    const body = await response.json() as { message?: string; title?: string; detail?: string };
    detail = body.message ?? body.detail ?? body.title ?? '';
  } catch {
    // The API may return an empty body, including for permission and server failures.
  }
  const fallback = response.status === 400
    ? 'Shop details are invalid. Check the slug, name, and website URL.'
    : response.status === 404
      ? 'This shop could not be found. Refresh the list and try again.'
      : response.status === 401 || response.status === 403
        ? 'You do not have permission to manage partner shops.'
        : `Request failed (${response.status}). Please try again.`;
  throw new ShopApiError(detail || fallback, response.status);
}

export async function getPartnerShops(requestAdmin: AdminRequest, page: number, pageSize: number, signal?: AbortSignal): Promise<Page<PartnerShop>> {
  const response = await requestAdmin(`${shopsPath}?page=${page}&pageSize=${pageSize}`, { signal });
  await assertResponse(response);
  return response.json() as Promise<Page<PartnerShop>>;
}

export async function createPartnerShop(requestAdmin: AdminRequest, input: ShopInput): Promise<PartnerShop> {
  const response = await requestAdmin(shopsPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }, { redirectOnForbidden: false });
  await assertResponse(response);
  return response.json() as Promise<PartnerShop>;
}

export async function updatePartnerShop(requestAdmin: AdminRequest, id: number, input: ShopInput): Promise<PartnerShop> {
  const response = await requestAdmin(`${shopsPath}/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }, { redirectOnForbidden: false });
  await assertResponse(response);
  return response.json() as Promise<PartnerShop>;
}

export async function deletePartnerShop(requestAdmin: AdminRequest, id: number): Promise<void> {
  const response = await requestAdmin(`${shopsPath}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await assertResponse(response);
}
