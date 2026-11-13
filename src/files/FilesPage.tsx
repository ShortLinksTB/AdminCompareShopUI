import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { deleteAdminFile, getAdminFile, getAdminFiles, publicFileUrl, uploadAdminFiles, type AdminFile, type AdminFilePage, type AdminFileTypeFilter } from './files-api';
import type { AdminRequest } from '../products/products-api';
import { Button, Card, DataTable, EmptyState, ErrorState, Lightbox, Loading, Modal, PageHeader, Pager, Pill, RowMenu, SearchField, Select, Toast, Toolbar } from '../ui';

const PAGE_SIZES = [10, 20, 50];
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf']);
const shortName = (name: string) => name.replace(/\.[^.]+$/, '');
const formatSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
const formatDate = (value: string, time = false) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', time ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
};
const isImage = (file: AdminFile) => file.contentType.startsWith('image/');

function normalizePage(result: AdminFilePage, requestedPage: number, requestedPageSize: number): AdminFilePage {
  // Keep client pagination state valid even if an older or partial API response
  // omits its pagination metadata.
  const response = result as AdminFilePage & { page?: number };
  const pageNumber = Number(response.pageNumber ?? response.page);
  const pageSize = Number(response.pageSize);
  const totalItems = Number(response.totalItems);
  return {
    items: Array.isArray(response.items) ? response.items : [],
    pageNumber: Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : requestedPage,
    pageSize: Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : requestedPageSize,
    totalItems: Number.isSafeInteger(totalItems) && totalItems >= 0 ? totalItems : 0,
  };
}

