export type AdminRequest = (path: string, init?: RequestInit) => Promise<Response>;
export type SyncJobState = 'Queued' | 'Running' | 'Success' | 'Partial' | 'Failed';
export type SyncJobLevel = 'Info' | 'Warning' | 'Error';

export interface SyncJob {
  id: string;
  dataSourceId?: number;
  dataSource: string;
  queuedAtUtc?: string;
  startedAtUtc: string | null;
  finishedAtUtc: string | null;
  state: SyncJobState;
  seenCount?: number;
  importedCount?: number;
  pendingCount?: number;
  retryOfJobId?: string | null;
  errorCode?: string | null;
  errorSummary?: string | null;
}

export interface SyncJobPage { items: SyncJob[]; page: number; pageSize: number; totalItems: number }
export interface SyncJobLog {
  id: string;
  occurredAtUtc: string;
  level: SyncJobLevel;
  step: string;
  message: string;
  exceptionType?: string | null;
  httpStatusCode?: number | null;
  durationMs?: number | null;
}
export interface SyncJobLogPage { items: SyncJobLog[]; page: number; pageSize: number; totalItems: number }
export interface SyncJobFilters {
  page: number;
  pageSize: number;
  q?: string;
  status?: SyncJobState | 'Success,Partial,Failed';
  startedFrom?: string;
  startedTo?: string;
}

export class SyncJobsApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'SyncJobsApiError';
  }
}

const states: SyncJobState[] = ['Queued', 'Running', 'Success', 'Partial', 'Failed'];
const levels: SyncJobLevel[] = ['Info', 'Warning', 'Error'];

function normalizeJob(value: unknown): SyncJob | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const id = typeof item.id === 'string'
    ? item.id
    : typeof item.id === 'number' && Number.isSafeInteger(item.id) && item.id >= 0
      ? String(item.id)
      : null;
  const state = typeof item.state === 'number' && Number.isInteger(item.state)
    ? states[item.state] ?? null
    : typeof item.state === 'string' && states.includes(item.state as SyncJobState)
      ? item.state as SyncJobState
      : null;
  if (id === null || typeof item.dataSource !== 'string' || state === null
    || (item.startedAtUtc !== null && typeof item.startedAtUtc !== 'string')
    || (item.finishedAtUtc !== null && typeof item.finishedAtUtc !== 'string')) return null;

  const normalized: SyncJob = {
    id,
    dataSource: item.dataSource,
    startedAtUtc: item.startedAtUtc as string | null,
    finishedAtUtc: item.finishedAtUtc as string | null,
    state,
  };
  if (typeof item.dataSourceId === 'number' && Number.isSafeInteger(item.dataSourceId)) normalized.dataSourceId = item.dataSourceId;
  if (typeof item.queuedAtUtc === 'string') normalized.queuedAtUtc = item.queuedAtUtc;
  if (typeof item.seenCount === 'number' && Number.isFinite(item.seenCount)) normalized.seenCount = item.seenCount;
  if (typeof item.importedCount === 'number' && Number.isFinite(item.importedCount)) normalized.importedCount = item.importedCount;
  if (typeof item.pendingCount === 'number' && Number.isFinite(item.pendingCount)) normalized.pendingCount = item.pendingCount;
  if (typeof item.retryOfJobId === 'string' || item.retryOfJobId === null) normalized.retryOfJobId = item.retryOfJobId;
  else if (typeof item.retryOfJobId === 'number' && Number.isSafeInteger(item.retryOfJobId)) normalized.retryOfJobId = String(item.retryOfJobId);
  if (typeof item.errorCode === 'string' || item.errorCode === null) normalized.errorCode = item.errorCode;
  if (typeof item.errorSummary === 'string' || item.errorSummary === null) normalized.errorSummary = item.errorSummary;
  return normalized;
}

function normalizePage<T>(body: unknown, normalize: (value: unknown) => T | null): { items: T[]; page: number; pageSize: number; totalItems: number } {
  if (!body || typeof body !== 'object') throw new SyncJobsApiError('The Sync Jobs response was invalid. Please try again.', 200);
  const value = body as Record<string, unknown>;
  if (!Array.isArray(value.items)) throw new SyncJobsApiError('The Sync Jobs response was invalid. Please try again.', 200);
  const items = value.items.map(normalize);
  if (items.some(item => item === null)) throw new SyncJobsApiError('The Sync Jobs response was invalid. Please try again.', 200);
  return {
    items: items as T[],
    page: Number(value.page) || 1,
    pageSize: Number(value.pageSize) || 25,
    totalItems: Number(value.totalItems) || 0,
  };
}

