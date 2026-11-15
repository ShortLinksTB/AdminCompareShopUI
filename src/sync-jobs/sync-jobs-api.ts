export type AdminRequest = (path: string, init?: RequestInit) => Promise<Response>;
export type SyncJobState = 'Queued' | 'Running' | 'Success' | 'Partial' | 'Failed';
export type SyncJobLevel = 'Info' | 'Warning' | 'Error';

export interface SyncJob {
  id: string; dataSource: string; dataSourceId?: string | null; startedAtUtc: string | null; queuedAtUtc?: string | null;
  finishedAtUtc: string | null; state: SyncJobState; seenCount?: number; importedCount?: number; pendingCount?: number;
  retryOfJobId?: string | null; errorCode?: string | null; errorSummary?: string | null;
}
export interface SyncJobPage { items: SyncJob[]; page: number; pageSize: number; totalItems: number }
export interface SyncJobLog {
  id: string; occurredAtUtc: string; level: SyncJobLevel; step: string; message: string;
  exceptionType?: string | null; httpStatusCode?: number | null; durationMs?: number | null;
}
export interface SyncJobLogPage { items: SyncJobLog[]; page: number; pageSize: number; totalItems: number }
export interface SyncJobFilters { page: number; pageSize: number; q?: string; status?: SyncJobState; startedFrom?: string; startedTo?: string }

export class SyncJobsApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'SyncJobsApiError'; }
}
const states: SyncJobState[] = ['Queued', 'Running', 'Success', 'Partial', 'Failed'];
const levels: SyncJobLevel[] = ['Info', 'Warning', 'Error'];
function normalizeJob(value: unknown): SyncJob | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const id = typeof item.id === 'number' && Number.isInteger(item.id) ? String(item.id) : item.id;
  const state = typeof item.state === 'number' ? states[item.state] : item.state;
  if (typeof id !== 'string' || typeof item.dataSource !== 'string' || !states.includes(state as SyncJobState)
    || (item.startedAtUtc != null && typeof item.startedAtUtc !== 'string')
    || (item.finishedAtUtc != null && typeof item.finishedAtUtc !== 'string')) return null;
  return { ...item, id, state: state as SyncJobState, dataSource: item.dataSource,
    startedAtUtc: item.startedAtUtc as string | null, finishedAtUtc: item.finishedAtUtc as string | null } as SyncJob;
}
function normalizePage<T>(body: unknown, normalize: (value: unknown) => T | null): { items: T[]; page: number; pageSize: number; totalItems: number } {
  if (!body || typeof body !== 'object') throw new SyncJobsApiError('The Sync Jobs response was invalid. Please try again.', 200);
  const value = body as Record<string, unknown>;
  if (!Array.isArray(value.items)) throw new SyncJobsApiError('The Sync Jobs response was invalid. Please try again.', 200);
  const items = value.items.map(normalize);
  if (items.some(item => item === null)) throw new SyncJobsApiError('The Sync Jobs response was invalid. Please try again.', 200);
  return { items: items as T[], page: Number(value.page) || 1, pageSize: Number(value.pageSize) || 25, totalItems: Number(value.totalItems) || 0 };
}
function apiError(response: Response, action: string): SyncJobsApiError {
  const message = response.status === 401 || response.status === 403 ? `You do not have permission to ${action} Sync Jobs.` : `Could not ${action} Sync Jobs (request failed with status ${response.status}).`;
  return new SyncJobsApiError(message, response.status);
}
export async function getSyncJobs(request: AdminRequest, filters: SyncJobFilters, signal?: AbortSignal): Promise<SyncJobPage> {
  const params = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize) });
  if (filters.q) params.set('q', filters.q);
  if (filters.status) params.set('status', filters.status);
  if (filters.startedFrom) params.set('startedFrom', filters.startedFrom);
  if (filters.startedTo) params.set('startedTo', filters.startedTo);
  const response = await requestAdminGet(request, `/admin/sync-jobs?${params}`, signal);
  if (!response.ok) throw apiError(response, 'load');
  return normalizePage(await response.json(), normalizeJob);
}
async function requestAdminGet(request: AdminRequest, path: string, signal?: AbortSignal) { return request(path, { signal }); }
export async function getSyncJobLogs(request: AdminRequest, id: string, signal?: AbortSignal): Promise<SyncJobLogPage> {
  const response = await request(`/admin/sync-jobs/${encodeURIComponent(id)}/logs?page=1&pageSize=500`, { signal });
  if (!response.ok) throw apiError(response, 'load logs for');
  return normalizePage(await response.json(), value => {
    if (!value || typeof value !== 'object') return null;
    const item = value as Record<string, unknown>;
    if (typeof item.id !== 'string' && typeof item.id !== 'number') return null;
    if (typeof item.occurredAtUtc !== 'string' || typeof item.step !== 'string' || typeof item.message !== 'string' || !levels.includes(item.level as SyncJobLevel)) return null;
    return { ...item, id: String(item.id) } as SyncJobLog;
  });
}
export async function retrySyncJob(request: AdminRequest, id: string): Promise<void> {
  const response = await request(`/admin/sync-jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' });
  if (response.status === 202) return;
  const message = response.status === 403 ? 'You do not have permission to retry this job.' : response.status === 404 ? 'This job can no longer be retried. The list has been kept unchanged.' : `Could not retry this job (request failed with status ${response.status}).`;
  throw new SyncJobsApiError(message, response.status);
}
