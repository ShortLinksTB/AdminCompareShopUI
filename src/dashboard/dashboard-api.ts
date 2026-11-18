import { getPartnerShops } from '../shopsApi';
import type { AdminRequest } from '../bannedItemsApi';

interface TotalItemsResponse {
  totalItems: number;
}

function readTotalItems(value: unknown): number {
  if (!value || typeof value !== 'object') throw new Error('The Sync Jobs response was invalid. Please try again.');
  const totalItems = (value as Partial<TotalItemsResponse>).totalItems;
  if (typeof totalItems !== 'number' || !Number.isSafeInteger(totalItems) || totalItems < 0) {
    throw new Error('The Sync Jobs response was invalid. Please try again.');
  }
  return totalItems;
}

async function getSyncJobTotal(requestAdmin: AdminRequest, status: string, signal: AbortSignal): Promise<number> {
  const params = new URLSearchParams({ page: '1', pageSize: '1', status });
  const response = await requestAdmin(`/admin/sync-jobs?${params}`, { signal });
  if (!response.ok) {
    const reason = response.status === 401 || response.status === 403
      ? 'You do not have permission to view Sync Jobs.'
      : `Could not load Sync Jobs (request failed with status ${response.status}).`;
    throw new Error(reason);
  }
  return readTotalItems(await response.json());
}

export async function getDashboardPartnerShopTotal(requestAdmin: AdminRequest, signal: AbortSignal): Promise<number> {
  const result = await getPartnerShops(requestAdmin, 1, 1, signal);
  if (!Number.isSafeInteger(result.totalItems) || result.totalItems < 0) {
    throw new Error('The Partner Shops response was invalid. Please try again.');
  }
  return result.totalItems;
}

export async function getDashboardSyncSuccessRate(requestAdmin: AdminRequest, signal: AbortSignal): Promise<number | null> {
  const [successCount, terminalCount] = await Promise.all([
    getSyncJobTotal(requestAdmin, 'Success', signal),
    getSyncJobTotal(requestAdmin, 'Success,Partial,Failed', signal),
  ]);
  return terminalCount === 0 ? null : successCount / terminalCount;
}
