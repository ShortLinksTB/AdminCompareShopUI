import { describe, expect, it, vi } from 'vitest';
import { getSyncJobs, retrySyncJob, SyncJobsApiError, type SyncJob } from './sync-jobs-api';

const job: SyncJob = {
  id: 'job/42', dataSource: 'Phones feed', startedAtUtc: null, finishedAtUtc: null, state: 'Failed',
};

describe('Sync Jobs API adapter', () => {
  it('reads the API array contract and forwards the abort signal', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(Response.json([job]));
    const signal = new AbortController().signal;

    await expect(getSyncJobs(requestAdmin, signal)).resolves.toEqual([job]);
    expect(requestAdmin).toHaveBeenCalledWith('/admin/sync-jobs', { signal });
  });

  it.each([401, 403, 500])('surfaces GET status %i as an error', async status => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response('', { status }));
    await expect(getSyncJobs(requestAdmin)).rejects.toMatchObject({ name: 'SyncJobsApiError', status });
  });

  it.each([null, {}, [{ ...job, state: 'Unknown' }], [{ ...job, startedAtUtc: 42 }]])('rejects malformed response data %#', async body => {
    const requestAdmin = vi.fn().mockResolvedValue(Response.json(body));
    await expect(getSyncJobs(requestAdmin)).rejects.toMatchObject({ name: 'SyncJobsApiError', status: 200 });
  });

  it('accepts a 202 retry and encodes the job ID in the endpoint', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    await expect(retrySyncJob(requestAdmin, job.id)).resolves.toBeUndefined();
    expect(requestAdmin).toHaveBeenCalledWith('/admin/sync-jobs/job%2F42/retry', { method: 'POST' });
  });

  it.each([403, 404, 500])('surfaces retry status %i with an actionable error', async status => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response('', { status }));
    await expect(retrySyncJob(requestAdmin, job.id)).rejects.toBeInstanceOf(SyncJobsApiError);
  });
});
