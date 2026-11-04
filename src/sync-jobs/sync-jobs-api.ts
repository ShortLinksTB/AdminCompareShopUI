export type AdminRequest = (path: string, init?: RequestInit) => Promise<Response>;

export interface SyncJob {
  id: string;
  dataSource: string;
  startedAtUtc: string | null;
  finishedAtUtc: string | null;
  state: 'Queued' | 'Running' | 'Success' | 'Partial' | 'Failed';
}

export class SyncJobsApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'SyncJobsApiError';
  }
}

const syncJobStates = ['Queued', 'Running', 'Success', 'Partial', 'Failed'] as const;

function normalizeSyncJob(value: unknown): SyncJob | null {
  if (!value || typeof value !== 'object') return null;
  const job = value as Record<string, unknown>;
  const id = typeof job.id === 'string'
    ? job.id
    : typeof job.id === 'number' && Number.isInteger(job.id) && job.id >= 0
      ? String(job.id)
      : null;
  const state = typeof job.state === 'number' && Number.isInteger(job.state)
    ? syncJobStates[job.state] ?? null
    : typeof job.state === 'string' && syncJobStates.includes(job.state as typeof syncJobStates[number])
      ? job.state as SyncJob['state']
      : null;

  if (id === null
    || typeof job.dataSource !== 'string'
    || (job.startedAtUtc !== null && typeof job.startedAtUtc !== 'string')
    || (job.finishedAtUtc !== null && typeof job.finishedAtUtc !== 'string')
    || state === null) return null;

  return {
    id,
    dataSource: job.dataSource,
    startedAtUtc: job.startedAtUtc as string | null,
    finishedAtUtc: job.finishedAtUtc as string | null,
    state,
  };
}

export async function getSyncJobs(requestAdmin: AdminRequest, signal?: AbortSignal): Promise<SyncJob[]> {
  const response = await requestAdmin('/admin/sync-jobs', { signal });
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'You do not have permission to view Sync Jobs.'
      : `Could not load Sync Jobs (request failed with status ${response.status}).`;
    throw new SyncJobsApiError(message, response.status);
  }

  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new SyncJobsApiError('The Sync Jobs response was invalid. Please try again.', response.status);
  }
  const jobs = body.map(normalizeSyncJob);
  if (jobs.some(job => job === null)) {
    throw new SyncJobsApiError('The Sync Jobs response was invalid. Please try again.', response.status);
  }
  return jobs as SyncJob[];
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
