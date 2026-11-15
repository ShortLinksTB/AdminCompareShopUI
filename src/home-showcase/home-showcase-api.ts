import type { AdminRequest } from '../products/products-api';

export type ShowcaseSection = 'featured' | 'interestedComputers';
export type ShowcaseProduct = {
  id: number;
  slug: string;
  name: string;
  imageUrl: string | null;
  brand: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  isVisible: boolean;
  price?: number | null;
};
export type ShowcaseSlot = { slotIndex: number; product: ShowcaseProduct | null };
export type ShowcaseSnapshot = Record<ShowcaseSection, ShowcaseSlot[]>;
export type HomeShowcaseResponse = {
  draft: ShowcaseSnapshot;
  published: ShowcaseSnapshot;
  draftChangedSlotCount?: number;
  changedSlots?: unknown[];
};
export type ShowcaseSelection = Record<ShowcaseSection, Array<number | null>>;
export type ShowcaseFallbacks = Record<ShowcaseSection, ShowcaseProduct[]>;

type PublicHomeProduct = {
  id: number;
  slug: string;
  name: string;
  imageUrl: string | null;
  brand: string | null;
  category: { slug: string; name: string };
};
type PublicHomeShowcase = { featured: PublicHomeProduct[]; interestedComputers: PublicHomeProduct[] };

export class HomeShowcaseApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'HomeShowcaseApiError';
  }
}

async function readJson<T>(requestAdmin: AdminRequest, path: string, init?: RequestInit): Promise<T> {
  const response = await requestAdmin(path, init);
  if (!response.ok) throw new HomeShowcaseApiError(`Yêu cầu thất bại (mã ${response.status}).`, response.status);
  return response.json() as Promise<T>;
}

async function mutate(requestAdmin: AdminRequest, path: string, init: RequestInit): Promise<void> {
  const response = await requestAdmin(path, init);
  if (!response.ok) throw new HomeShowcaseApiError(`Yêu cầu thất bại (mã ${response.status}).`, response.status);
}

export function getHomeShowcase(requestAdmin: AdminRequest, signal?: AbortSignal) {
  return readJson<HomeShowcaseResponse>(requestAdmin, '/admin/home-showcase', { signal });
}

export async function getHomeShowcaseFallbacks(signal?: AbortSignal): Promise<ShowcaseFallbacks> {
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'https://api-compareshop-dev.giamha.online').replace(/\/$/, '');
  const apiRoot = `${apiBaseUrl}/api/v1`;
  const response = await fetch(`${apiRoot}/home/showcase`, { signal });
  if (!response.ok) throw new Error(`Could not load homepage preview fallback (request failed with status ${response.status}).`);
  const showcase = await response.json() as PublicHomeShowcase;
  const mapProduct = (product: PublicHomeProduct): ShowcaseProduct => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    imageUrl: product.imageUrl,
    brand: product.brand,
    categoryName: product.category?.name ?? null,
    categorySlug: product.category?.slug ?? null,
    isVisible: true,
  });
  return {
    featured: showcase.featured.map(mapProduct),
    interestedComputers: showcase.interestedComputers.map(mapProduct),
  };
}

export function saveHomeShowcaseDraft(requestAdmin: AdminRequest, selection: ShowcaseSelection) {
  return mutate(requestAdmin, '/admin/home-showcase/draft', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ featured: selection.featured, interestedComputers: selection.interestedComputers }),
  });
}

export function resetHomeShowcaseDraft(requestAdmin: AdminRequest) {
  return mutate(requestAdmin, '/admin/home-showcase/draft/reset', { method: 'POST' });
}

export function publishHomeShowcase(requestAdmin: AdminRequest) {
  return mutate(requestAdmin, '/admin/home-showcase/publish', { method: 'POST' });
}

export async function issueHomeShowcasePreviewToken(requestAdmin: AdminRequest): Promise<string> {
  const result = await readJson<{ token?: string; previewToken?: string }>(requestAdmin, '/admin/home-showcase/preview-token', { method: 'POST' });
  const token = result.token || result.previewToken;
  if (!token) throw new HomeShowcaseApiError('API không trả về token xem trước.', 0);
  return token;
}
