import { getPartnerShops } from '../shopsApi';
import type { AdminRequest } from '../bannedItemsApi';

export async function getDashboardPartnerShopTotal(requestAdmin: AdminRequest, signal: AbortSignal): Promise<number> {
  const result = await getPartnerShops(requestAdmin, 1, 1, signal);
  if (!Number.isSafeInteger(result.totalItems) || result.totalItems < 0) {
    throw new Error('The Partner Shops response was invalid. Please try again.');
  }
  return result.totalItems;
}
