export type AdminRequest = (path: string, init?: RequestInit) => Promise<Response>;

export interface AdminOffer {
  id: number;
  productId: number;
  partnerShopId: number;
  priceVnd: number;
  url: string | null;
  isActive: boolean;
  isOutlier: boolean;
  updatedAtUtc: string;
}

export class OffersApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'OffersApiError';
  }
}

export async function getAdminOffers(
  requestAdmin: AdminRequest,
  signal?: AbortSignal,
): Promise<AdminOffer[]> {
  const response = await requestAdmin('/admin/offers', { signal });
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'You do not have permission to view offers.'
      : `Could not load offers (request failed with status ${response.status}).`;
    throw new OffersApiError(message, response.status);
  }

  return response.json() as Promise<AdminOffer[]>;
}
