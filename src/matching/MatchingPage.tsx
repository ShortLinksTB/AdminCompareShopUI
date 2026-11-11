import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, Field, FilterChips, Kbd, Lightbox, Loading, Modal, PageHeader, Pill, SearchField, Switch, Toast } from '../ui';
import { getAdminFiles, publicFileUrl, type AdminFile } from '../files/files-api';
import { approveMatching, approveMatchingGroup, createMatchingProduct, displayVerdict, fetchMatchings, formatPrice, restoreMatching, skipMatching, type AdminRequest, type MatchingCounts, type PendingMatching, type Verdict } from './matching-api';
import './matching.css';

type Dialog = 'create' | 'skip' | 'files' | null;
const verdictTone = (value: Verdict): 'ok' | 'warn' | 'info' | 'bad' => ({ confident: 'ok', review: 'warn', likely_new: 'info', likely_skip: 'bad' } as const)[value];
const reasons = [['not_product', 'Không phải sản phẩm cần theo dõi'], ['duplicate', 'Trùng lặp với mặt hàng khác'], ['bad_source', 'Thông tin shop sai hoặc thiếu'], ['other', 'Khác']];
const emptyCounts: MatchingCounts = { all: 0, pending: 0, skipped: 0, confident: 0, review: 0, likely_new: 0, likely_skip: 0 };
const attrsOrder = ['Hãng', 'Dòng', 'Chip', 'GPU', 'RAM', 'Ổ cứng', 'Màn hình', 'Phụ kiện'];
const makeSlug = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const isTextEntry = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
function comparisonRows(source: Record<string, string | null>, candidate: PendingMatching['candidates'][number]) {
  const differences = new Map(candidate.differences.map(difference => [difference.attribute, difference]));
  return attrsOrder.filter(attribute => source[attribute] || candidate.attributes[attribute] || differences.has(attribute)).map(attribute => {
    const difference = differences.get(attribute);
    return { attribute, source: difference?.source ?? source[attribute] ?? null, candidate: difference?.candidate ?? candidate.attributes[attribute] ?? null, kind: difference?.kind ?? 'same' };
  });
}