function apiError(response: Response, action: string): SyncJobsApiError {
  const message = response.status === 401 || response.status === 403
    ? `You do not have permission to ${action} Sync Jobs.`
    : `Could not ${action} Sync Jobs (request failed with status ${response.status}).`;
  return new SyncJobsApiError(message, response.status);
}

function isFilters(value: SyncJobFilters | AbortSignal | undefined): value is SyncJobFilters {
  return Boolean(value && 'page' in value && 'pageSize' in value);
}

/**
 * Keep the no-filter form on the original array endpoint used by Data Sources.
 * Supplying filters opts into the additive paged contract used by the Sync Jobs page.
 */
export function getSyncJobs(requestAdmin: AdminRequest, signal?: AbortSignal): Promise<SyncJob[]>;
export function getSyncJobs(requestAdmin: AdminRequest, filters: SyncJobFilters, signal?: AbortSignal): Promise<SyncJobPage>;
export async function getSyncJobs(
  requestAdmin: AdminRequest,
  filtersOrSignal?: SyncJobFilters | AbortSignal,
  signal?: AbortSignal,
): Promise<SyncJob[] | SyncJobPage> {
  if (!isFilters(filtersOrSignal)) {
    const legacySignal = filtersOrSignal as AbortSignal | undefined;
    const response = await requestAdmin('/admin/sync-jobs', { signal: legacySignal });
    if (!response.ok) throw apiError(response, 'load');
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new SyncJobsApiError('The Sync Jobs response was invalid. Please try again.', response.status);
    const jobs = body.map(normalizeJob);
    if (jobs.some(job => job === null)) throw new SyncJobsApiError('The Sync Jobs response was invalid. Please try again.', response.status);
    return jobs as SyncJob[];
  }

  const params = new URLSearchParams({ page: String(filtersOrSignal.page), pageSize: String(filtersOrSignal.pageSize) });
  if (filtersOrSignal.q) params.set('q', filtersOrSignal.q);
  if (filtersOrSignal.status) params.set('status', filtersOrSignal.status);
  if (filtersOrSignal.startedFrom) params.set('startedFrom', filtersOrSignal.startedFrom);
  if (filtersOrSignal.startedTo) params.set('startedTo', filtersOrSignal.startedTo);
  const response = await requestAdmin(`/admin/sync-jobs?${params}`, { signal });
  if (!response.ok) throw apiError(response, 'load');
  return normalizePage(await response.json(), normalizeJob);
}

export async function getSyncJobLogs(requestAdmin: AdminRequest, id: string, signal?: AbortSignal): Promise<SyncJobLogPage> {
  const path = `/admin/sync-jobs/${encodeURIComponent(id)}/logs`;
  const parseLogs = (body: unknown) => normalizePage(body, value => {
    if (!value || typeof value !== 'object') return null;
    const item = value as Record<string, unknown>;
    if ((typeof item.id !== 'string' && typeof item.id !== 'number')
      || typeof item.occurredAtUtc !== 'string' || typeof item.step !== 'string'
      || typeof item.message !== 'string' || !levels.includes(item.level as SyncJobLevel)) return null;
    return { ...item, id: String(item.id) } as SyncJobLog;
  });
  const fetchPage = async (page: number) => {
    const response = await requestAdmin(`${path}?page=${page}&pageSize=500`, { signal });
    if (!response.ok) throw apiError(response, 'load logs for');
    return parseLogs(await response.json());
  };
  const first = await fetchPage(1);
  const pageCount = Math.ceil(first.totalItems / first.pageSize);
  const pages: SyncJobLog[][] = [first.items];
  for (let page = 2; page <= pageCount; page += 1) pages.push((await fetchPage(page)).items);
  return { ...first, items: pages.flat() };
}

export async function retrySyncJob(requestAdmin: AdminRequest, id: string): Promise<void> {
  const response = await requestAdmin(`/admin/sync-jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' });
  if (response.status === 202) return;
  const message = response.status === 403
    ? 'You do not have permission to retry this job.'
    : response.status === 404
      ? 'This job can no longer be retried. The list has been kept unchanged.'
      : `Could not retry this job (request failed with status ${response.status}).`;
  throw new SyncJobsApiError(message, response.status);
}
