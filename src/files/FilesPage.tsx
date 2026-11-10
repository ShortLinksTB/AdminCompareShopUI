import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent, type WheelEvent } from 'react';
import { deleteAdminFile, getAdminFile, getAdminFiles, publicFileUrl, uploadAdminFiles, type AdminFile, type AdminFilePage, type AdminFileTypeFilter } from './files-api';
import type { AdminRequest } from '../products/products-api';
import './files.css';

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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [toast, setToast] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);

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
    if (!detail && !uploadOpen && !deleteTarget && !lightbox && !menuId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (lightbox) setLightbox(null);
      else if (deleteTarget) setDeleteTarget(null);
      else if (uploadOpen) setUploadOpen(false);
      else if (detail) setDetail(null);
      else setMenuId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detail, uploadOpen, deleteTarget, lightbox, menuId]);

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
  function changeZoom(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const next = Math.min(4, Math.max(1, zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    setPan(next === 1 ? { x: 0, y: 0 } : { x: x - (x - pan.x) * next / zoom, y: y - (y - pan.y) * next / zoom });
    setZoom(next);
  }
  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (zoom <= 1) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
  }
  const visibleDetail = detail;

  return <section className="files-page">
    <div className="page-header"><div><span className="eyebrow">MEDIA</span><h1>Files</h1><p>Lưu ảnh và tệp dùng chung, mỗi tệp có link công khai để hiển thị.</p></div>{canWrite && <button className="primary-button" onClick={() => { setUploadOpen(true); setUploads([]); }}>⬆ Upload</button>}</div>
    <div className="toolbar"><label className="toolbar-search" aria-label="Search file name">⌕<input value={query} onChange={event => { setQuery(event.target.value); setPageNumber(1); }} placeholder="Search file name..." /></label><select aria-label="Filter by type" value={type} onChange={event => { setType(event.target.value as AdminFileTypeFilter); setPageNumber(1); }}><option value="all">All types</option><option value="image">Images</option><option value="other">Other files</option></select></div>
    <section className="panel files-table-panel"><div className="files-table-scroll"><table><thead><tr><th>Preview</th><th>Name</th><th>Type</th><th>Uploaded by</th><th>Uploaded</th><th>Public link</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {loading ? <tr><td colSpan={7}><div className="files-state" role="status">Loading files…</div></td></tr> : error ? <tr><td colSpan={7}><div className="files-state files-error" role="alert">{error}<button className="outline-button small" onClick={() => setReload(value => value + 1)}>Retry</button></div></td></tr> : files.length === 0 ? <tr><td colSpan={7}><div className="files-state">No files found. Upload a file or adjust your search.</div></td></tr> : files.map(file => <tr key={file.id}>
        <td><button className="file-thumb" aria-label={`Preview ${shortName(file.originalFileName)}`} onClick={() => isImage(file) && setLightbox(file)} disabled={!isImage(file)}>{isImage(file) && !brokenThumbs.has(file.id) ? <img src={publicFileUrl(file.id)} alt="" onError={() => setBrokenThumbs(current => new Set(current).add(file.id))} /> : <span>{file.contentType === 'application/pdf' ? 'PDF' : isImage(file) ? 'IMG' : 'FILE'}</span>}</button></td>
        <td><button className="file-name" onClick={() => showDetails(file)}>{shortName(file.originalFileName)}</button></td><td><span className="file-type">{file.contentType}</span></td><td className="file-meta-cell">{file.uploadedBy || '—'}</td><td className="file-meta-cell">{formatDate(file.uploadedAtUtc)}</td>
        <td><div className="file-public-link"><code>/files/{file.id}</code><button className="file-link-action" aria-label={`Copy link for ${shortName(file.originalFileName)}`} onClick={() => void copyLink(file)}>⧉</button><a className="file-link-action" href={publicFileUrl(file.id)} target="_blank" rel="noreferrer" aria-label={`Open ${shortName(file.originalFileName)}`}>↗</a></div></td>
        <td><div className="file-menu-wrap"><button className="file-menu-trigger" aria-label={`Actions for ${shortName(file.originalFileName)}`} aria-expanded={menuId === file.id} onClick={() => setMenuId(menuId === file.id ? null : file.id)}>⋮</button>{menuId === file.id && <div className="file-menu"><button onClick={() => showDetails(file)}>Details</button><button onClick={() => void copyLink(file)}>Copy public link</button><a href={publicFileUrl(file.id)} target="_blank" rel="noreferrer" onClick={() => setMenuId(null)}>Open file</a><a href={publicFileUrl(file.id)} download={file.originalFileName} onClick={() => setMenuId(null)}>Download</a>{canWrite && <button className="file-danger-text" onClick={() => { setMenuId(null); setDeleteTarget(file); }}>Delete</button>}</div>}</div></td>
      </tr>)}
    </tbody></table></div><footer className="files-footer"><div className="files-page-size">Rows per page <select aria-label="Rows per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPageNumber(1); }}>{PAGE_SIZES.map(size => <option key={size}>{size}</option>)}</select><span className="files-total">Total <b>{page.totalItems}</b> files</span></div><span className="files-range">Showing {rangeStart}–{rangeEnd} of {page.totalItems} files</span><div className="files-pager"><button aria-label="Previous page" disabled={pageNumber <= 1 || loading} onClick={() => setPageNumber(value => value - 1)}>‹</button><span>Page {pageNumber} of {totalPages}</span><button aria-label="Next page" disabled={pageNumber >= totalPages || loading} onClick={() => setPageNumber(value => value + 1)}>›</button></div></footer></section>

    {uploadOpen && <div className="files-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !uploading) setUploadOpen(false); }}><section className="files-modal" role="dialog" aria-modal="true" aria-labelledby="files-upload-title"><header><h2 id="files-upload-title">Upload files</h2><button aria-label="Close" disabled={uploading} onClick={() => setUploadOpen(false)}>×</button></header><div className="files-modal-body"><button className="files-drop" onClick={() => inputRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={onDrop}><b>Drag files here</b><span>or click to choose · JPG, PNG, WebP, GIF, SVG, PDF · max 10 MB per file</span></button><input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,application/pdf" hidden onChange={event => { if (event.target.files) selectFiles(event.target.files); event.target.value = ''; }} />{uploads.map((item, index) => <div className="files-upload-row" key={`${item.file.name}-${index}`}><span className="file-ext">{item.file.name.split('.').pop()?.toUpperCase()}</span><div className="files-upload-info"><b>{shortName(item.file.name)}</b><span>{formatSize(item.file.size)}{item.error ? ` · ${item.error}` : item.status === 'done' ? ' · Uploaded' : item.status === 'uploading' ? ' · Uploading…' : ' · Ready'}</span>{item.status === 'uploading' && <div className="files-progress files-progress-indeterminate" aria-label={`Uploading ${shortName(item.file.name)}`}><i /></div>}</div><span className={item.status === 'failed' ? 'files-failed' : item.status === 'done' ? 'files-done' : ''}>{item.status === 'failed' ? 'Failed' : item.status === 'done' ? 'Done' : item.status === 'uploading' ? 'Uploading' : 'Queued'}</span></div>)}</div><footer><button className="outline-button" disabled={uploading} onClick={() => setUploadOpen(false)}>Close</button><button className="primary-button" disabled={uploading || !uploads.some(item => item.status === 'queued' && !item.error)} onClick={() => void startUpload()}>{uploading ? 'Uploading…' : 'Upload'}</button></footer></section></div>}

    {visibleDetail && <div className="files-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDetail(null); }}><section className="files-modal" role="dialog" aria-modal="true" aria-labelledby="files-detail-title"><header><h2 id="files-detail-title">File details</h2><button aria-label="Close" onClick={() => setDetail(null)}>×</button></header><div className="files-modal-body">{detailLoading ? <div className="files-state">Loading details…</div> : detailError ? <div className="files-error" role="alert">{detailError}</div> : <><div className="files-detail-preview">{isImage(visibleDetail) ? <img src={publicFileUrl(visibleDetail.id)} alt={shortName(visibleDetail.originalFileName)} /> : <span>{visibleDetail.contentType === 'application/pdf' ? 'PDF' : 'FILE'}</span>}</div><dl className="files-detail-grid"><div className="wide"><dt>Name</dt><dd>{shortName(visibleDetail.originalFileName)}</dd></div><div><dt>Type</dt><dd>{visibleDetail.contentType}</dd></div><div><dt>Size</dt><dd>{formatSize(visibleDetail.sizeBytes)}</dd></div><div><dt>Image dimensions</dt><dd>{visibleDetail.width && visibleDetail.height ? `${visibleDetail.width} × ${visibleDetail.height}` : '—'}</dd></div><div><dt>Uploaded by</dt><dd>{visibleDetail.uploadedBy || '—'}</dd></div><div className="wide"><dt>Uploaded at</dt><dd>{formatDate(visibleDetail.uploadedAtUtc, true)}</dd></div><div className="wide"><dt>Public link</dt><dd><div className="file-public-link"><code>/files/{visibleDetail.id}</code><button className="file-link-action" aria-label="Copy link" onClick={() => void copyLink(visibleDetail)}>⧉</button></div></dd></div></dl></>}</div><footer>{canWrite && <button className="file-delete-button" onClick={() => setDeleteTarget(visibleDetail)}>Delete</button>}<a className="outline-button" href={publicFileUrl(visibleDetail.id)} download={visibleDetail.originalFileName}>Download</a><button className="primary-button" onClick={() => setDetail(null)}>Close</button></footer></section></div>}

    {deleteTarget && <div className="files-backdrop" role="presentation"><section className="files-confirm" role="alertdialog" aria-modal="true" aria-labelledby="files-delete-title"><h2 id="files-delete-title">Delete file?</h2><p>This will remove <b>{shortName(deleteTarget.originalFileName)}</b> and its public link.</p>{actionError && <p className="files-error" role="alert">{actionError}</p>}<footer><button className="outline-button" onClick={() => { setDeleteTarget(null); setActionError(''); }}>Cancel</button><button className="file-delete-button" onClick={() => void confirmDelete()}>Delete</button></footer></section></div>}

    {lightbox && <div className="files-lightbox" role="dialog" aria-modal="true" aria-label="Image preview"><div ref={lightboxRef} className={`files-lightbox-box${zoom > 1 ? ' zoomed' : ''}`} onWheel={changeZoom} onPointerDown={startPan} onPointerMove={event => { if (drag) setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y }); }} onPointerUp={() => setDrag(null)}><button className="files-lightbox-close" aria-label="Close preview" onClick={() => { setLightbox(null); setZoom(1); setPan({ x: 0, y: 0 }); }}>×</button><div className="files-lightbox-title">{shortName(lightbox.originalFileName)}</div><img src={publicFileUrl(lightbox.id)} alt={shortName(lightbox.originalFileName)} draggable={false} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} /><span className="files-lightbox-hint">Scroll to zoom · drag to pan</span><span className="files-lightbox-zoom">{Math.round(zoom * 100)}%</span></div></div>}
    {toast && <div className="files-toast" role="status">{toast}</div>}
  </section>;
}
