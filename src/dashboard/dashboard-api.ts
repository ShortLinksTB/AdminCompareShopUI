import { getPartnerShops } from '../shopsApi';
import type { AdminRequest } from '../products/products-api';
import { getSyncJobs } from '../sync-jobs/sync-jobs-api';

export async function getDashboardPartnerShopTotal(requestAdmin: AdminRequest, signal?: AbortSignal): Promise<number> {
  const page = await getPartnerShops(requestAdmin, 1, 1, signal);
  return page.totalItems;
}

export async function getDashboardSyncJobTotals(requestAdmin: AdminRequest, signal?: AbortSignal): Promise<{ successful: number; terminal: number }> {
  const [successful, terminal] = await Promise.all([
    getSyncJobs(requestAdmin, { page: 1, pageSize: 1, status: 'Success' }, signal),
    getSyncJobs(requestAdmin, { page: 1, pageSize: 1, status: 'Success,Partial,Failed' }, signal),
  ]);
  return { successful: successful.totalItems, terminal: terminal.totalItems };
}
