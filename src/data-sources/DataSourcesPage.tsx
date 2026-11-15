import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPartnerShops, type PartnerShop } from '../shopsApi';
import { getSyncJobs, type SyncJob } from '../sync-jobs/sync-jobs-api';
import { Button, Card, EmptyState, ErrorState, Loading, Modal, PageHeader, Pill, Select } from '../ui';
import type { AdminRequest } from '../bannedItemsApi';
import { getDataSources, runDataSourceSync, updateDataSource, type DataSource, type DataSourceState } from './data-sources-api';
import './data-sources.css';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function sourceTone(state: DataSourceState): 'ok' | 'warn' | 'bad' {
  return state === 'Active' ? 'ok' : state === 'Paused' ? 'warn' : 'bad';
}

function jobTone(state: SyncJob['state']): 'ok' | 'warn' | 'bad' | 'info' {
  if (state === 'Success') return 'ok';
  if (state === 'Failed') return 'bad';
  if (state === 'Partial') return 'warn';
  return 'info';
}

function latestJobsBySource(jobs: SyncJob[]): Map<number, SyncJob> {
  const latest = new Map<number, SyncJob>();
  for (const job of jobs) {
    if (job.dataSourceId === undefined) continue;
    const previous = latest.get(job.dataSourceId);
    const time = job.queuedAtUtc ?? job.startedAtUtc ?? '';
    const previousTime = previous?.queuedAtUtc ?? previous?.startedAtUtc ?? '';
    if (!previous || time > previousTime) latest.set(job.dataSourceId, job);
  }
  return latest;
}

