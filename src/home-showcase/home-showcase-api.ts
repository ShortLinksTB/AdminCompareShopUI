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
export type PublicHomeShowcaseResponse = {
  featured: ShowcaseProduct[];
  interestedComputers: ShowcaseProduct[];
};
export type ShowcaseSelection = Record<ShowcaseSection, Array<number | null>>;

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

export async function getPublicHomeShowcase(signal?: AbortSignal): Promise<PublicHomeShowcaseResponse> {
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'https://api-compareshop-dev.giamha.online').replace(/\/$/, '');
  const response = await fetch(`${apiBaseUrl}/api/v1/home/showcase`, { signal, cache: 'no-store' });
  if (!response.ok) throw new HomeShowcaseApiError(`Yêu cầu thất bại (mã ${response.status}).`, response.status);
  return response.json() as Promise<PublicHomeShowcaseResponse>;
}

export function saveHomeShowcaseDraft(requestAdmin: AdminRequest, selection: ShowcaseSelection) {
  const slots = (section: ShowcaseSection) => selection[section].map((productId, index) => ({ slotIndex: index + 1, productId }));
  return mutate(requestAdmin, '/admin/home-showcase/draft', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ featured: slots('featured'), interestedComputers: slots('interestedComputers') }),
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
