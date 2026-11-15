import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAdminFile, getAdminFiles, publicFileUrl, uploadAdminFiles, type AdminFile } from '../files/files-api';
import { Button, Card, ErrorState, Loading, Modal, PageHeader, Pill } from '../ui';
import type { AdminRequest } from './products-api';
import { getProductImages, retryProductImageDerivatives, saveProductImages, type ProductImage, type ProductImageInput } from './product-images-api';
import './product-images.css';

type DraftImage = ProductImage & { key: string };
const sourceUrl = (image: ProductImage) => image.sourceUrl || image.originalUrl || image.url || image.externalUrl || (image.fileId ? publicFileUrl(image.fileId) : '');
const preview600 = (image: ProductImage) => image.url600 || image.card600Url || (image.card600FileId ? publicFileUrl(image.card600FileId) : '') || sourceUrl(image);
const preview1000 = (image: ProductImage) => image.url1000 || image.detail1000Url || (image.detail1000FileId ? publicFileUrl(image.detail1000FileId) : '') || sourceUrl(image);
const available = (value?: string | null, id?: string | null) => Boolean(id || value?.toLowerCase() === 'ready');
const has600 = (image: ProductImage) => available(image.card600Status || image.derivative600Status, image.card600FileId) || Boolean(image.url600 && image.url600 !== sourceUrl(image));
const has1000 = (image: ProductImage) => available(image.detail1000Status || image.derivative1000Status, image.detail1000FileId) || Boolean(image.url1000 && image.url1000 !== sourceUrl(image));
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : 'Đã xảy ra lỗi. Vui lòng thử lại.';
const supportedImageType = (contentType: string) => ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType.toLowerCase());
const supportedImage = (file: AdminFile) => supportedImageType(file.contentType);

