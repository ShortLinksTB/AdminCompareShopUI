import { useEffect, useState } from 'react';
import { getSyncJobs, retrySyncJob, type AdminRequest, type SyncJob } from './sync-jobs-api';
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

function statusStyle(state: SyncJob['state']): string {
  if (state === 'Success') return 'success';
  if (state === 'Failed') return 'failed';
  if (state === 'Running' || state === 'Queued') return 'running';
  return 'partial';
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
    <div className="page-header"><div><span className="eyebrow">System</span><h1>Sync Jobs</h1><p>Theo dõi lịch sử chạy đồng bộ dữ liệu, retry job lỗi.</p></div></div>
    {loadError && <div className="sync-jobs-alert" role="alert">{loadError}<button className="outline-button small" type="button" onClick={() => setReloadKey(value => value + 1)}>Retry</button></div>}
    {retryError && <div className="sync-jobs-alert" role="alert">{retryError}</div>}
    {notice && <div className="sync-jobs-notice" role="status">{notice}</div>}
    <section className="panel sync-jobs-panel" aria-label="Sync Jobs">
      {loading && jobs.length === 0 && !loadError ? <div className="sync-jobs-state" role="status">Loading Sync Jobs…</div>
        : !loading && !loadError && jobs.length === 0 ? <div className="sync-jobs-state" role="status"><strong>No Sync Jobs yet</strong><span>Jobs will appear here when a data source has run.</span></div>
          : jobs.length > 0 && <div className="sync-jobs-table-wrap"><table><thead><tr><th>Job</th><th>Bắt đầu</th><th>Kết thúc</th><th>Trạng thái</th><th aria-label="Actions"></th></tr></thead>
            <tbody>{jobs.map(job => {
              const eligible = job.state === 'Failed' || job.state === 'Partial';
              return <tr key={job.id}>
                <td className="sync-job-name">{job.dataSource}</td><td>{formatUtc(job.startedAtUtc)}</td><td>{formatUtc(job.finishedAtUtc)}</td>
                <td><span className={`sync-job-status sync-job-status-${statusStyle(job.state)}`}>{job.state}</span></td>
                <td className="sync-job-action"><button className="sync-job-button" type="button" disabled={!canExecute || !eligible || retryingId !== null} onClick={() => void retry(job)}>{retryingId === job.id ? 'Retrying…' : 'Retry'}</button></td>
              </tr>;
            })}</tbody></table></div>}
      <div className="sync-jobs-footer"><span>{jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}</span><span>Retry is available for failed or partial jobs.</span></div>
    </section>
  </div>;
}