export function MatchingPage({ requestAdmin, permissions = [] }: { requestAdmin: AdminRequest; permissions?: string[] }) {
  const [items, setItems] = useState<PendingMatching[]>([]), [counts, setCounts] = useState<MatchingCounts>(emptyCounts);
  const [groupItems, setGroupItems] = useState<PendingMatching[]>([]), [groupLoading, setGroupLoading] = useState(false), [groupError, setGroupError] = useState('');
  const [status, setStatus] = useState<'pending' | 'skipped'>('pending'), [verdict, setVerdict] = useState('all'), [query, setQuery] = useState(''), [page, setPage] = useState(1), [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null), [candidateId, setCandidateId] = useState<number | null>(null), [groupOn, setGroupOn] = useState(true);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [toast, setToast] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null), [lightbox, setLightbox] = useState(false);
  const [productName, setProductName] = useState(''), [productBrand, setProductBrand] = useState(''), [productSlug, setProductSlug] = useState(''), [imageChoice, setImageChoice] = useState<'files' | 'shop' | 'none'>('files'), [selectedFile, setSelectedFile] = useState<AdminFile | null>(null), [files, setFiles] = useState<AdminFile[]>([]), [filesError, setFilesError] = useState(''), [skipReason, setSkipReason] = useState(reasons[0][0]), [skipNote, setSkipNote] = useState('');
  const canCreate = permissions.includes('products.create'), canApprove = permissions.includes('matching.approve');
  const current = items.find(item => item.id === selectedId) ?? items[0] ?? null;
  const activeCandidate = current?.candidates.find(item => item.productId === candidateId) ?? null;
  const handledItems = Math.max(0, (counts.all ?? 0) - (counts.pending ?? 0));

  useEffect(() => {
    let cancelled = false;
    if (!current?.groupKey || status !== 'pending') {
      setGroupItems([]); setGroupLoading(false); setGroupError('');
      return () => { cancelled = true; };
    }
    const groupKey = current.groupKey;
    void (async () => {
      setGroupLoading(true); setGroupError(''); setGroupItems([]);
      try {
        const first = await fetchMatchings(requestAdmin, { status: 'pending', verdict: 'all', q: '', page: 1, pageSize: 100 });
        const all = [...first.items];
        const pageCount = Math.ceil(first.total / Math.max(first.pageSize, 1));
        for (let nextPage = 2; nextPage <= pageCount; nextPage += 1) {
          const next = await fetchMatchings(requestAdmin, { status: 'pending', verdict: 'all', q: '', page: nextPage, pageSize: 100 });
          all.push(...next.items);
        }
        if (!cancelled) setGroupItems(all.filter(item => item.groupKey === groupKey && item.status === 'pending'));
      } catch (cause) {
        if (!cancelled) setGroupError(cause instanceof Error ? cause.message : 'Không tải được toàn bộ mặt hàng trong nhóm.');
      } finally {
        if (!cancelled) setGroupLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [current?.groupKey, status, requestAdmin]);

  const load = useCallback(async (requestedPage = page) => {
    setLoading(true); setError('');
    try {
      const result = await fetchMatchings(requestAdmin, { status, verdict, q: query, page: requestedPage, pageSize: 20 });
      setItems(result.items); setCounts(result.counts); setTotal(result.total); setPage(result.page);
      setSelectedId(id => result.items.some(item => item.id === id) ? id : result.items[0]?.id ?? null);
      setCandidateId(id => result.items.find(item => item.id === selectedId)?.candidates.some(candidate => candidate.productId === id) ? id : null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được hàng đợi.'); }
    finally { setLoading(false); }
  }, [requestAdmin, status, verdict, query, page, selectedId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(1), 250); return () => window.clearTimeout(timer); }, [status, verdict, query, requestAdmin]);

  const runAction = async (action: () => Promise<unknown>, message: string) => {
    if (!current || busy) return;
    setBusy(true); setActionError('');
    try { await action(); setDialog(null); setToast(message); setCandidateId(null); await load(page); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Thao tác thất bại. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  };
  const openCreate = () => { if (!current || !canCreate) return; const name = [current.attributes['Hãng'] ?? current.brand, current.attributes['Dòng'], current.attributes['Chip'], current.attributes['RAM'], current.attributes['Ổ cứng']].filter(Boolean).join(' '); setProductName(name || current.name); setProductBrand(current.attributes['Hãng'] ?? current.brand ?? ''); setProductSlug(makeSlug(name || current.name)); setImageChoice('files'); setSelectedFile(null); setActionError(''); setDialog('create'); };
  const openFiles = async () => { setDialog('files'); setFilesError(''); try { const result = await getAdminFiles(requestAdmin, 1, 24, '', 'image'); setFiles(result.items); } catch (cause) { setFilesError(cause instanceof Error ? cause.message : 'Không tải được Files.'); } };
  const approve = () => { if (!activeCandidate || !current) return; const ids = groupOn && !groupLoading && !groupError && groupItems.length > 1 ? groupItems.map(item => item.id) : [current.id]; void runAction(() => ids.length > 1 ? approveMatchingGroup(requestAdmin, ids, activeCandidate.productId) : approveMatching(requestAdmin, current.id, activeCandidate.productId), `Đã gửi duyệt ${ids.length} mặt hàng.`); };
  const create = () => { if (!current) return; void runAction(() => createMatchingProduct(requestAdmin, current.id, { name: productName.trim(), brand: productBrand.trim(), slug: productSlug.trim(), imageChoice, imageId: imageChoice === 'files' ? selectedFile?.id ?? null : null, applyGroup: groupOn && groupItems.length > 1 }), 'Đã tạo sản phẩm và gắn mặt hàng.'); };
  const skip = () => { if (!current) return; void runAction(() => skipMatching(requestAdmin, current.id, skipReason, skipNote.trim()), 'Đã lưu mặt hàng vào danh sách bỏ qua.'); };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dialog) { setDialog(null); return; }
      if (dialog || isTextEntry(event.target) || event.metaKey || event.ctrlKey || event.altKey || !items.length) return;
      const index = Math.max(0, items.findIndex(item => item.id === (current?.id ?? selectedId)));
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next = Math.min(items.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1))); setSelectedId(items[next].id); setCandidateId(null); }
      else if (/^[1-5]$/.test(event.key) && current?.candidates[Number(event.key) - 1]) { setCandidateId(current.candidates[Number(event.key) - 1].productId); }
      else if (status === 'pending' && event.key === 'Enter' && activeCandidate) { event.preventDefault(); approve(); }
      else if (status === 'pending' && (event.key === 'n' || event.key === 'N') && canCreate) openCreate();
      else if (status === 'pending' && (event.key === 's' || event.key === 'S')) setDialog('skip');
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  const filterItems = [{ value: 'all', label: 'Tất cả', count: counts.all }, { value: 'confident', label: 'Chắc chắn', count: counts.confident }, { value: 'review', label: 'Cần xem', count: counts.review }, { value: 'likely_new', label: 'Sản phẩm mới', count: counts.likely_new }, { value: 'likely_skip', label: 'Có thể bỏ qua', count: counts.likely_skip }, { value: 'skipped', label: 'Đã bỏ qua', count: counts.skipped }];
  const pages = Math.max(1, Math.ceil(total / 20));
  const sourceAttrs = current?.attributes ?? {};

  return <main className="matching-studio">
    <PageHeader eyebrow="Catalog" title="Product Matching" description="So sánh thông số và duyệt gợi ý. Mọi quyết định đều do bạn xác nhận." actions={<div className="matching-progress"><span className="matching-progress-ring" aria-hidden="true">{counts.all ? Math.min(100, Math.round(handledItems / counts.all * 100)) : 0}%</span><span><b>{handledItems} / {counts.all}</b><small>đã xử lý trong hàng đợi</small></span></div>} />
    <FilterChips items={filterItems} value={status === 'skipped' ? 'skipped' : verdict} onChange={value => { if (value === 'skipped') { setStatus('skipped'); setVerdict('all'); } else { setStatus('pending'); setVerdict(value); } setPage(1); }} />
    <div className="matching-layout">
      <Card className="matching-queue-panel">
        <div className="matching-queue-toolbar"><SearchField type="search" label="Tìm tên, SKU hoặc cửa hàng" placeholder="Tìm tên, SKU hoặc cửa hàng…" value={query} onChange={event => setQuery(event.target.value)} /><Button size="sm" onClick={() => void load(1)} disabled={loading}>Làm mới</Button></div>
        <div className="matching-queue-list" aria-label="Hàng đợi" aria-busy={loading}>
          {loading ? <Loading label="Đang tải hàng đợi" /> : error ? <ErrorState title="Không tải được hàng đợi">{error}<Button size="sm" onClick={() => void load(1)}>Thử lại</Button></ErrorState> : items.length === 0 ? <EmptyState title={status === 'skipped' ? 'Chưa có mặt hàng đã bỏ qua' : 'Hàng đợi đã được xử lý'}>Mặt hàng mới từ nguồn dữ liệu sẽ xuất hiện tại đây.</EmptyState> : items.map(item => <button type="button" className="matching-queue-item" key={item.id} aria-current={current?.id === item.id} onClick={() => { setSelectedId(item.id); setCandidateId(null); setActionError(''); }}>
            <span className={`matching-verdict-dot ${item.verdict}`} aria-hidden="true" /><span className="matching-queue-copy"><b>{item.name}</b><small>{item.source.shopName ?? item.source.sourceName ?? 'Nguồn chưa xác định'} · {item.externalSku || 'Không có SKU'}</small><span className="matching-queue-meta"><Pill tone={verdictTone(item.verdict)}>{displayVerdict(item.verdict)}</Pill>{item.groupKey && <Pill tone="neutral">Nhóm {groupLoading ? '…' : groupItems.length || 1}</Pill>}<span>{formatPrice(item.source.price)}</span></span></span>
          </button>)}
        </div>
        {pages > 1 && <div className="matching-pager"><Button size="sm" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>←</Button><span>{page} / {pages}</span><Button size="sm" disabled={page >= pages || loading} onClick={() => void load(page + 1)}>→</Button></div>}
      </Card>
      {!loading && !error && current && <Card className="matching-workspace" aria-live="polite">
        <div className="matching-listing">
          <button className="matching-listing-image" type="button" aria-label="Mở ảnh mặt hàng" disabled={!current.source.imageUrl} onClick={() => setLightbox(true)}>{current.source.imageUrl ? <img src={current.source.imageUrl} alt="Ảnh mặt hàng từ shop" /> : <span>No img</span>}</button>
          <div className="matching-listing-detail"><Pill tone={verdictTone(current.verdict)}>{displayVerdict(current.verdict)}</Pill><h2>{current.name}</h2><p>{current.source.shopName ?? current.source.sourceName ?? 'Nguồn chưa xác định'} · SKU {current.externalSku || '—'} · {formatPrice(current.source.price)}</p><div className="matching-attributes">{attrsOrder.filter(key => sourceAttrs[key]).map(key => <span className="matching-attribute" key={key}><small>{key}</small><b>{sourceAttrs[key]}</b></span>)}</div></div>
        </div>
        {current.groupKey && groupLoading && <p className="matching-note" role="status">Đang tải đầy đủ mặt hàng pending trong nhóm…</p>}
        {current.groupKey && groupError && <p className="matching-note matching-note-warning" role="alert">Không tải được đầy đủ nhóm; thao tác sẽ chỉ áp dụng cho mặt hàng đang chọn. {groupError}</p>}
        {current.groupKey && !groupLoading && !groupError && groupItems.length > 1 && <div className="matching-group"><span className="matching-group-avatars">{groupItems.slice(0, 5).map(item => <i key={item.id} title={item.source.shopName ?? item.name}>{(item.source.shopName ?? 'S').slice(0, 1).toUpperCase()}</i>)}</span><span className="matching-group-copy"><b>Cùng một sản phẩm ở {groupItems.length} cửa hàng</b><small>Tên khác nhau, thông số cốt lõi khớp nhau.</small></span><Switch checked={groupOn} onChange={setGroupOn} label="Duyệt cả nhóm cùng lúc" /></div>}
        {current.verdict === 'likely_new' && <p className="matching-note">Các ứng viên có khác biệt biến thể hoặc chưa có ứng viên phù hợp. Kiểm tra thông tin trước khi tạo sản phẩm mới.</p>}
        {current.verdict === 'likely_skip' && <p className="matching-note matching-note-warning">Mặt hàng có thể là phụ kiện hoặc ngoài phạm vi laptop. Bạn có thể bỏ qua với lý do.</p>}
        <div className="matching-section-heading"><h3>Sản phẩm gợi ý</h3><span>{current.candidates.length} ứng viên, xếp theo thông số</span></div>
        {current.candidates.length ? <div className="matching-candidates">{current.candidates.slice(0, 5).map((candidate, index) => <article className={`matching-candidate-card${candidateId === candidate.productId ? ' selected' : ''}`} key={candidate.productId}>
          <button type="button" className="matching-candidate-head" aria-pressed={candidateId === candidate.productId} onClick={() => setCandidateId(candidateId === candidate.productId ? null : candidate.productId)}><span className="matching-score-ring" style={{ '--score': `${Math.round(candidate.score * 100)}%` } as React.CSSProperties}><b>{Math.round(candidate.score * 100)}%</b></span><span className="matching-candidate-copy"><b>{candidate.name}</b><small>{candidate.brand ?? 'Chưa rõ hãng'} · ID {candidate.productId}</small><span className="matching-differences">{candidate.differences.length ? candidate.differences.slice(0, 4).map((diff, i) => <Pill key={`${diff.attribute}-${i}`} tone={diff.kind === 'diff' ? 'bad' : 'warn'}>{diff.attribute}: {diff.candidate ?? 'Khác'}</Pill>) : <Pill tone="ok">✓ Khớp thông số đã biết</Pill>}</span></span><span className="matching-candidate-level"><Pill tone={candidate.level === 'confident' ? 'ok' : candidate.level === 'variant' ? 'bad' : 'warn'}>{candidate.level === 'confident' ? 'Chắc chắn' : candidate.level === 'variant' ? 'Khác biến thể' : 'Cần xem'}</Pill><Kbd>{index + 1}</Kbd></span></button>
          {candidateId === candidate.productId && <div className="matching-comparison"><div className="matching-comparison-head"><span>Thuộc tính</span><span>Mặt hàng shop</span><span>Sản phẩm chuẩn</span></div>{comparisonRows(sourceAttrs, candidate).map((diff, i) => <div className={`matching-comparison-row ${diff.kind === 'diff' ? 'different' : diff.kind === 'soft' ? 'soft' : ''}`} key={`${diff.attribute}-${i}`}><b>{diff.attribute}</b><span>{diff.source ?? '—'}</span><span>{diff.candidate ?? '—'}</span></div>)}</div>}
        </article>)}</div> : <div className="matching-no-candidates">Không tìm thấy ứng viên phù hợp. Chỉ người duyệt mới có thể quyết định tạo sản phẩm mới.</div>}
        <p className="matching-tip">Điểm là mức khớp thông số, không phải quyết định. Khác chip, GPU, RAM, ổ cứng hoặc màn hình có thể là biến thể khác.</p>
        {actionError && <div className="matching-action-error" role="alert">{actionError}</div>}
        <div className="matching-action-bar">{status === 'skipped' ? <div><span>Mặt hàng đã được bỏ qua trước đó.</span><Button tone="primary" onClick={() => void runAction(() => restoreMatching(requestAdmin, current.id), 'Đã khôi phục vào hàng đợi.')} disabled={busy}>Khôi phục</Button></div> : <><div><Button tone="ghost" onClick={() => setDialog('skip')} disabled={!canApprove || busy}>Bỏ qua <Kbd>S</Kbd></Button>{canCreate && <Button tone="cool" onClick={openCreate} disabled={!canApprove || busy}>Tạo sản phẩm mới <Kbd>N</Kbd></Button>}</div><div><span>{groupLoading && groupOn ? 'Đang tải thành viên nhóm' : activeCandidate ? 'Sẵn sàng duyệt' : 'Chọn một ứng viên'}</span><Button tone="primary" onClick={approve} disabled={!canApprove || !activeCandidate || busy || (groupLoading && groupOn)}>Duyệt{groupOn && !groupLoading && groupItems.length > 1 ? ` ${groupItems.length} mặt hàng` : ''} <Kbd>↵</Kbd></Button></div></>}</div>
      </Card>}
    </div>
    <div className="matching-shortcuts"><span><Kbd>↑</Kbd> <Kbd>↓</Kbd> chọn mặt hàng</span><span><Kbd>1</Kbd>–<Kbd>5</Kbd> chọn gợi ý</span><span><Kbd>Enter</Kbd> duyệt</span><span><Kbd>N</Kbd> tạo mới</span><span><Kbd>S</Kbd> bỏ qua</span></div>

    <Modal open={dialog === 'create'} onClose={() => setDialog(null)} title="Tạo sản phẩm mới" actions={<><Button tone="ghost" onClick={() => setDialog(null)}>Huỷ</Button><Button tone="primary" disabled={busy || !productName.trim() || !productBrand.trim() || !productSlug.trim() || (imageChoice === 'files' && !selectedFile)} onClick={create}>Tạo và gắn</Button></>}>
      <div className="matching-form"><Field label="Tên sản phẩm chuẩn" value={productName} onChange={event => setProductName(event.target.value)} /><div className="matching-form-row"><Field label="Hãng" value={productBrand} onChange={event => setProductBrand(event.target.value)} /><Field label="Slug" value={productSlug} onChange={event => setProductSlug(event.target.value)} /></div><p className="matching-category-note">Danh mục: Laptop</p>
        <fieldset className="matching-image-choices"><legend>Ảnh sản phẩm chuẩn</legend><label><input type="radio" name="matching-image" checked={imageChoice === 'files'} onChange={() => setImageChoice('files')} /><span><b>Chọn từ Files</b><small>Khuyến nghị ảnh vuông 1000 × 1000 px trở lên.</small>{imageChoice === 'files' && <span className="matching-file-choice"><Button size="sm" onClick={() => void openFiles()}>Chọn ảnh từ Files…</Button>{selectedFile ? selectedFile.originalFileName : 'Chưa chọn ảnh'}</span>}</span></label><label><input type="radio" name="matching-image" checked={imageChoice === 'shop'} onChange={() => setImageChoice('shop')} /><span><b>Dùng tạm ảnh của shop</b><small>Ảnh nguồn có thể chưa đạt chuẩn.</small>{imageChoice === 'shop' && <Pill tone="warn">Cần ảnh chuẩn</Pill>}</span></label><label><input type="radio" name="matching-image" checked={imageChoice === 'none'} onChange={() => setImageChoice('none')} /><span><b>Chưa có ảnh</b><small>Ảnh sẽ được bổ sung sau.</small>{imageChoice === 'none' && <Pill tone="warn">Cần ảnh chuẩn</Pill>}</span></label></fieldset>
        {current?.groupKey && !groupLoading && !groupError && groupItems.length > 1 && <label className="matching-apply-group"><Switch checked={groupOn} onChange={setGroupOn} label="Áp dụng cho cả nhóm" /><span>Gắn {groupOn ? groupItems.length : 1} mặt hàng vào sản phẩm mới</span></label>}
        <div className="matching-prefill"><b>Thông số điền sẵn</b><div className="matching-attributes">{attrsOrder.filter(key => sourceAttrs[key]).map(key => <span className="matching-attribute" key={key}><small>{key}</small><b>{sourceAttrs[key]}</b></span>)}</div></div>
      </div>{actionError && <div className="matching-action-error" role="alert">{actionError}</div>}
    </Modal>
    <Modal open={dialog === 'skip'} onClose={() => setDialog(null)} title="Bỏ qua mặt hàng" actions={<><Button tone="ghost" onClick={() => setDialog(null)}>Huỷ</Button><Button tone="danger" disabled={busy || !canApprove} onClick={skip}>Bỏ qua và lưu lý do</Button></>}><div className="matching-form"><label className="matching-select-field"><span>Lý do</span><select value={skipReason} onChange={event => setSkipReason(event.target.value)}>{reasons.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="matching-textarea-field"><span>Ghi chú (tuỳ chọn)</span><textarea rows={3} value={skipNote} onChange={event => setSkipNote(event.target.value)} /></label><p>Mặt hàng rời hàng đợi. Bạn có thể xem danh sách đã bỏ qua và khôi phục sau.</p>{actionError && <div className="matching-action-error" role="alert">{actionError}</div>}</div></Modal>
    <Modal open={dialog === 'files'} onClose={() => setDialog('create')} title="Chọn ảnh từ Files" actions={<Button tone="primary" disabled={!selectedFile} onClick={() => setDialog('create')}>Dùng ảnh này</Button>}><div className="matching-file-grid">{filesError ? <ErrorState title="Không tải được Files">{filesError}</ErrorState> : files.length ? files.map(file => <button type="button" key={file.id} aria-pressed={selectedFile?.id === file.id} onClick={() => setSelectedFile(file)}><img src={publicFileUrl(file.id)} alt="" /><span>{file.originalFileName}</span>{file.width && file.height ? <small>{file.width} × {file.height}</small> : null}</button>) : <EmptyState title="Chưa có ảnh trong Files">Tải ảnh lên Files trước khi tạo sản phẩm.</EmptyState>}</div></Modal>
    <Lightbox open={lightbox} onClose={() => setLightbox(false)}>{current?.source.imageUrl && <img src={current.source.imageUrl} alt={current.name} />}</Lightbox>
    {toast && <Toast onClose={() => setToast('')}>{toast}</Toast>}
  </main>;
}
