import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SyncJobsPage } from './SyncJobsPage';
import type { AdminRequest, SyncJob } from './sync-jobs-api';

const jobs: SyncJob[] = [
  { id: 'success', dataSource: 'Catalog API', startedAtUtc: '2026-11-03T10:00:00Z', finishedAtUtc: '2026-11-03T10:04:00Z', state: 'Success' },
  { id: 'failed', dataSource: 'Phones feed', startedAtUtc: null, finishedAtUtc: null, state: 'Failed' },
  { id: 'partial', dataSource: 'Computers feed', startedAtUtc: 'invalid date', finishedAtUtc: null, state: 'Partial' },
  { id: 'running', dataSource: 'Audio feed', startedAtUtc: '2026-11-03T09:00:00Z', finishedAtUtc: null, state: 'Running' },
  { id: 'queued', dataSource: 'Queued feed', startedAtUtc: null, finishedAtUtc: null, state: 'Queued' },
];

afterEach(cleanup);

describe('SyncJobsPage', () => {
  it('shows loading then an empty state for an empty result', async () => {
    let resolve!: (response: Response) => void;
    const requestAdmin = vi.fn<AdminRequest>().mockReturnValue(new Promise(done => { resolve = done; }));
    render(<SyncJobsPage requestAdmin={requestAdmin} permissions={['sync_jobs.read']} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading Sync Jobs');
    resolve(Response.json([]));
    expect(await screen.findByText('No Sync Jobs yet')).toBeInTheDocument();
  });

  it('shows retryable request failures and does not fall back to mock rows', async () => {
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json([jobs[0]]));
    render(<SyncJobsPage requestAdmin={requestAdmin} permissions={['sync_jobs.read']} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('status 503');
    expect(screen.queryByText('Phones feed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Catalog API')).toBeInTheDocument();
  });

  it('renders contract fields, null timestamps, UTC times, all statuses and permission/eligibility gating', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(Response.json(jobs));
    const { rerender } = render(<SyncJobsPage requestAdmin={requestAdmin} permissions={['sync_jobs.read']} />);

    const failedRow = (await screen.findByText('Phones feed')).closest('tr')!;
    expect(failedRow).toHaveTextContent('—');
    expect(screen.getByText('03/11 10:00')).toBeInTheDocument();
    expect(screen.getByText('invalid date')).toBeInTheDocument();
    for (const state of ['Success', 'Failed', 'Partial', 'Running', 'Queued']) expect(screen.getByText(state)).toBeInTheDocument();
    expect(withinRowButton(failedRow)).toBeDisabled();

    rerender(<SyncJobsPage requestAdmin={requestAdmin} permissions={['sync_jobs.read', 'sync_jobs.execute']} />);
    expect(withinRowButton(failedRow)).toBeEnabled();
    expect(withinRowButton(screen.getByText('Success').closest('tr')!)).toBeDisabled();
    expect(withinRowButton(screen.getByText('Partial').closest('tr')!)).toBeEnabled();
    expect(requestAdmin).toHaveBeenCalledTimes(1);
  });

  it('renders actual numeric API IDs and enum states with Retry gated to Failed and Partial', async () => {
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(Response.json([
        { id: 410, dataSource: 'Failed numeric job', startedAtUtc: null, finishedAtUtc: null, state: 4 },
        { id: 411, dataSource: 'Partial numeric job', startedAtUtc: null, finishedAtUtc: null, state: 3 },
        { id: 412, dataSource: 'Success numeric job', startedAtUtc: null, finishedAtUtc: null, state: 2 },
      ]))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    render(<SyncJobsPage requestAdmin={requestAdmin} permissions={['sync_jobs.read', 'sync_jobs.execute']} />);

    const failedRow = (await screen.findByText('Failed numeric job')).closest('tr')!;
    const partialRow = screen.getByText('Partial numeric job').closest('tr')!;
    const successRow = screen.getByText('Success numeric job').closest('tr')!;
    expect(failedRow).toHaveTextContent('Failed');
    expect(partialRow).toHaveTextContent('Partial');
    expect(successRow).toHaveTextContent('Success');
    expect(withinRowButton(failedRow)).toBeEnabled();
    expect(withinRowButton(partialRow)).toBeEnabled();
    expect(withinRowButton(successRow)).toBeDisabled();

    fireEvent.click(withinRowButton(failedRow));
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledWith('/admin/sync-jobs/410/retry', { method: 'POST' }));
  });

  it('posts retry once while pending, then refetches after 202 without optimistic row changes', async () => {
    let finishRetry!: (response: Response) => void;
    const queuedJob = { ...jobs[1], state: 'Queued' as const };
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(Response.json([jobs[1]]))
      .mockReturnValueOnce(new Promise(done => { finishRetry = done; }))
      .mockResolvedValueOnce(Response.json([queuedJob]));
    render(<SyncJobsPage requestAdmin={requestAdmin} permissions={['sync_jobs.read', 'sync_jobs.execute']} />);

    const retry = await screen.findByRole('button', { name: 'Retry' });
    fireEvent.click(retry);
    expect(await screen.findByRole('button', { name: 'Retrying…' })).toBeDisabled();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(requestAdmin).toHaveBeenCalledTimes(2);
    finishRetry(new Response(null, { status: 202 }));

    expect(await screen.findByRole('status')).toHaveTextContent('Retry queued');
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('Queued')).toBeInTheDocument();
    expect(requestAdmin.mock.calls[1]).toEqual(['/admin/sync-jobs/failed/retry', { method: 'POST' }]);
  });

  it.each([403, 404])('preserves displayed jobs and explains a retry %i response', async status => {
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(Response.json([jobs[1]]))
      .mockResolvedValueOnce(new Response('', { status }));
    render(<SyncJobsPage requestAdmin={requestAdmin} permissions={['sync_jobs.read', 'sync_jobs.execute']} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(status === 403 ? 'do not have permission' : 'can no longer be retried');
    expect(screen.getByText('Phones feed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(requestAdmin).toHaveBeenCalledTimes(2);
  });
});

function withinRowButton(row: HTMLElement) {
  return row.querySelector('button')!;
}
