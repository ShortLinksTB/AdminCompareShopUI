import { useEffect, useState } from 'react';
import { getSyncJobs, retrySyncJob, type AdminRequest, type SyncJob } from './sync-jobs-api';
import { Button, Card, DataTable, EmptyState, ErrorState, Loading, PageHeader, Pill } from '../ui';
import './sync-jobs.css';

function formatUtc(value: string | null): string {
  if (value === null) return '—';
  const utcValue = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value;
  const date = new Date(utcValue);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${day}/${month} ${hour}:${minute}`;
}

function statusTone(state: SyncJob['state']): 'ok' | 'bad' | 'warn' | 'info' {
  if (state === 'Success') return 'ok';
  if (state === 'Failed') return 'bad';
  if (state === 'Running' || state === 'Queued') return 'info';
  return 'warn';
}

export function SyncJobsPage({ requestAdmin, permissions }: { requestAdmin: AdminRequest; permissions: string[] }) {
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [retryError, setRetryError] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const canExecute = permissions.includes('sync_jobs.execute');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    getSyncJobs(requestAdmin, controller.signal)
      .then(result => setJobs(result))
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setLoadError(reason instanceof Error ? reason.message : 'Could not load Sync Jobs. Please try again.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, reloadKey]);

  async function retry(job: SyncJob) {
    if (!canExecute || !['Failed', 'Partial'].includes(job.state) || retryingId !== null) return;
    setRetryingId(job.id);
    setRetryError('');
    setNotice('');
    try {
      await retrySyncJob(requestAdmin, job.id);
      setNotice('Retry queued. The job list is refreshing.');
      setReloadKey(value => value + 1);
    } catch (reason) {
      setRetryError(reason instanceof Error ? reason.message : 'Could not retry this job. Please try again.');
    } finally {
      setRetryingId(null);
    }
  }

  return <div className="sync-jobs-page">
    <PageHeader eyebrow="SYSTEM" title="Sync Jobs" description="Theo dõi lịch sử chạy đồng bộ dữ liệu, retry job lỗi." />
    {loadError && <div className="sync-jobs-feedback"><ErrorState title={loadError} /><div className="sync-jobs-feedback-action"><Button size="sm" onClick={() => setReloadKey(value => value + 1)}>Retry</Button></div></div>}
    {retryError && <div className="sync-jobs-feedback"><ErrorState title={retryError} /></div>}
    {notice && <div className="sync-jobs-notice" role="status">{notice}</div>}
    <Card className="sync-jobs-panel" aria-label="Sync Jobs">
      {loading && jobs.length === 0 && !loadError ? <Loading label="Loading Sync Jobs…">Loading Sync Jobs…</Loading>
        : !loading && !loadError && jobs.length === 0 ? <EmptyState title="No Sync Jobs yet">Jobs will appear here when a data source has run.</EmptyState>
          : jobs.length > 0 && <DataTable className="sync-jobs-table-wrap"><thead><tr><th>Job</th><th>Bắt đầu</th><th>Kết thúc</th><th>Trạng thái</th><th aria-label="Actions"></th></tr></thead>
            <tbody>{jobs.map(job => {
              const eligible = job.state === 'Failed' || job.state === 'Partial';
              return <tr key={job.id}>
                <td className="sync-job-name">{job.dataSource}</td><td>{formatUtc(job.startedAtUtc)}</td><td>{formatUtc(job.finishedAtUtc)}</td>
                <td><Pill tone={statusTone(job.state)} size="sm">{job.state}</Pill></td>
                <td className="sync-job-action"><Button size="sm" type="button" disabled={!canExecute || !eligible || retryingId !== null} onClick={() => void retry(job)}>{retryingId === job.id ? 'Retrying…' : 'Retry'}</Button></td>
              </tr>;
            })}</tbody></DataTable>}
      <div className="sync-jobs-footer"><span>{jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}</span><span>Retry is available for failed or partial jobs.</span></div>
    </Card>
  </div>;
}
