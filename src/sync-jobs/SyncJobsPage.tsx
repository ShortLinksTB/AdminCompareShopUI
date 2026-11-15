import { useEffect, useMemo, useState } from 'react';
import { getSyncJobs, getSyncJobLogs, retrySyncJob, type AdminRequest, type SyncJob, type SyncJobFilters, type SyncJobLevel, type SyncJobLogPage, type SyncJobPage, type SyncJobState } from './sync-jobs-api';
import { Button, Card, DataTable, EmptyState, ErrorState, FilterChips, Loading, Modal, PageHeader, Pager, Pill, RowMenu, SearchField, Select, TableFooter, Toast, Toolbar } from '../ui';
import './sync-jobs.css';

const STATES: SyncJobState[] = ['Queued', 'Running', 'Success', 'Partial', 'Failed'];
const PAGE_SIZES = [10, 25, 50, 100];
const ERROR_HINTS: Record<string, string> = {
  source_failure: 'Kiểm tra kết nối Internet của worker và cấu trúc trang nguồn.',
  shop_unavailable: 'Kiểm tra shop còn hoạt động và URL nguồn có thể truy cập.',
  source_blocked: 'Kiểm tra chính sách truy cập của website nguồn và cấu hình worker.',
  execution_timeout: 'Kiểm tra thời gian phản hồi của nguồn và giới hạn thời gian xử lý.',
};
function dateLabel(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
function localDateUtc(value: string, end = false): string | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0);
  return date.toISOString();
}
function elapsed(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds} giây` : seconds < 3600 ? `${Math.floor(seconds / 60)} phút ${seconds % 60} giây` : `${Math.floor(seconds / 3600)} giờ ${Math.floor(seconds % 3600 / 60)} phút`;
}
function elapsedFrom(start: string | null, value: string): string {
  if (!start) return '—';
  const seconds = Math.max(0, Math.floor((new Date(value).getTime() - new Date(start).getTime()) / 1000));
  return Number.isFinite(seconds) ? `+${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : '—';
}
function tone(state: SyncJobState): 'ok' | 'bad' | 'warn' | 'info' { return state === 'Success' ? 'ok' : state === 'Failed' ? 'bad' : state === 'Partial' ? 'warn' : 'info'; }
function levelTone(level: SyncJobLevel): string { return level.toLowerCase(); }
function today(): string { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }

