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

function isSyncJob(value: unknown): value is SyncJob {
  if (!value || typeof value !== 'object') return false;
  const job = value as Record<string, unknown>;
  return typeof job.id === 'string'
    && typeof job.dataSource === 'string'
    && (job.startedAtUtc === null || typeof job.startedAtUtc === 'string')
    && (job.finishedAtUtc === null || typeof job.finishedAtUtc === 'string')
    && ['Queued', 'Running', 'Success', 'Partial', 'Failed'].includes(String(job.state));
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
  if (!Array.isArray(body) || !body.every(isSyncJob)) {
    throw new SyncJobsApiError('The Sync Jobs response was invalid. Please try again.', response.status);
  }
  return body;
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