export function DataSourcesPage({ requestAdmin, permissions = [] }: { requestAdmin: AdminRequest; permissions?: string[] }) {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [jobsError, setJobsError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<DataSource | null>(null);
  const [draftState, setDraftState] = useState<'Active' | 'Paused'>('Active');
  const [draftInterval, setDraftInterval] = useState('72');
  const [draftShopId, setDraftShopId] = useState('');
  const [shops, setShops] = useState<PartnerShop[]>([]);
  const [shopsLoading, setShopsLoading] = useState(false);
  const [shopsError, setShopsError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState('');
  const intervalRef = useRef<HTMLInputElement>(null);
  const canExecute = permissions.includes('sync_jobs.execute');
  const canReadShops = permissions.includes('shops.read');
  const latestJobs = useMemo(() => latestJobsBySource(jobs), [jobs]);
  const busySourceIds = useMemo(() => new Set(jobs.filter(job => job.state === 'Queued' || job.state === 'Running').map(job => job.dataSourceId).filter((id): id is number => id !== undefined)), [jobs]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    setJobsError('');
    Promise.allSettled([getDataSources(requestAdmin, controller.signal), getSyncJobs(requestAdmin, controller.signal)])
      .then(([sourceResult, jobResult]) => {
        if (sourceResult.status === 'fulfilled') setSources(sourceResult.value);
        else if (!(sourceResult.reason instanceof DOMException && sourceResult.reason.name === 'AbortError')) {
          setLoadError(sourceResult.reason instanceof Error ? sourceResult.reason.message : 'Could not load data sources. Please try again.');
        }
        if (jobResult.status === 'fulfilled') setJobs(jobResult.value);
        else if (!(jobResult.reason instanceof DOMException && jobResult.reason.name === 'AbortError')) {
          setJobsError(jobResult.reason instanceof Error ? jobResult.reason.message : 'Could not load latest sync jobs.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, reloadKey]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    intervalRef.current?.focus();
    if (!canReadShops) {
      setShopsError('You do not have permission to view Partner Shops. Your current assignment is shown below.');
      return () => controller.abort();
    }
    setShopsLoading(true);
    setShopsError('');
    const loadShops = async () => {
      const first = await getPartnerShops(requestAdmin, 1, 100, controller.signal);
      const pages = Math.ceil(first.totalItems / first.pageSize);
      const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, index) => getPartnerShops(requestAdmin, index + 2, 100, controller.signal)));
      setShops([...first.items, ...rest.flatMap(page => page.items)].filter(shop => shop.isActive));
    };
    loadShops().catch(reason => {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) setShopsError(reason instanceof Error ? reason.message : 'Could not load Partner Shops.');
    }).finally(() => { if (!controller.signal.aborted) setShopsLoading(false); });
    return () => controller.abort();
  }, [selected, requestAdmin, canReadShops]);

  function configure(source: DataSource) {
    setSelected(source);
    setDraftState(source.state === 'Active' ? 'Active' : 'Paused');
    setDraftInterval(String(source.intervalHours));
    setDraftShopId(source.partnerShopId === null ? '' : String(source.partnerShopId));
    setFormError('');
    setShops([]);
    setShopsError('');
    setShopsLoading(false);
  }

  async function saveConfiguration() {
    if (!selected || saving) return;
    const intervalHours = Number(draftInterval);
    if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 720) {
      setFormError('Enter a whole number from 1 to 720 hours.');
      return;
    }
    const currentShopId = selected.partnerShopId === null ? '' : String(selected.partnerShopId);
    if (draftShopId && draftShopId !== currentShopId && !shops.some(shop => String(shop.id) === draftShopId)) {
      setFormError('Select an active Partner Shop from the list.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const updated = await updateDataSource(requestAdmin, selected, {
        state: draftState, intervalHours, partnerShopId: draftShopId ? Number(draftShopId) : null,
      });
      setSources(current => current.map(source => source.id === updated.id ? updated : source));
      setSelected(null);
      setNotice('Data source configuration saved.');
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Could not save this configuration. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function runSync(source: DataSource) {
    if (!canExecute || source.state !== 'Active' || runningIds.has(source.id) || busySourceIds.has(Number(source.id))) return;
    setRunningIds(current => new Set(current).add(source.id));
    setNotice('');
    try {
      await runDataSourceSync(requestAdmin, source.id);
      setNotice(`Sync queued for ${source.displayName}.`);
      setReloadKey(value => value + 1);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Could not queue a sync. Please try again.');
    } finally {
      setRunningIds(current => { const next = new Set(current); next.delete(source.id); return next; });
    }
  }

  return <div className="data-sources-page">
    <PageHeader eyebrow="AFFILIATE & DATA" title="Data Sources" description="Các nguồn website mà worker đồng bộ catalog cho GiaTot: chu kỳ chạy, trạng thái và lần chạy gần nhất."
      actions={<Button type="button" disabled title="Supported sources are fixed by the system; adding a source is not available.">+ Add source</Button>} />
    {notice && <div className="data-source-notice" role="status">{notice}</div>}
    {jobsError && !loadError && <div className="data-source-jobs-error" role="status">Latest job details are unavailable: {jobsError}</div>}
    {loadError ? <div className="data-source-load-error"><ErrorState title={loadError} /><Button size="sm" onClick={() => setReloadKey(value => value + 1)}>Retry</Button></div>
      : loading && sources.length === 0 ? <Card className="data-source-state"><Loading label="Loading data sources…">Loading data sources…</Loading></Card>
        : sources.length === 0 ? <Card className="data-source-state"><EmptyState title="No data sources yet">There are no configured data sources.</EmptyState></Card>
          : <section className="data-source-grid" aria-label="Data Sources">
            {sources.map(source => {
              const job = latestJobs.get(Number(source.id));
              const busy = busySourceIds.has(Number(source.id));
              return <Card className="data-source-card" key={source.id} aria-label={source.displayName}>
                <div className="data-source-card-head"><span className="data-source-type">Website · {source.key}</span><Pill tone={sourceTone(source.state)}>{source.state}</Pill></div>
                <h2>{source.displayName}</h2>
                <p className="data-source-shop">{source.partnerShopDisplayName || 'Not assigned'}</p>
                <dl className="data-source-facts">
                  <div><dt>Interval</dt><dd>Every {source.intervalHours} hours</dd></div>
                  <div><dt>Last successful run</dt><dd>{formatDate(source.lastCompletedAtUtc)}</dd></div>
                  <div><dt>Next attempt</dt><dd>{source.state === 'Paused' ? 'Paused' : formatDate(source.nextAttemptAtUtc)}</dd></div>
                </dl>
                <div className="data-source-last-job" aria-label="Latest job">
                  {job ? <><Pill tone={jobTone(job.state)} size="sm">{job.state}</Pill>
                    <span>{job.importedCount === undefined ? 'Job result' : `Imported ${job.importedCount}`} {job.pendingCount === undefined ? '' : `· Pending ${job.pendingCount}`}</span>
                    <Link to="/sync-jobs">View in Sync Jobs →</Link></>
                    : <><span>No sync job recorded.</span><Link to="/sync-jobs">View Sync Jobs →</Link></>}
                </div>
                <div className="data-source-actions">
                  <Button size="sm" type="button" onClick={() => configure(source)}>Configure</Button>
                  <Button size="sm" type="button" tone="primary" disabled={!canExecute || source.state !== 'Active' || busy || runningIds.has(source.id)} title={!canExecute ? 'Requires sync_jobs.execute permission' : source.state === 'Paused' ? 'This source is paused' : source.state === 'Error' ? 'Error sources cannot be run' : busy ? 'A sync job is already queued or running' : undefined} onClick={() => void runSync(source)}>{runningIds.has(source.id) ? 'Queueing…' : 'Run sync'}</Button>
                </div>
              </Card>;
            })}
          </section>}

    <Modal open={selected !== null} title={selected ? `Configure ${selected.displayName}` : 'Configure data source'} onClose={() => { if (!saving) setSelected(null); }} className="data-source-modal"
      actions={<><Button type="button" disabled={saving} onClick={() => setSelected(null)}>Cancel</Button><Button type="button" tone="primary" disabled={saving || !canExecute} onClick={() => void saveConfiguration()}>{saving ? 'Saving…' : 'Save changes'}</Button></>}>
      {selected && <div className="data-source-form">
        {formError && <ErrorState title={formError} />}
        {!canExecute && <p className="data-source-field-help" role="status">You need sync_jobs.execute permission to save configuration.</p>}
        <div className="data-source-form-state"><span><b>Automatic sync</b><small>{draftState === 'Active' ? 'The worker runs this source on its schedule.' : 'Paused sources are skipped by the worker.'}</small></span>
          <button type="button" className="data-source-switch" role="switch" aria-label="Automatic sync state" aria-checked={draftState === 'Active'} disabled={selected.state === 'Error'} onClick={() => setDraftState(current => current === 'Active' ? 'Paused' : 'Active')} />
        </div>
        {selected.state === 'Error' && <p className="data-source-field-help">This source is in Error. It cannot be reactivated from this screen.</p>}
        <label className="data-source-form-field" htmlFor="data-source-interval">Run interval
          <span className="data-source-inline"><input ref={intervalRef} id="data-source-interval" aria-label="Run interval hours" type="number" min="1" max="720" step="1" value={draftInterval} aria-invalid={Boolean(formError && (!Number.isInteger(Number(draftInterval)) || Number(draftInterval) < 1 || Number(draftInterval) > 720))} onChange={event => setDraftInterval(event.target.value)} /><span>hours</span></span>
          <small>Enter a whole number from 1 to 720 hours.</small>
        </label>
        <label className="data-source-form-field" htmlFor="data-source-shop">Partner Shop
          <Select id="data-source-shop" value={draftShopId} disabled={!canReadShops || shopsLoading || Boolean(shopsError)} onChange={event => setDraftShopId(event.target.value)}>
            <option value="">Not assigned</option>{shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
          </Select>
          {selected.partnerShopDisplayName && <small>Current assignment: {selected.partnerShopDisplayName}</small>}
          {shopsLoading && <small>Loading active Partner Shops…</small>}
          {shopsError && <small className="data-source-form-error" role="alert">{shopsError}</small>}
        </label>
        <div className="data-source-readonly"><div><span>Source key</span><code>{selected.key}</code></div><div><span>Category</span><code>{selected.categoryPath}</code></div></div>
        <p className="data-source-audit-note">Configuration changes are recorded in Audit Logs.</p>
      </div>}
    </Modal>
  </div>;
}
