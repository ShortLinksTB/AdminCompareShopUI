import type { AdminRequest } from '../bannedItemsApi';

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAtUtc: string;
  before: unknown | null;
  after: unknown | null;
}

export interface AuditLogsPageResult {
  items: AuditLogEntry[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
}

export class AuditLogsApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AuditLogsApiError';
  }
}

export async function getAuditLogs(
  requestAdmin: AdminRequest,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<AuditLogsPageResult> {
  const response = await requestAdmin(`/admin/audit-logs?page=${page}&pageSize=${pageSize}`, { signal });
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'You do not have permission to view audit logs.'
      : `Could not load audit logs (request failed with status ${response.status}).`;
    throw new AuditLogsApiError(message, response.status);
  }
  return response.json() as Promise<AuditLogsPageResult>;
}
