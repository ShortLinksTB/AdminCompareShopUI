import type { AdminRequest } from '../bannedItemsApi';

export interface PriceAlert {
  id: number | string;
  productSlug?: string | null;
  productName: string;
  targetPrice: number;
  isActive: boolean;
  createdAtUtc: string;
}

export interface PriceAlertPage {
  items: PriceAlert[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
}

export class PriceAlertsApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'PriceAlertsApiError';
  }
}

function normalizeAlert(value: unknown): PriceAlert | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const validId = (typeof item.id === 'number' && Number.isSafeInteger(item.id))
    || (typeof item.id === 'string' && item.id.length > 0);
  if (!validId || typeof item.productName !== 'string' || typeof item.targetPrice !== 'number'
    || !Number.isFinite(item.targetPrice) || typeof item.isActive !== 'boolean'
    || typeof item.createdAtUtc !== 'string') return null;

  return {
    id: item.id as number | string,
    productName: item.productName,
    targetPrice: item.targetPrice,
    isActive: item.isActive,
    createdAtUtc: item.createdAtUtc,
    productSlug: typeof item.productSlug === 'string' ? item.productSlug : null,
  };
}

export async function getPriceAlerts(requestAdmin: AdminRequest, page: number, pageSize: number, signal?: AbortSignal): Promise<PriceAlertPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const response = await requestAdmin(`/admin/price-alerts?${params}`, { signal });
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'You do not have permission to view price alerts.'
      : `Could not load price alerts (request failed with status ${response.status}).`;
    throw new PriceAlertsApiError(message, response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PriceAlertsApiError('The price alerts response was invalid. Please try again.', response.status);
  }
  if (!body || typeof body !== 'object') throw new PriceAlertsApiError('The price alerts response was invalid. Please try again.', response.status);
  const result = body as Record<string, unknown>;
  const items = Array.isArray(result.items) ? result.items.map(normalizeAlert) : null;
  if (!items || items.some(item => item === null)
    || !Number.isSafeInteger(result.pageNumber) || Number(result.pageNumber) < 1
    || !Number.isSafeInteger(result.pageSize) || Number(result.pageSize) < 1
    || !Number.isSafeInteger(result.totalItems) || Number(result.totalItems) < 0) {
    throw new PriceAlertsApiError('The price alerts response was invalid. Please try again.', response.status);
  }
  return { items: items as PriceAlert[], pageNumber: Number(result.pageNumber), pageSize: Number(result.pageSize), totalItems: Number(result.totalItems) };
}
