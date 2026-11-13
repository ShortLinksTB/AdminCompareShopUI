import { useEffect, useState } from 'react';
import type { AdminRequest } from '../bannedItemsApi';
import { Button, Card, DataTable, EmptyState, ErrorState, Loading, PageHeader, Pager, TableFooter, Toolbar } from '../ui';
import { getAuditLogs, type AuditLogEntry, type AuditLogsPageResult } from './audit-logs-api';
import './audit-logs.css';

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
  return <details className="studio-disclosure">
    <summary>View Before/After JSON</summary>
    <div className="studio-json-grid">
      <section><h3>Before</h3><pre className="studio-code-panel">{jsonText(entry.before)}</pre></section>
      <section><h3>After</h3><pre className="studio-code-panel">{jsonText(entry.after)}</pre></section>
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

  return <div>
    <PageHeader eyebrow="SYSTEM" title="Audit Logs" description="Lịch sử thao tác ghi trong admin. Chỉ Super Admin có quyền xem (audit_logs.read)." />
    <Toolbar aria-label="Audit log pagination information" className="studio-toolbar-standalone"><span aria-hidden="true">⌕</span><span>Phân trang theo CreatedAtUtc giảm dần — API hiện chưa hỗ trợ filter theo actor/action/resource</span></Toolbar>
    <Card aria-label="Audit log records">
      {loading ? <Loading label="Loading audit logs" />
        : error ? <ErrorState title={error}><Button onClick={() => setReloadKey(value => value + 1)}>Retry</Button></ErrorState>
          : result.items.length === 0 ? <EmptyState title="No audit logs found." />
            : <>
              <p id="audit-logs-scroll-help" className="audit-logs-scroll-hint">Scroll horizontally to view all columns <span aria-hidden="true">→</span></p>
              <DataTable className="audit-logs-table-scroll" role="region" tabIndex={0} aria-label="Audit log records table" aria-describedby="audit-logs-scroll-help"><thead><tr><th>Time (UTC)</th><th>Actor</th><th>Action</th><th>Resource</th></tr></thead>
              <tbody>{result.items.map(entry => <tr key={entry.id}>
                <td className="studio-nowrap studio-tabular">{formatUtc(entry.createdAtUtc)}</td>
                <td className="studio-mono studio-muted">{entry.actor}</td>
                <td><strong>{entry.action}</strong></td>
                <td><code className="studio-code-chip">{entry.resourceType}{entry.resourceId === null ? '' : ` · ${entry.resourceId}`}</code><AuditLogDetails entry={entry} /></td>
              </tr>)}</tbody></DataTable>
            </>}
      {!loading && !error && <TableFooter start={firstItem} end={lastItem} total={result.totalItems} summary={`${firstItem}–${lastItem} of ${result.totalItems} records · page ${result.pageNumber}/${pageCount}`} center="ActorSubject is shown in full for audit purposes.">
        <Pager page={result.pageNumber} pages={pageCount} onChange={setPage} previousLabel="Previous" nextLabel="Next" />
      </TableFooter>}
    </Card>
  </div>;
}
