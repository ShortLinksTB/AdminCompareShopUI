import { useEffect, useState } from 'react';
import type { AdminRequest } from '../bannedItemsApi';
import { getAuditLogs, type AuditLogEntry, type AuditLogsPageResult } from './audit-logs-api';

const pageSize = 50;
const emptyPage: AuditLogsPageResult = { items: [], pageNumber: 1, pageSize, totalItems: 0 };

function formatUtc(value: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  const two = (part: number) => String(part).padStart(2, '0');
  return `${two(date.getUTCHours())}:${two(date.getUTCMinutes())}:${two(date.getUTCSeconds())} ${two(date.getUTCDate())}/${two(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} UTC`;
}

function jsonText(value: unknown | null): string {
  return value === null ? 'null' : JSON.stringify(value, null, 2) ?? 'null';
}

function AuditLogDetails({ entry }: { entry: AuditLogEntry }) {
  return <details className="audit-details">
    <summary>View Before/After JSON</summary>
    <div className="audit-json-grid">
      <section><h3>Before</h3><pre>{jsonText(entry.before)}</pre></section>
      <section><h3>After</h3><pre>{jsonText(entry.after)}</pre></section>
    </div>
  </details>;
}

export function AuditLogsPage({ requestAdmin }: { requestAdmin: AdminRequest }) {
  const [result, setResult] = useState(emptyPage);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getAuditLogs(requestAdmin, page, pageSize, controller.signal)
      .then(data => { setResult(data); setPage(data.pageNumber); })
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setResult(emptyPage);
        setError(reason instanceof Error ? reason.message : 'Could not load audit logs. Please try again.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, page, reloadKey]);

  const firstItem = result.items.length === 0 ? 0 : (result.pageNumber - 1) * result.pageSize + 1;
  const lastItem = result.items.length === 0 ? 0 : Math.min(firstItem + result.items.length - 1, result.totalItems);
  const pageCount = Math.max(1, Math.ceil(result.totalItems / result.pageSize));

  return <div className="audit-logs-page">
    <div className="page-header"><div><span className="eyebrow">SYSTEM</span><h1>Audit Logs</h1><p>Lịch sử thao tác ghi trong admin. Chỉ Super Admin có quyền xem (audit_logs.read).</p></div></div>
    <div className="audit-info" aria-label="Filtering unavailable"><span aria-hidden="true">⌕</span><span>Phân trang theo CreatedAtUtc giảm dần — API hiện chưa hỗ trợ filter theo actor/action/resource</span></div>
    <section className="panel table-panel audit-table-panel" aria-label="Audit log records">
      {loading ? <div className="audit-state" role="status">Loading audit logs…</div>
        : error ? <div className="audit-state audit-error" role="alert"><span>{error}</span><button className="outline-button" onClick={() => setReloadKey(value => value + 1)}>Retry</button></div>
          : result.items.length === 0 ? <div className="audit-state">No audit logs found.</div>
            : <div className="audit-table-wrap"><table><thead><tr><th>Time (UTC)</th><th>Actor</th><th>Action</th><th>Resource</th></tr></thead>
              <tbody>{result.items.map(entry => <tr key={entry.id}>
                <td className="audit-time">{formatUtc(entry.createdAtUtc)}</td>
                <td className="audit-actor">{entry.actor}</td>
                <td><strong>{entry.action}</strong></td>
                <td><code className="audit-resource">{entry.resourceType}{entry.resourceId === null ? '' : ` · ${entry.resourceId}`}</code><AuditLogDetails entry={entry} /></td>
              </tr>)}</tbody></table></div>}
      {!loading && !error && <div className="audit-footer"><span>{firstItem}–{lastItem} of {result.totalItems} records · page {result.pageNumber}/{pageCount}</span><span>ActorSubject is shown in full for audit purposes.</span>
        <div className="audit-pagination"><button className="outline-button small" disabled={result.pageNumber <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="outline-button small" disabled={result.pageNumber >= pageCount} onClick={() => setPage(value => value + 1)}>Next</button></div>
      </div>}
    </section>
  </div>;
}
