import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, Loading, Modal, PageHeader } from '../ui';
import type { AdminRequest } from '../bannedItemsApi';
import {
  bulkDeleteAffiliatePlatforms, commitAffiliatePlatformImport, createAffiliatePlatform,
  deleteAffiliatePlatform, getAffiliatePlatforms, previewAffiliatePlatformImport,
  updateAffiliatePlatform, type AffiliatePlatform, type AffiliatePlatformInput,
  type ImportPreview, type ImportResult,
} from './affiliate-platforms-api';
import './affiliate-platforms.css';

const MAX_FILE_SIZE = 1024 * 1024;
const EMPTY_FORM: AffiliatePlatformInput = { name: '', homeUrl: '', notes: '' };

function toInput(value: AffiliatePlatformInput): AffiliatePlatformInput {
  return { name: value.name.trim(), homeUrl: value.homeUrl?.trim() || null, notes: value.notes?.trim() || null };
}

function parseImportFile(file: File): Promise<AffiliatePlatformInput[]> {
  if (file.size > MAX_FILE_SIZE) return Promise.reject(new Error('File must be 1 MB or smaller.'));
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read import file.'));
    reader.readAsText(file);
  }).then(text => {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
    if (!Array.isArray(parsed)) throw new Error('Import file must contain a JSON array.');
    return parsed.map((row, rowIndex) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Row ${rowIndex}: expected an object.`);
      const item = row as Record<string, unknown>;
      if (typeof item.name !== 'string') throw new Error(`Row ${rowIndex}: name must be a string.`);
      if (item.homeUrl != null && typeof item.homeUrl !== 'string') throw new Error(`Row ${rowIndex}: homeUrl must be a string.`);
      if (item.notes != null && typeof item.notes !== 'string') throw new Error(`Row ${rowIndex}: notes must be a string.`);
      return { name: item.name, homeUrl: (item.homeUrl as string | null | undefined) ?? null, notes: (item.notes as string | null | undefined) ?? null };
    });
  });
}

export function AffiliatePlatformsPage({ requestAdmin, permissions = [] }: { requestAdmin: AdminRequest; permissions?: string[] }) {
  const [items, setItems] = useState<AffiliatePlatform[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [selection, setSelection] = useState<number[]>([]);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<AffiliatePlatform | null | undefined>(undefined);
  const [form, setForm] = useState<AffiliatePlatformInput>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<AffiliatePlatform | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<AffiliatePlatformInput[]>([]);
  const [importName, setImportName] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canCreate = permissions.includes('affiliate_platforms.create');
  const canUpdate = permissions.includes('affiliate_platforms.update');
  const canDelete = permissions.includes('affiliate_platforms.delete');
  const canImport = canCreate && canUpdate;
  const allSelected = items.length > 0 && selection.length === items.length;
  const selectedSet = useMemo(() => new Set(selection), [selection]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError('');
    getAffiliatePlatforms(requestAdmin, controller.signal).then(data => setItems(data))
      .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setLoadError(error instanceof Error ? error.message : 'Could not load affiliate platforms.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, reload]);

  const refresh = useCallback(() => setReload(value => value + 1), []);

  function openCreate() { setEditing(null); setForm(EMPTY_FORM); setFormError(''); }
  function openEdit(item: AffiliatePlatform) { setEditing(item); setForm({ name: item.name, homeUrl: item.homeUrl ?? '', notes: item.notes ?? '' }); setFormError(''); }
  function closeForm() { if (!saving) setEditing(undefined); }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || editing === undefined) return;
    const input = toInput(form);
    if (!input.name) { setFormError('Name is required.'); return; }
    if (input.homeUrl) { try { const url = new URL(input.homeUrl); if (!url.protocol || !url.host) throw new Error(); } catch { setFormError('Home URL must be an absolute URL.'); return; } }
    setSaving(true); setFormError('');
    try {
      if (editing) await updateAffiliatePlatform(requestAdmin, editing.id, input);
      else await createAffiliatePlatform(requestAdmin, input);
      setEditing(undefined); setNotice(editing ? 'Affiliate platform updated.' : 'Affiliate platform created.'); refresh();
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Could not save affiliate platform.'); }
    finally { setSaving(false); }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try { await deleteAffiliatePlatform(requestAdmin, deleting.id); setSelection(current => current.filter(id => id !== deleting.id)); setDeleting(null); setNotice('Affiliate platform deleted.'); refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not delete affiliate platform.'); }
  }

  async function confirmBulkDelete() {
    const ids = [...selection];
    try {
      const outcomes = await bulkDeleteAffiliatePlatforms(requestAdmin, ids);
      const failed = outcomes.filter(outcome => !outcome.deleted);
      setBulkConfirm(false); setSelection(failed.map(outcome => outcome.id));
      setNotice(failed.length ? `${ids.length - failed.length} deleted; ${failed.length} could not be deleted.` : `${ids.length} affiliate platforms deleted.`);
      refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not delete selected platforms.'); }
  }

  async function exportJson() {
    setNotice('');
    try {
      const complete = await getAffiliatePlatforms(requestAdmin);
      const data = complete.map(({ name, homeUrl, notes }) => ({ name, homeUrl, notes }));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `affiliate-platforms-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
      setNotice(`Exported ${data.length} affiliate platforms.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not export affiliate platforms.'); }
  }

  function openImport() { setImportRows([]); setImportName(''); setImportPreview(null); setImportResult(null); setImportError(''); setImportOpen(true); }
  function closeImport() { if (!importBusy) setImportOpen(false); }
  async function handleFile(file?: File) {
    if (!file) return;
    setImportName(file.name); setImportError(''); setImportPreview(null);
    try {
      const rows = await parseImportFile(file);
      setImportRows(rows); setImportBusy(true);
      const preview = await previewAffiliatePlatformImport(requestAdmin, rows);
      setImportPreview(preview);
    } catch (error) { setImportError(error instanceof Error ? error.message : 'Could not preview import file.'); }
    finally { setImportBusy(false); }
  }
  async function commitImport() {
    setImportBusy(true); setImportError('');
    try { const result = await commitAffiliatePlatformImport(requestAdmin, importRows); setImportResult(result); setNotice(`Import complete: ${result.created} created, ${result.updated} updated, ${result.failed} failed.`); refresh(); }
    catch (error) { setImportError(error instanceof Error ? error.message : 'Could not import platforms.'); }
    finally { setImportBusy(false); }
  }

  return <div className="affiliate-platforms-page">
    <PageHeader eyebrow="DỮ LIỆU" title="Affiliate Platforms" description="Quản lý các affiliate network/platform trung gian — thông tin tham chiếu khi gắn affiliate link theo platform."
      actions={<div className="affiliate-platforms-head-actions"><Button type="button" onClick={() => void exportJson()}>⬇ Export JSON</Button>{canImport && <Button type="button" onClick={openImport}>⬆ Import JSON</Button>}{canCreate && <Button type="button" tone="primary" onClick={openCreate}>+ Add platform</Button>}</div>} />
    {notice && <div className="affiliate-platforms-notice" role="status">{notice}</div>}
    {loadError ? <div className="affiliate-platforms-state"><ErrorState title={loadError} /><Button size="sm" onClick={refresh}>Retry</Button></div>
      : loading ? <Card className="affiliate-platforms-state"><Loading label="Loading affiliate platforms…">Loading affiliate platforms…</Loading></Card>
        : <Card className="affiliate-platforms-card" aria-label="Affiliate platforms list">
          {selection.length > 0 && <div className="affiliate-platforms-bulkbar"><strong>{selection.length} selected</strong><Button tone="danger" size="sm" disabled={!canDelete} onClick={() => setBulkConfirm(true)}>Delete selected</Button></div>}
          {items.length ? <div className="affiliate-platforms-table-wrap"><table><thead><tr><th><input aria-label="Select all" type="checkbox" checked={allSelected} ref={input => { if (input) input.indeterminate = selection.length > 0 && !allSelected; }} onChange={event => setSelection(event.target.checked ? items.map(item => item.id) : [])} /></th><th>Name</th><th>Home URL</th><th>Notes</th><th aria-label="Actions" /></tr></thead><tbody>
            {items.map(item => <tr key={item.id}><td><input aria-label={`Select ${item.name}`} type="checkbox" checked={selectedSet.has(item.id)} onChange={event => setSelection(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} /></td><td className="affiliate-platform-name">{item.name}</td><td>{item.homeUrl ? <a className="affiliate-platform-url" href={item.homeUrl} target="_blank" rel="noreferrer">{item.homeUrl}</a> : '—'}</td><td><div className="affiliate-platform-notes">{item.notes || '—'}</div></td><td><div className="affiliate-platform-row-actions">{canUpdate && <Button size="sm" onClick={() => openEdit(item)}>Edit</Button>}{canDelete && <Button size="sm" tone="danger" onClick={() => setDeleting(item)}>Delete</Button>}</div></td></tr>)}
          </tbody></table></div> : <div className="affiliate-platforms-empty"><EmptyState title="Chưa có affiliate platform nào">Thêm platform đầu tiên để bắt đầu gắn affiliate link theo network.</EmptyState></div>}
        </Card>}

    <Modal open={editing !== undefined} title={editing ? 'Edit platform' : 'Add platform'} onClose={closeForm} className="affiliate-platforms-modal" actions={<><Button type="button" disabled={saving} onClick={closeForm}>Huỷ</Button><Button type="submit" form="affiliate-platform-form" tone="primary" disabled={saving}>{saving ? 'Saving…' : 'Save platform'}</Button></>}>
      <form id="affiliate-platform-form" className="affiliate-platform-form" onSubmit={event => void save(event)}>
        {formError && <div className="affiliate-platform-error" role="alert">{formError}</div>}
        <label>Name<input autoFocus required maxLength={200} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Vd: AccessTrade" /></label>
        <label>Home URL<input value={form.homeUrl ?? ''} onChange={event => setForm(current => ({ ...current, homeUrl: event.target.value }))} placeholder="https://accesstrade.vn" /><small>Không bắt buộc.</small></label>
        <label>Notes<textarea value={form.notes ?? ''} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Ghi chú nội bộ (không bắt buộc)" /></label>
      </form>
    </Modal>

    <Modal open={deleting !== null} title="Delete platform" onClose={() => setDeleting(null)} actions={<><Button onClick={() => setDeleting(null)}>Cancel</Button><Button tone="danger" onClick={() => void confirmDelete()}>Delete platform</Button></>}>
      <p>Delete <strong>{deleting?.name}</strong>? This action cannot be undone.</p>
    </Modal>
    <Modal open={bulkConfirm} title="Delete selected platforms" onClose={() => setBulkConfirm(false)} actions={<><Button onClick={() => setBulkConfirm(false)}>Cancel</Button><Button tone="danger" onClick={() => void confirmBulkDelete()}>Delete {selection.length} platforms</Button></>}>
      <p>Delete {selection.length} selected platforms? This action cannot be undone.</p>
    </Modal>

    <Modal open={importOpen} title="Import platforms" onClose={closeImport} className="affiliate-platforms-import-modal" actions={<>
      {importResult ? <Button tone="primary" onClick={closeImport}>Done</Button> : <><Button disabled={importBusy} onClick={closeImport}>Cancel</Button>{importPreview && <Button tone="primary" disabled={importBusy} onClick={() => void commitImport()}>{importBusy ? 'Importing…' : 'Confirm import'}</Button>}</>}
    </>}>
      <div className="affiliate-platform-import-steps"><span>1 Choose file</span><span className={importPreview ? 'is-current' : ''}>2 Review</span><span className={importResult ? 'is-current' : ''}>3 Result</span></div>
      {importResult ? <div className="affiliate-platform-callout is-success">Import complete: <b>{importResult.created}</b> created · <b>{importResult.updated}</b> updated · <b>{importResult.failed}</b> failed.{importResult.errors.map(error => <div key={`${error.rowIndex}-${error.message}`}>Row {error.rowIndex}: {error.message}</div>)}</div> : <>
        {!importPreview && <><div className="affiliate-platform-drop"><Button type="button" onClick={() => fileRef.current?.click()}>Choose file…</Button><small>{importName || 'Maximum 1 MB · each row: name, homeUrl, notes'}</small></div><div className="affiliate-platform-callout is-warning">Import adds or updates by platform name. Existing platforms omitted from the file remain untouched.</div></>}
        {importBusy && <Loading label="Checking import…">Checking import…</Loading>}
        {importError && <div className="affiliate-platform-error" role="alert">{importError}</div>}
        {importPreview && <><div className={importPreview.errors.length ? 'affiliate-platform-callout is-warning' : 'affiliate-platform-callout is-success'}><b>{importPreview.created}</b> to create · <b>{importPreview.updated}</b> to update.{importPreview.errors.map(error => <div key={`${error.rowIndex}-${error.message}`}>Row {error.rowIndex}: {error.message}</div>)}</div><Button type="button" size="sm" disabled={importBusy} onClick={() => fileRef.current?.click()}>Choose a different file</Button></>}
      </>}
      <input ref={fileRef} className="affiliate-platform-hidden-file" type="file" accept="application/json,.json" onChange={event => void handleFile(event.target.files?.[0])} />
    </Modal>
  </div>;
}
