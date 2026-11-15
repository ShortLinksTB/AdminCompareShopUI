import { describe, expect, it, vi } from 'vitest';
import { getSyncJobs, getSyncJobLogs, retrySyncJob, SyncJobsApiError, type SyncJob } from './sync-jobs-api';

const job: SyncJob = { id: 'job/42', dataSource: 'Phones feed', startedAtUtc: null, finishedAtUtc: null, state: 'Failed' };
const page = (items: unknown[], totalItems = items.length) => ({ items, page: 1, pageSize: 25, totalItems });

describe('Sync Jobs API adapter', () => {
  it('sends combined filters and forwards abort signal', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(Response.json(page([job])));
    const signal = new AbortController().signal;
    await expect(getSyncJobs(requestAdmin, { page: 2, pageSize: 50, q: 'Phones', status: 'Failed', startedFrom: '2026-11-01T00:00:00.000Z' }, signal)).resolves.toMatchObject({ items: [job], totalItems: 1 });
    expect(requestAdmin).toHaveBeenCalledWith('/admin/sync-jobs?page=2&pageSize=50&q=Phones&status=Failed&startedFrom=2026-11-01T00%3A00%3A00.000Z', { signal });
  });
  it('normalizes numeric IDs and enum states', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(Response.json(page([{ id: 310, dataSource: 'Phones', startedAtUtc: null, finishedAtUtc: null, state: 4 }])));
    await expect(getSyncJobs(requestAdmin, { page: 1, pageSize: 25 })).resolves.toMatchObject({ items: [{ id: '310', state: 'Failed' }] });
  });
  it('keeps the legacy array request for Data Sources callers', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(Response.json([
      { id: 91, dataSourceId: 1006, dataSource: 'Phones', queuedAtUtc: '2026-11-14T12:00:00Z', startedAtUtc: null, finishedAtUtc: null, state: 0 },
    ]));
    const signal = new AbortController().signal;

    await expect(getSyncJobs(requestAdmin, signal)).resolves.toMatchObject([
      { id: '91', dataSourceId: 1006, dataSource: 'Phones', state: 'Queued' },
    ]);
    expect(requestAdmin).toHaveBeenCalledWith('/admin/sync-jobs', { signal });
  });
  it.each([401, 403, 500])('surfaces GET status %i', async status => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response('', { status }));
    await expect(getSyncJobs(requestAdmin, { page: 1, pageSize: 25 })).rejects.toMatchObject({ name: 'SyncJobsApiError', status });
  });
  it.each([null, {}, { items: [{ ...job, state: 'Unknown' }] }, { items: [{ ...job, startedAtUtc: 42 }] }])('rejects malformed page data %#', async body => {
    const requestAdmin = vi.fn().mockResolvedValue(Response.json(body));
    await expect(getSyncJobs(requestAdmin, { page: 1, pageSize: 25 })).rejects.toMatchObject({ name: 'SyncJobsApiError', status: 200 });
  });
  it('loads chronological log page using encoded ID', async () => {
    const logs = [{ id: 1, occurredAtUtc: '2026-11-01T00:00:00Z', level: 'Error', step: 'shop_check', message: 'Shop unavailable', exceptionType: 'TimeoutException' }];
    const requestAdmin = vi.fn().mockResolvedValue(Response.json(page(logs)));
    await expect(getSyncJobLogs(requestAdmin, job.id)).resolves.toMatchObject({ items: [{ id: '1', step: 'shop_check' }] });
    expect(requestAdmin).toHaveBeenCalledWith('/admin/sync-jobs/job%2F42/logs?page=1&pageSize=500', { signal: undefined });
  });
  it('fetches and combines every log page so entries beyond 500 are retained', async () => {
    const makeLogs = (start: number, count: number) => Array.from({ length: count }, (_, index) => ({
      id: start + index + 1, occurredAtUtc: `2026-11-01T00:${String((start + index) % 60).padStart(2, '0')}:00Z`,
      level: 'Info', step: 'page_read', message: `entry-${start + index + 1}`,
    }));
    const requestAdmin = vi.fn()
      .mockResolvedValueOnce(Response.json({ items: makeLogs(0, 500), page: 1, pageSize: 500, totalItems: 1001 }))
      .mockResolvedValueOnce(Response.json({ items: makeLogs(500, 500), page: 2, pageSize: 500, totalItems: 1001 }))
      .mockResolvedValueOnce(Response.json({ items: makeLogs(1000, 1), page: 3, pageSize: 500, totalItems: 1001 }));

    const result = await getSyncJobLogs(requestAdmin, job.id);
    expect(result.items).toHaveLength(1001);
    expect(result.items[0].message).toBe('entry-1');
    expect(result.items.at(-1)?.message).toBe('entry-1001');
    expect(requestAdmin.mock.calls.map(([path]) => path)).toEqual([
      '/admin/sync-jobs/job%2F42/logs?page=1&pageSize=500',
      '/admin/sync-jobs/job%2F42/logs?page=2&pageSize=500',
      '/admin/sync-jobs/job%2F42/logs?page=3&pageSize=500',
    ]);
  });
  it('accepts 202 retry and encodes the ID', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    await expect(retrySyncJob(requestAdmin, job.id)).resolves.toBeUndefined();
    expect(requestAdmin).toHaveBeenCalledWith('/admin/sync-jobs/job%2F42/retry', { method: 'POST' });
  });
  it.each([403, 404, 500])('surfaces retry status %i', async status => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response('', { status }));
    await expect(retrySyncJob(requestAdmin, job.id)).rejects.toBeInstanceOf(SyncJobsApiError);
  });
});