export function FilesPage({ requestAdmin, permissions = [] }: { requestAdmin: AdminRequest; permissions?: string[] }) {
  const canWrite = permissions.includes('files.write');
  const [page, setPage] = useState<AdminFilePage>({ items: [], pageNumber: 1, pageSize: 10, totalItems: 0 });
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [type, setType] = useState<AdminFileTypeFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState<AdminFile | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploads, setUploads] = useState<Array<{ file: File; status: 'queued' | 'uploading' | 'done' | 'failed'; error?: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminFile | null>(null);
  const [actionError, setActionError] = useState('');
  const [brokenThumbs, setBrokenThumbs] = useState<Set<string>>(() => new Set());
  const [menuId, setMenuId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<AdminFile | null>(null);
  const [toast, setToast] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query), 250); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void getAdminFiles(requestAdmin, pageNumber, pageSize, debouncedQuery, type, controller.signal)
      .then(result => {
        const normalized = normalizePage(result, pageNumber, pageSize);
        setPage(normalized); setPageNumber(normalized.pageNumber); setPageSize(normalized.pageSize);
      })
      .catch(reason => { if (!controller.signal.aborted) { setPage({ items: [], pageNumber, pageSize, totalItems: 0 }); setError(reason instanceof Error ? reason.message : 'Could not load files.'); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, pageNumber, pageSize, debouncedQuery, type, reload]);

  useEffect(() => {
    if (!detail) return;
    const controller = new AbortController(); setDetailLoading(true); setDetailError('');
    void getAdminFile(requestAdmin, detail.id, controller.signal).then(setDetail)
      .catch(reason => { if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : 'Could not load file details.'); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, detail?.id]);

  useEffect(() => {
    if (!menuId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const totalPages = Math.max(1, Math.ceil(page.totalItems / pageSize));
  const rangeStart = page.totalItems ? (pageNumber - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(pageNumber * pageSize, page.totalItems);
  const files = useMemo(() => page.items, [page.items]);

  const showDetails = useCallback((file: AdminFile) => { setMenuId(null); setDetail(file); }, []);
  function selectFiles(selected: FileList | File[]) {
    const choices = Array.from(selected).map(file => ({ file, status: 'queued' as const, error: allowed.has(file.type) && file.size <= 10 * 1024 * 1024 ? undefined : !allowed.has(file.type) ? 'Unsupported file type.' : 'File exceeds the 10 MB limit.' }));
    setUploads(current => [...current, ...choices]);
    setUploadOpen(true);
  }
  function onDrop(event: DragEvent) { event.preventDefault(); selectFiles(event.dataTransfer.files); }
  async function startUpload() {
    const pending = uploads.filter(item => item.status === 'queued' && !item.error);
    if (!pending.length) return;
    setUploading(true);
    const accepted: File[] = [];
    for (const item of pending) accepted.push(item.file);
    const outcomes = await uploadAdminFiles(requestAdmin, accepted, file => setUploads(current => current.map(item => item.file === file ? { ...item, status: 'uploading' } : item)));
    setUploads(current => current.map(item => {
      const result = outcomes.find(outcome => outcome.file === item.file);
      return result ? { ...item, status: result.error ? 'failed' : 'done', error: result.error } : item;
    }));
    setUploading(false); setReload(value => value + 1);
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    setActionError('');
    try { await deleteAdminFile(requestAdmin, deleteTarget.id); setDeleteTarget(null); setDetail(null); setReload(value => value + 1); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Could not delete file.'); }
  }
  async function copyLink(file: AdminFile) {
    try { await navigator.clipboard.writeText(publicFileUrl(file.id)); setToast('Public link copied'); }
    catch { setToast('Could not copy link'); }
    setMenuId(null);
  }
  const visibleDetail = detail;

  return <>
    <PageHeader eyebrow="MEDIA" title="Files" description="Lưu ảnh và tệp dùng chung, mỗi tệp có link công khai để hiển thị." actions={canWrite && <Button tone="primary" onClick={() => { setUploadOpen(true); setUploads([]); }}>⬆ Upload</Button>} />
    <Toolbar><SearchField label="Search file name" value={query} placeholder="Search file name..." onChange={event => { setQuery(event.target.value); setPageNumber(1); }} /><Select aria-label="Filter by type" value={type} onChange={event => { setType(event.target.value as AdminFileTypeFilter); setPageNumber(1); }}><option value="all">All types</option><option value="image">Images</option><option value="other">Other files</option></Select></Toolbar>
    <Card aria-label="Files list" style={{ overflow: 'hidden' }}>
      <DataTable><thead><tr><th>Preview</th><th>Name</th><th>Type</th><th>Uploaded by</th><th>Uploaded</th><th>Public link</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {loading ? <tr><td colSpan={7}><Loading label="Loading files" /></td></tr> : error ? <tr><td colSpan={7}><ErrorState title={error} /><Button size="sm" onClick={() => setReload(value => value + 1)}>Retry</Button></td></tr> : files.length === 0 ? <tr><td colSpan={7}><EmptyState title="No files found. Upload a file or adjust your search." /></td></tr> : files.map(file => <tr key={file.id}>
          <td><Button tone="ghost" aria-label={`Preview ${shortName(file.originalFileName)}`} onClick={() => isImage(file) && setLightbox(file)} disabled={!isImage(file)} style={{ width: 44, height: 44, padding: 0, overflow: 'hidden' }}>{isImage(file) && !brokenThumbs.has(file.id) ? <img style={{ width: '100%', height: '100%', objectFit: 'cover' }} src={publicFileUrl(file.id)} alt="" onError={() => setBrokenThumbs(current => new Set(current).add(file.id))} /> : file.contentType === 'application/pdf' ? 'PDF' : isImage(file) ? 'IMG' : 'FILE'}</Button></td>
          <td><Button tone="ghost" onClick={() => showDetails(file)} style={{ minHeight: 0, padding: 0, border: 0, color: 'var(--studio-text)', textAlign: 'left' }}>{shortName(file.originalFileName)}</Button></td><td><span style={{ color: 'var(--studio-muted)', fontSize: 12 }}>{file.contentType}</span></td><td>{file.uploadedBy || '—'}</td><td>{formatDate(file.uploadedAtUtc)}</td>
          <td><div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 175 }}><code style={{ maxWidth: 180, overflow: 'hidden', color: 'var(--studio-muted)', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/files/{file.id}</code><Button size="sm" tone="ghost" aria-label={`Copy link for ${shortName(file.originalFileName)}`} onClick={() => void copyLink(file)}>⧉</Button><a className="studio-button studio-button-ghost studio-button-sm" style={{ display: 'grid', minWidth: 34, placeItems: 'center', padding: 0, textDecoration: 'none' }} href={publicFileUrl(file.id)} target="_blank" rel="noreferrer" aria-label={`Open ${shortName(file.originalFileName)}`}>↗</a></div></td>
          <td><RowMenu label={`Actions for ${shortName(file.originalFileName)}`} open={menuId === file.id} onOpenChange={open => setMenuId(open ? file.id : null)}><button onClick={() => showDetails(file)}>Details</button><button onClick={() => void copyLink(file)}>Copy public link</button><a href={publicFileUrl(file.id)} target="_blank" rel="noreferrer" onClick={() => setMenuId(null)}>Open file</a><a href={publicFileUrl(file.id)} download={file.originalFileName} onClick={() => setMenuId(null)}>Download</a>{canWrite && <button onClick={() => { setMenuId(null); setDeleteTarget(file); }}>Delete</button>}</RowMenu></td>
        </tr>)}
      </tbody></DataTable>
      <div className="studio-table-footer"><span>Rows per page <Select size="sm" aria-label="Rows per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPageNumber(1); }}>{PAGE_SIZES.map(size => <option key={size}>{size}</option>)}</Select> · Total <b>{page.totalItems}</b> files</span><span>Showing {rangeStart}–{rangeEnd} of {page.totalItems} files</span><Pager page={pageNumber} pages={totalPages} onChange={setPageNumber} previousLabel="Previous page" nextLabel="Next page" formatPage={(current, pages) => `Page ${current} of ${pages}`} disabled={loading} /></div>
    </Card>

    <Modal open={uploadOpen} onClose={() => { if (!uploading) setUploadOpen(false); }} title="Upload files" actions={<><Button disabled={uploading} onClick={() => setUploadOpen(false)}>Close</Button><Button tone="primary" disabled={uploading || !uploads.some(item => item.status === 'queued' && !item.error)} onClick={() => void startUpload()}>{uploading ? 'Uploading…' : 'Upload'}</Button></>}>
      <Button tone="secondary" layout="stacked" style={{ padding: '28px 16px', borderStyle: 'dashed', borderWidth: 2, background: 'var(--studio-bg2)', color: 'var(--studio-muted)' }} onClick={() => inputRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={onDrop}><b style={{ color: 'var(--studio-text)' }}>Drag files here</b><span>or click to choose · JPG, PNG, WebP, GIF, SVG, PDF · max 10 MB per file</span></Button><input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,application/pdf" hidden onChange={event => { if (event.target.files) selectFiles(event.target.files); event.target.value = ''; }} />
      {uploads.map((item, index) => <div key={`${item.file.name}-${index}`} style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', alignItems: 'center', gap: 10, padding: 10, border: '1px solid var(--studio-border)', borderRadius: 12 }}><Pill size="sm">{item.file.name.split('.').pop()?.toUpperCase()}</Pill><div style={{ minWidth: 0 }}><b>{shortName(item.file.name)}</b><div style={{ color: 'var(--studio-muted)', fontSize: 12 }}>{formatSize(item.file.size)}{item.error ? ` · ${item.error}` : item.status === 'done' ? ' · Uploaded' : item.status === 'uploading' ? ' · Uploading…' : ' · Ready'}</div>{item.status === 'uploading' && <Loading label={`Uploading ${shortName(item.file.name)}`} />}</div><Pill tone={item.status === 'failed' ? 'bad' : item.status === 'done' ? 'ok' : 'neutral'} size="sm">{item.status === 'failed' ? 'Failed' : item.status === 'done' ? 'Done' : item.status === 'uploading' ? 'Uploading' : 'Queued'}</Pill></div>)}
    </Modal>

    <Modal open={Boolean(visibleDetail)} onClose={() => setDetail(null)} title="File details" actions={visibleDetail && <>{canWrite && <Button tone="danger" onClick={() => setDeleteTarget(visibleDetail)}>Delete</Button>}<a className="studio-button studio-button-secondary studio-button-md" href={publicFileUrl(visibleDetail.id)} download={visibleDetail.originalFileName}>Download</a><Button tone="primary" onClick={() => setDetail(null)}>Close</Button></>}>
      {visibleDetail && (detailLoading ? <Loading label="Loading details" /> : detailError ? <ErrorState title={detailError} /> : <><div style={{ display: 'grid', minHeight: 160, placeItems: 'center', overflow: 'hidden', borderRadius: 14, background: 'var(--studio-bg2)' }}>{isImage(visibleDetail) ? <Button tone="ghost" aria-label={`Preview ${shortName(visibleDetail.originalFileName)}`} onClick={() => setLightbox(visibleDetail)} style={{ display: 'grid', width: '100%', height: 220, placeItems: 'center', padding: 8, border: 0 }}><img style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} src={publicFileUrl(visibleDetail.id)} alt="" /></Button> : visibleDetail.contentType === 'application/pdf' ? 'PDF' : 'FILE'}</div><dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '14px 18px', margin: 0, overflowWrap: 'anywhere' }}>{[['Name', shortName(visibleDetail.originalFileName)], ['Type', visibleDetail.contentType], ['Size', formatSize(visibleDetail.sizeBytes)], ['Image dimensions', visibleDetail.width && visibleDetail.height ? `${visibleDetail.width} × ${visibleDetail.height}` : '—'], ['Uploaded by', visibleDetail.uploadedBy || '—'], ['Uploaded at', formatDate(visibleDetail.uploadedAtUtc, true)], ['Public link', `/files/${visibleDetail.id}`]].map(([label, value]) => <div key={label}><dt style={{ color: 'var(--studio-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{label}</dt><dd style={{ margin: '4px 0 0', fontWeight: 600 }}>{value}</dd></div>)}</dl><Button size="sm" aria-label="Copy link" onClick={() => void copyLink(visibleDetail)}>Copy public link</Button></>)}
    </Modal>

    <Modal open={Boolean(deleteTarget)} onClose={() => { setDeleteTarget(null); setActionError(''); }} title="Delete file?" role="alertdialog" actions={<><Button onClick={() => { setDeleteTarget(null); setActionError(''); }}>Cancel</Button><Button tone="danger" onClick={() => void confirmDelete()}>Delete</Button></>}>
      {deleteTarget && <><p>This will remove <b>{shortName(deleteTarget.originalFileName)}</b> and its public link.</p>{actionError && <ErrorState title={actionError} />}</>}
    </Modal>

    <Lightbox open={Boolean(lightbox)} onClose={() => setLightbox(null)} label="Image preview" closeLabel="Close preview" toolbar={lightbox?.originalFileName} resetKey={lightbox?.id}>{lightbox && <img src={publicFileUrl(lightbox.id)} alt={shortName(lightbox.originalFileName)} draggable={false} />}</Lightbox>
    {toast && <Toast>{toast}</Toast>}
  </>;
}