export function SyncJobsPage({ requestAdmin, permissions = [] }: { requestAdmin: AdminRequest; permissions?: string[] }) {
  const canExecute = permissions.includes('sync_jobs.execute');
  const [query, setQuery] = useState(''); const [search, setSearch] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [status, setStatus] = useState<SyncJobState | ''>('');
  const [pageNumber, setPageNumber] = useState(1); const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState<SyncJobPage>({ items: [], page: 1, pageSize: 25, totalItems: 0 });
  const [counts, setCounts] = useState<Record<string, number>>({}); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [reload, setReload] = useState(0); const [activeJob, setActiveJob] = useState<SyncJob | null>(null); const [logs, setLogs] = useState<SyncJobLogPage | null>(null);
  const [logsLoading, setLogsLoading] = useState(false); const [logsError, setLogsError] = useState(''); const [logQuery, setLogQuery] = useState(''); const [logLevel, setLogLevel] = useState<SyncJobLevel | ''>('');
  const [logsReload, setLogsReload] = useState(0);
  const [retryingId, setRetryingId] = useState<string | null>(null); const [retryError, setRetryError] = useState(''); const [toast, setToast] = useState('');

  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query.trim()); setPageNumber(1); }, 250); return () => window.clearTimeout(timer); }, [query]);
  const filters: SyncJobFilters = useMemo(() => ({ page: pageNumber, pageSize, q: search || undefined, status: status || undefined, startedFrom: localDateUtc(from), startedTo: localDateUtc(to, true) }), [pageNumber, pageSize, search, status, from, to]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void getSyncJobs(requestAdmin, filters, controller.signal).then(page => { setResult(page); if (page.page !== pageNumber) setPageNumber(page.page); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Không tải được danh sách Sync Jobs.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, filters, reload]);
  useEffect(() => {
    const controller = new AbortController();
    const common = { page: 1, pageSize: 1, q: search || undefined, startedFrom: localDateUtc(from), startedTo: localDateUtc(to, true) };
    void Promise.all(['', ...STATES].map(value => getSyncJobs(requestAdmin, { ...common, status: value as SyncJobState || undefined }, controller.signal)))
      .then(pages => setCounts(Object.fromEntries(['', ...STATES].map((value, index) => [value, pages[index].totalItems]))))
      .catch(() => { if (!controller.signal.aborted) setCounts({}); });
    return () => controller.abort();
  }, [requestAdmin, search, from, to, reload]);
  useEffect(() => {
    if (!activeJob) return;
    const controller = new AbortController(); setLogs(null); setLogsError(''); setLogsLoading(true); setLogQuery(''); setLogLevel('');
    void getSyncJobLogs(requestAdmin, activeJob.id, controller.signal).then(setLogs)
      .catch(reason => { if (!controller.signal.aborted) setLogsError(reason instanceof Error ? reason.message : 'Không tải được log.'); })
      .finally(() => { if (!controller.signal.aborted) setLogsLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, activeJob?.id, logsReload]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2500); return () => window.clearTimeout(timer); }, [toast]);

  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));
  const start = result.totalItems ? (pageNumber - 1) * pageSize + 1 : 0; const end = Math.min(pageNumber * pageSize, result.totalItems);
  const visibleLogs = (logs?.items ?? []).filter(item => (!logLevel || item.level === logLevel) && `${item.step} ${item.message} ${item.exceptionType ?? ''}`.toLocaleLowerCase().includes(logQuery.toLocaleLowerCase()));
  const activeEligible = activeJob && ['Failed', 'Partial'].includes(activeJob.state);
  function openLogModal(job: SyncJob) { setRetryError(''); setActiveJob(job); }
  function closeLogModal() { setRetryError(''); setActiveJob(null); }
  async function retry(job: SyncJob) {
    if (!canExecute || !['Failed', 'Partial'].includes(job.state) || retryingId) return;
    setRetryingId(job.id); setRetryError('');
    try { await retrySyncJob(requestAdmin, job.id); setToast('Đã xếp lịch retry. Danh sách đang được cập nhật.'); setReload(value => value + 1); }
    catch (reason) { setRetryError(reason instanceof Error ? reason.message : 'Không thể retry job này.'); }
    finally { setRetryingId(null); }
  }
  function clearFilters() { setQuery(''); setSearch(''); setFrom(''); setTo(''); setStatus(''); setPageNumber(1); }
  async function copyLogs() {
    if (!logs) return;
    const text = logs.items.map(item => `${dateLabel(item.occurredAtUtc)} [${item.level}] ${item.step}: ${item.message}${item.exceptionType ? ` (${item.exceptionType})` : ''}`).join('\n');
    try { await navigator.clipboard.writeText(text); setToast('Đã sao chép log.'); } catch { setToast('Không thể sao chép log trong trình duyệt này.'); }
  }
  return <div className="sync-jobs-page">
    <PageHeader eyebrow="SYSTEM" title="Sync Jobs" description="Theo dõi lịch sử đồng bộ, chẩn đoán lỗi và chạy lại job." />
    <Toolbar className="sync-jobs-toolbar">
      <SearchField label="Tìm theo tên nguồn dữ liệu" value={query} placeholder="Tìm nguồn dữ liệu…" onChange={event => setQuery(event.target.value)} />
      <label className="sync-date-field"><span>Từ ngày bắt đầu</span><input type="date" value={from} max={to || today()} onChange={event => { setFrom(event.target.value); setPageNumber(1); }} /></label>
      <label className="sync-date-field"><span>Đến ngày bắt đầu</span><input type="date" value={to} min={from || undefined} max={today()} onChange={event => { setTo(event.target.value); setPageNumber(1); }} /></label>
      <div className="sync-date-presets" aria-label="Chọn nhanh khoảng ngày">{[['Hôm nay', 0], ['7 ngày', 6], ['30 ngày', 29]].map(([label, days]) => <Button key={label} size="sm" onClick={() => { const end = new Date(); const startDate = new Date(end); startDate.setDate(end.getDate() - Number(days)); setFrom(`${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}-${String(startDate.getDate()).padStart(2,'0')}`); setTo(today()); setPageNumber(1); }}>{label}</Button>)}</div>
      <FilterChips label="Lọc theo trạng thái" value={status} onChange={value => { setStatus(value as SyncJobState | ''); setPageNumber(1); }} items={[{ value: '', label: 'Tất cả', count: counts[''] }, ...STATES.map(value => ({ value, label: value, count: ['Failed', 'Partial'].includes(value) ? counts[value] : undefined }))]} />
      <Button size="sm" onClick={clearFilters} disabled={!query && !from && !to && !status}>Xoá bộ lọc</Button>
      <small className="sync-timezone-hint">Ngày được lọc theo giờ địa phương ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</small>
    </Toolbar>
    {(error || (retryError && !activeJob)) && <div className="sync-jobs-feedback"><ErrorState title={error || retryError} /><Button size="sm" onClick={() => { setRetryError(''); setReload(value => value + 1); }}>Thử lại</Button></div>}
    {toast && <Toast onClose={() => setToast('')}>{toast}</Toast>}
    <Card className="sync-jobs-panel" aria-label="Danh sách Sync Jobs">
      <DataTable className="sync-jobs-table-wrap"><thead><tr><th>Job</th><th>Bắt đầu</th><th>Kết thúc</th><th>Thời lượng</th><th>Trạng thái</th><th>Số liệu</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={7}><Loading label="Đang tải Sync Jobs" /></td></tr> : error ? <tr><td colSpan={7}><EmptyState title="Không tải được danh sách">Thử tải lại để tiếp tục.</EmptyState></td></tr> : result.items.length === 0 ? <tr><td colSpan={7}><EmptyState title={search || from || to || status ? 'Không có job khớp bộ lọc' : 'Chưa có Sync Job'}>{(search || from || to || status) && <Button size="sm" onClick={clearFilters}>Xoá bộ lọc</Button>}</EmptyState></td></tr> : result.items.map(job => <tr key={job.id}>
          <td className="sync-job-name"><strong>{job.dataSource}</strong><small>#{job.id}{job.retryOfJobId && <span> · Retry của #{job.retryOfJobId}</span>}</small></td>
          <td>{dateLabel(job.startedAtUtc)}</td><td>{dateLabel(job.finishedAtUtc)}</td><td>{elapsed(job.startedAtUtc, job.finishedAtUtc)}</td>
          <td><Pill tone={tone(job.state)} size="sm">{job.state}</Pill></td><td className="sync-job-counts">{job.seenCount ?? 0} / {job.importedCount ?? 0} / {job.pendingCount ?? 0}<small>Đọc / nhập / chờ ghép</small></td>
          <td className="sync-job-action"><RowMenu label={`Thao tác job ${job.id}`}><button type="button" onClick={() => openLogModal(job)}>Xem log</button><button type="button" disabled={!canExecute || !['Failed','Partial'].includes(job.state) || retryingId !== null} title={!canExecute ? 'Bạn không có quyền retry job.' : !['Failed','Partial'].includes(job.state) ? 'Chỉ job Failed hoặc Partial mới retry được.' : undefined} onClick={() => void retry(job)}>{retryingId === job.id ? 'Đang retry…' : 'Retry'}</button></RowMenu></td>
        </tr>)}</tbody>
      </DataTable>
      <TableFooter start={start} end={end} total={result.totalItems} startContent={<label className="sync-page-size">Số dòng mỗi trang <Select aria-label="Số dòng mỗi trang" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPageNumber(1); }}>{PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</Select></label>} center={<span>Hiển thị {start}–{end} trong {result.totalItems}</span>}><Pager page={pageNumber} pages={totalPages} onChange={setPageNumber} disabled={loading} /></TableFooter>
    </Card>
    <Modal open={Boolean(activeJob)} onClose={closeLogModal} title={activeJob ? `Log đồng bộ · ${activeJob.dataSource} · #${activeJob.id}` : 'Log đồng bộ'} className="sync-log-modal" actions={<>{retryError && <div className="sync-log-retry-error"><ErrorState title={retryError} /></div>}<span className="sync-log-total">{logs ? `${visibleLogs.length}/${logs.totalItems} dòng` : ''}</span><Button onClick={() => void copyLogs()} disabled={!logs?.items.length}>Sao chép log</Button>{activeJob && activeEligible && <Button tone="primary" disabled={!canExecute || retryingId !== null} onClick={() => void retry(activeJob)}>{retryingId === activeJob.id ? 'Đang retry…' : 'Retry job này'}</Button>}<Button onClick={closeLogModal}>Đóng</Button></>}>
      {activeJob && <div className="sync-log-content"><div className="sync-log-meta"><Pill tone={tone(activeJob.state)} size="sm">{activeJob.state}</Pill><span>Bắt đầu {dateLabel(activeJob.startedAtUtc)}</span><span>Kết thúc {dateLabel(activeJob.finishedAtUtc)}</span><span>{elapsed(activeJob.startedAtUtc, activeJob.finishedAtUtc)}</span><small>Giờ địa phương ({Intl.DateTimeFormat().resolvedOptions().timeZone})</small></div>
        {(activeJob.errorCode || activeJob.errorSummary) && <section className="sync-log-cause"><h3>Nguyên nhân lỗi</h3>{activeJob.errorCode && <div><b>Mã lỗi</b><code>{activeJob.errorCode}</code></div>}{activeJob.errorSummary && <div><b>Tóm tắt</b><span>{activeJob.errorSummary}</span></div>}{logs?.items.find(item => item.level === 'Error') && <><div><b>Bước lỗi</b><span>{logs.items.find(item => item.level === 'Error')?.step}</span></div><div><b>Ngoại lệ</b><code>{logs.items.find(item => item.level === 'Error')?.exceptionType || '—'}</code></div></>}{activeJob.errorCode && ERROR_HINTS[activeJob.errorCode] && <p className="sync-log-hint">💡 {ERROR_HINTS[activeJob.errorCode]}</p>}</section>}
        <div className="sync-log-tools"><SearchField label="Tìm trong log" placeholder="Tìm trong log…" value={logQuery} onChange={event => setLogQuery(event.target.value)} /><Select aria-label="Lọc theo mức log" value={logLevel} onChange={event => setLogLevel(event.target.value as SyncJobLevel | '')}><option value="">Mọi mức</option><option value="Error">Error</option><option value="Warning">Warning</option><option value="Info">Info</option></Select></div>
        {logsLoading && <Loading label="Đang tải log" />}{logsError && <div className="sync-log-error"><ErrorState title={logsError} /><Button size="sm" onClick={() => setLogsReload(value => value + 1)}>Thử lại</Button></div>}
        {!logsLoading && !logsError && logs && (logs.items.length === 0 ? <EmptyState title="Job này chưa có log">Các job cũ được tạo trước khi bật ghi log sẽ không có dòng chẩn đoán.</EmptyState> : visibleLogs.length === 0 ? <EmptyState title="Không tìm thấy dòng log phù hợp" /> : <ol className="sync-log-timeline">{visibleLogs.map(item => <li key={item.id} className={`sync-log-${levelTone(item.level)}`}><time><b>{elapsedFrom(activeJob.startedAtUtc || activeJob.queuedAtUtc || null, item.occurredAtUtc)}</b><span>{dateLabel(item.occurredAtUtc)}</span></time><span className="sync-log-level">{item.level}</span><strong>{item.step}</strong><p>{item.message}{item.exceptionType && <code>{item.exceptionType}</code>}</p>{item.httpStatusCode != null && <small>HTTP {item.httpStatusCode}</small>}</li>)}</ol>)}
      </div>}
    </Modal>
  </div>;
}