export function AdminCompareShopProductImages({ requestAdmin, permissions = [] }: { requestAdmin: AdminRequest; permissions?: string[] }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const canUpdate = permissions.includes('products.update');
  const [productName, setProductName] = useState('Sản phẩm');
  const [saved, setSaved] = useState<DraftImage[]>([]);
  const [draft, setDraft] = useState<DraftImage[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [files, setFiles] = useState<AdminFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [fileQuery, setFileQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [createDerivatives, setCreateDerivatives] = useState(true);
  const [unpreviewableFiles, setUnpreviewableFiles] = useState<Set<string>>(new Set());
  const [uploadError, setUploadError] = useState('');
  const [busyDerivative, setBusyDerivative] = useState('');
  const [derivativeErrors, setDerivativeErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');
  const dragIndex = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = useMemo(() => JSON.stringify(draft.map(toInput)) !== JSON.stringify(saved.map(toInput)), [draft, saved]);
  const selectedIndex = draft.findIndex(image => image.key === selectedKey);
  const selected = selectedIndex >= 0 ? draft[selectedIndex] : null;

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const result = await getProductImages(requestAdmin, id, signal);
      if (signal?.aborted) return;
      const images = (result.images ?? result.items ?? []).map((image, index) => ({ ...image, originalUrl: image.sourceUrl || image.originalUrl, card600Status: image.derivative600Status || image.card600Status, detail1000Status: image.derivative1000Status || image.detail1000Status, key: image.id || image.fileId || image.externalUrl || `image-${index}`, sortOrder: index }));
      let name = result.productName || result.productSlug || '';
      if (!name) {
        try { const productResponse = await requestAdmin(`/admin/products/${encodeURIComponent(id)}`, { signal }); if (productResponse.ok) { const product = await productResponse.json() as { name?: string; slug?: string }; name = product.name || product.slug || ''; } }
        catch { /* Product identity is optional; the image editor remains usable by ID. */ }
      }
      if (signal?.aborted) return;
      setProductName(name || `Sản phẩm #${id}`);
      setSaved(images); setDraft(images); setSelectedKey(images[0]?.key ?? '');
      void Promise.all(images.filter(image => image.fileId && !image.originalFileName).map(async image => {
        try { const metadata = await getAdminFile(requestAdmin, image.fileId!); if (!signal?.aborted) setDraft(current => current.map(item => item.key === image.key ? { ...item, originalFileName: metadata.originalFileName, width: metadata.width, height: metadata.height } : item)); }
        catch { /* The API source availability status remains authoritative when Files metadata cannot be loaded. */ }
      }));
    } catch (reason) { if (!signal?.aborted) setError(errorText(reason)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [requestAdmin, id]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2800); return () => window.clearTimeout(timer); }, [toast]);

  function toInput(image: DraftImage): ProductImageInput {
    return { ...(image.id ? { id: image.id } : {}), ...(image.fileId ? { fileId: image.fileId } : {}), ...(image.externalUrl ? { externalUrl: image.externalUrl } : {}), altText: image.altText ?? '', sortOrder: draft.indexOf(image) };
  }
  const updateSelected = (patch: Partial<DraftImage>) => setDraft(current => current.map(image => image.key === selectedKey ? { ...image, ...patch } : image));
  const move = (from: number, to: number) => setDraft(current => { if (to < 0 || to >= current.length || from === to) return current; const next = [...current]; const [image] = next.splice(from, 1); next.splice(to, 0, image); return next; });
  function undo() { setDraft(saved); setSelectedKey(saved[0]?.key ?? ''); setSaveError(''); }
  async function save() {
    if (!canUpdate || saving) return;
    setSaving(true); setSaveError('');
    try { await saveProductImages(requestAdmin, id, draft.map((image, index) => ({ ...toInput(image), sortOrder: index })), createDerivatives); await load(); setToast('Đã lưu thư viện ảnh.'); }
    catch (reason) { setSaveError(errorText(reason)); }
    finally { setSaving(false); }
  }
  async function openPicker() {
    setPickerOpen(true); setFilesLoading(true); setFilesError(''); setPicked(new Set()); setCreateDerivatives(true);
    try { const result = await getAdminFiles(requestAdmin, 1, 100, '', 'image'); setFiles(result.items.filter(supportedImage)); setUnpreviewableFiles(new Set()); }
    catch (reason) { setFilesError(errorText(reason)); }
    finally { setFilesLoading(false); }
  }
  function addFiles(chosen: AdminFile[]) {
    const additions = chosen.filter(file => !draft.some(image => image.fileId === file.id)).slice(0, Math.max(0, 20 - draft.length)).map(file => ({ key: `file-${file.id}`, fileId: file.id, originalFileName: file.originalFileName, width: file.width, height: file.height, altText: '', sortOrder: 0 } as DraftImage));
    if (!additions.length) return;
    setDraft(current => [...current, ...additions]); setSelectedKey(additions[0].key); setPickerOpen(false); setToast(`Đã thêm ${additions.length} ảnh vào bản nháp.`);
    setToast(`Đã thêm ${additions.length} ảnh; API sẽ tự tạo bản 600 × 600 và 1000 × 1000 khi lưu.`);
    if (chosen.filter(file => !draft.some(image => image.fileId === file.id)).length > additions.length) setToast(`Đã thêm ${additions.length} ảnh; giới hạn mỗi sản phẩm là 20 ảnh.`);
  }
  async function uploadSelected(filesToUpload: FileList | null) {
    if (!filesToUpload?.length) return;
    const images = Array.from(filesToUpload).filter(file => supportedImageType(file.type));
    setUploadError(images.length !== filesToUpload.length ? 'Chỉ hỗ trợ JPG, PNG, WebP và GIF.' : '');
    const outcomes = await uploadAdminFiles(requestAdmin, images, () => undefined);
    const uploaded: AdminFile[] = [];
    const failures: string[] = [];
    for (const outcome of outcomes) {
      if (outcome.error) { failures.push(`${outcome.file.name}: ${outcome.error}`); continue; }
      try {
        const result = await requestAdmin(`/admin/files?page=1&pageSize=100&q=${encodeURIComponent(outcome.file.name)}&type=images`);
        if (!result.ok) throw new Error(`Không thể tìm tệp vừa tải (lỗi ${result.status}).`);
        const page = await result.json() as { items?: AdminFile[] };
        const file = page.items?.find(item => item.originalFileName === outcome.file.name);
        if (file) uploaded.push(file); else failures.push(`${outcome.file.name}: Không tìm thấy tệp vừa tải trong Files.`);
      } catch (reason) { failures.push(`${outcome.file.name}: ${errorText(reason)}`); }
    }
    if (uploaded.length) addFiles(uploaded);
    if (failures.length) setUploadError(failures.join(' '));
    if (fileInput.current) fileInput.current.value = '';
  }
  const filteredFiles = files.filter(file => file.originalFileName.toLocaleLowerCase().includes(fileQuery.toLocaleLowerCase()) && !draft.some(image => image.fileId === file.id));
  const missing600 = selected && !has600(selected);
  const missing1000 = selected && !has1000(selected);
  async function createMissingDerivatives() {
    if (!selected?.id || !canUpdate || busyDerivative || (!missing600 && !missing1000)) return;
    setBusyDerivative('creating'); setDerivativeErrors({});
    try {
      const refreshed = await retryProductImageDerivatives(requestAdmin, id, selected.id);
      setDraft(current => current.map(image => image.key === selected.key ? { ...image, ...refreshed, key: image.key, card600Status: refreshed.derivative600Status, detail1000Status: refreshed.derivative1000Status } : image));
      setToast('Đã thử tạo lại các bản ảnh.');
    } catch (reason) { setDerivativeErrors({ request: errorText(reason) }); }
    finally { setBusyDerivative(''); }
  }

  return <main className="product-images-page">
    <PageHeader eyebrow="PRODUCTS · THƯ VIỆN ẢNH" title="Quản lý hình ảnh" description={`${productName} · Sắp xếp ảnh, chọn ảnh chính và xem trạng thái bản kích thước.`} actions={<div className="product-images-header-actions"><Button onClick={() => navigate('/products')}>← Products</Button>{canUpdate && <Button onClick={() => void openPicker()}>＋ Thêm ảnh</Button>}</div>} />
    {!permissions.includes('products.read') ? <ErrorState title="Không có quyền xem sản phẩm">Bạn cần quyền products.read để mở thư viện ảnh.</ErrorState>
      : loading ? <Loading label="Đang tải thư viện ảnh" />
        : error ? <ErrorState title="Không thể tải thư viện ảnh">{error}<Button size="sm" onClick={() => void load()}>Thử lại</Button></ErrorState>
          : <>
            <div className="product-images-layout">
              <Card className="product-images-gallery"><div className="product-images-section-heading"><div><h2>Thư viện ảnh <Pill>{draft.length}/20</Pill></h2><p>Kéo thả để đổi thứ tự. Ảnh đầu tiên là ảnh chính.</p></div>{canUpdate && <Button size="sm" onClick={() => void openPicker()}>＋ Thêm ảnh</Button>}</div>
                {draft.length === 0 ? <div className="product-images-empty"><b>Chưa có ảnh nào</b><span>Chọn nhiều ảnh từ Files hoặc tải ảnh mới để bắt đầu.</span>{canUpdate && <Button onClick={() => void openPicker()}>Thêm ảnh</Button>}</div>
                  : <div className="product-images-grid" role="list" aria-label="Thư viện ảnh">{draft.map((image, index) => <button type="button" role="listitem" key={image.key} className={`product-image-tile${selectedKey === image.key ? ' is-selected' : ''}`} aria-label={`Ảnh ${index + 1}${index === 0 ? ', ảnh chính' : ''}: ${image.originalFileName || image.altText || 'ảnh sản phẩm'}`} aria-pressed={selectedKey === image.key} draggable onClick={() => setSelectedKey(image.key)} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); move(index, index - 1); } if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); move(index, index + 1); } }} onDragStart={() => { dragIndex.current = index; }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (dragIndex.current !== null) move(dragIndex.current, index); dragIndex.current = null; }}><span className="product-image-number">{index + 1}</span>{index === 0 && <span className="product-image-main-badge">★ Ảnh chính</span>}<span className="product-image-thumb">{sourceUrl(image) ? <img src={sourceUrl(image)} alt="" /> : '▧'}</span><b>{image.originalFileName || image.altText || `Ảnh ${index + 1}`}</b><span className="product-image-variants"><Pill tone={available(image.card600Status, image.card600FileId) ? 'ok' : 'warn'}>600 {has600(image) ? '✓' : 'thiếu'}</Pill><Pill tone={available(image.detail1000Status, image.detail1000FileId) ? 'ok' : 'warn'}>1000 {has1000(image) ? '✓' : 'thiếu'}</Pill></span></button>)}{canUpdate && draft.length < 20 && <button type="button" className="product-image-tile product-image-add" onClick={() => void openPicker()}><strong>＋</strong><span>Thêm ảnh</span></button>}</div>}
              </Card>
              <Card className="product-images-details"><div className="product-images-section-heading"><div><h2>Chi tiết ảnh</h2><p>{selected ? `Ảnh ${selectedIndex + 1}${selectedIndex === 0 ? ' · Ảnh chính' : ''}` : 'Chọn một ảnh trong thư viện'}</p></div></div>
                {!selected ? <div className="product-images-empty">Chọn ảnh để xem chi tiết.</div> : <div className="product-image-detail">
                  <div className="product-image-detail-preview">{sourceUrl(selected) ? <img src={sourceUrl(selected)} alt={selected.altText || selected.originalFileName || ''} /> : <span>Ảnh không khả dụng</span>}</div>
                  <div className="product-image-file-info"><b>{selected.originalFileName || 'Ảnh sản phẩm'}</b><span>{selected.width && selected.height ? `${selected.width} × ${selected.height} px` : 'Kích thước gốc chưa có'}</span>{selected.sourceAvailable === false && <Pill tone="bad">Ảnh gốc không khả dụng</Pill>}</div>
                  <label className="product-image-alt">Mô tả ảnh (alt)<textarea value={selected.altText ?? ''} disabled={!canUpdate} placeholder="Ví dụ: Mặt trước sản phẩm" onChange={event => updateSelected({ altText: event.target.value })} /><small>Dùng cho SEO và người dùng đọc màn hình.</small></label>
                  <section className="product-image-derivatives" aria-label="Bản theo kích thước"><h3>Bản theo kích thước</h3>{(['600', '1000'] as const).map(size => { const is600 = size === '600'; const present = is600 ? has600(selected) : has1000(selected); const status = is600 ? selected.card600Status || selected.derivative600Status : selected.detail1000Status || selected.derivative1000Status; const unavailable = status === 'unavailable'; const derivativeError = derivativeErrors[`${selected.key}:${size}`] || derivativeErrors[size]; return <div className="product-image-derivative" key={size}><span><b>{size} × {size} · {is600 ? 'Trang chủ, danh sách' : 'Trang chi tiết'}</b><small>{present ? 'Đã có bản riêng' : derivativeError || (unavailable ? 'Chưa khả dụng · website đang dùng ảnh gốc' : status === 'failed' ? 'Tạo bản thất bại · có thể thử lại' : 'Chưa có bản · website dùng ảnh gốc')}</small></span>{present ? <Pill tone="ok">Có ✓</Pill> : <Button size="sm" disabled={!canUpdate || !selected.id || Boolean(busyDerivative)} onClick={() => void createMissingDerivatives()}>{busyDerivative ? 'Đang tạo…' : derivativeError || status === 'failed' || unavailable ? 'Thử lại' : 'Tạo'}</Button>}</div>; })}{derivativeErrors.request && <p className="product-images-upload-error" role="alert">{derivativeErrors.request}</p>}</section>
                  {selected.width && selected.height && (selected.width < 1000 || selected.height < 1000) && <p className="product-image-warning" role="status">Ảnh gốc {selected.width} × {selected.height} px nhỏ hơn 1000 × 1000; bản chi tiết có thể bị mờ.</p>}
                  {selected.width && selected.height && Math.abs(selected.width / selected.height - 1) > 0.6 && <p className="product-image-warning" role="status">Ảnh khác tỉ lệ vuông nhiều; cắt giữa có thể làm mất nội dung.</p>}
                  <div className="product-image-actions"><Button size="sm" disabled={!canUpdate || selectedIndex === 0} onClick={() => move(selectedIndex, 0)}>★ Đặt làm ảnh chính</Button><Button size="sm" disabled={!canUpdate || selectedIndex === 0} onClick={() => move(selectedIndex, selectedIndex - 1)}>↑ Lên trước</Button><Button size="sm" disabled={!canUpdate || selectedIndex === draft.length - 1} onClick={() => move(selectedIndex, selectedIndex + 1)}>↓ Xuống sau</Button><Button size="sm" tone="danger" disabled={!canUpdate} onClick={() => { const next = draft.filter(image => image.key !== selected.key); setDraft(next); setSelectedKey(next[Math.min(selectedIndex, next.length - 1)]?.key ?? ''); }}>Gỡ khỏi sản phẩm</Button></div>
                </div>}
              </Card>
              <Card className="product-images-preview"><div className="product-images-section-heading"><div><h2>Xem trước trên website</h2><p>Đang xem theo bản nháp chưa lưu.</p></div></div><div className="product-image-previews"><section className="product-image-preview-card"><h3>Thẻ trang chủ / danh sách</h3><div className="product-image-preview-square">{draft[0] ? <img src={preview600(draft[0])} alt={draft[0].altText || ''} /> : <span>Chưa có ảnh</span>}</div><small>600 × 600 · {draft[0] && has600(draft[0]) ? 'Dùng bản 600 × 600' : 'Dự phòng ảnh gốc'}</small></section><section className="product-image-preview-detail"><h3>Trang chi tiết sản phẩm</h3><div className="product-image-preview-main">{draft[0] ? <img src={preview1000(draft[0])} alt={draft[0].altText || ''} /> : <span>Chưa có hình ảnh</span>}</div><div className="product-image-preview-thumbs">{draft.map((image, index) => <button type="button" key={image.key} aria-label={`Xem trước ảnh ${index + 1}`} className={index === 0 ? 'is-current' : ''} onClick={() => setSelectedKey(image.key)}><img src={sourceUrl(image)} alt="" /></button>)}</div><small>1000 × 1000 · {draft[0] && has1000(draft[0]) ? 'Dùng bản 1000 × 1000' : 'Dự phòng ảnh gốc'}</small></section></div></Card>
            </div>
            <div className="product-images-savebar"><span>{dirty ? <><Pill tone="warn">Chưa lưu</Pill> Thay đổi chưa được áp dụng lên website.</> : <><Pill tone="ok">Đã lưu</Pill> Khớp với website.</>}{saveError && <span className="product-images-save-error" role="alert">{saveError}</span>}</span><div><Button disabled={!dirty || saving} onClick={undo}>Hoàn tác</Button><Button tone="primary" disabled={!dirty || saving || !canUpdate} onClick={() => void save()}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</Button></div></div>
          </>}
    {toast && <div role="status" className="product-images-toast">{toast}</div>}
    <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Thêm ảnh cho sản phẩm" actions={<><Button onClick={() => setPickerOpen(false)}>Huỷ</Button><Button tone="primary" disabled={!picked.size} onClick={() => addFiles(files.filter(file => picked.has(file.id)))}>Thêm {picked.size || ''} ảnh</Button></>}>
      <div className="product-images-picker"><div className="product-images-picker-tabs"><button type="button" className="is-active">Chọn từ Files</button><button type="button" onClick={() => fileInput.current?.click()}>Tải ảnh mới</button></div><p>Chọn nhiều ảnh từ Files hoặc tải ảnh mới lên; tệp mới sẽ được lưu vào Files trước khi gắn vào sản phẩm.</p><input aria-label="Tìm trong Files" value={fileQuery} onChange={event => setFileQuery(event.target.value)} placeholder="Tìm tên ảnh…" />
        <label className="product-images-auto"><input type="checkbox" checked={createDerivatives} onChange={event => setCreateDerivatives(event.target.checked)} />Tự tạo bản 600 × 600 và 1000 × 1000 <small>{createDerivatives ? 'Tạo bản theo kích thước khi lưu thư viện ảnh.' : 'Chỉ liên kết ảnh gốc; bạn có thể tạo bản sau trong chi tiết ảnh.'}</small></label>
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={event => void uploadSelected(event.target.files)} />{uploadError && <p className="product-images-upload-error" role="alert">{uploadError}</p>}{filesError && <p className="product-images-upload-error" role="alert">{filesError}</p>}
        {filesLoading ? <Loading label="Đang tải Files" /> : filesError ? <Button size="sm" onClick={() => void openPicker()}>Thử tải lại</Button> : filteredFiles.length ? <div className="product-images-file-grid">{filteredFiles.map(file => <button type="button" key={file.id} aria-pressed={picked.has(file.id)} onClick={() => setPicked(current => { const next = new Set(current); next.has(file.id) ? next.delete(file.id) : next.add(file.id); return next; })}>{unpreviewableFiles.has(file.id) ? <span className="product-images-file-placeholder" aria-label="Không xem trước được">▧<small>Không xem trước</small></span> : <img src={publicFileUrl(file.id)} alt="" onError={() => setUnpreviewableFiles(current => new Set(current).add(file.id))} />}<b>{file.originalFileName}</b><small>{file.width && file.height ? `${file.width} × ${file.height}` : file.contentType}</small><span>{picked.has(file.id) ? '✓ Đã chọn' : 'Chọn'}</span></button>)}</div> : <div className="product-images-empty">Không có ảnh phù hợp trong Files.</div>}
      </div>
    </Modal>
  </main>;
}
