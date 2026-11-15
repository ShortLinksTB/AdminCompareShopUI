import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { Button, ErrorState, Field, Modal, Select } from '../ui';
import type { AdminRequest } from '../products/products-api';
import { createFileDerivatives, publicFileUrl, type AdminFile, type DerivativeVariantRequest, type DerivativeVariantResult } from './files-api';

type Size = { width: number; height: number; preset: NonNullable<AdminFile['derivedPreset']> };
type PreviewState = { fit: number; scale: number; x: number; y: number; tool: 'crop' | 'move' };
type Props = { file: AdminFile; requestAdmin: AdminRequest; existingFiles: AdminFile[]; onClose: () => void; onCreated: () => void };
const MIN_ZOOM = 0.56;
const MAX_ZOOM = 4;
const basename = (name: string) => name.replace(/\.[^.]+$/, '');
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const presetLabel = (preset: Size['preset']) => preset === 'home-600x600' ? 'Trang chủ' : preset === 'product-detail-1000x1000' ? 'Chi tiết sản phẩm' : 'Tuỳ chọn';
const extensionFor = (format: DerivativeVariantRequest['format'], mime: string) => format === 'keep' ? (mime === 'image/gif' ? 'png' : mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png') : format;
const errorText: Record<string, string> = {
  unsupported_source_type: 'Định dạng file nguồn không được hỗ trợ.', invalid_dimensions: 'Kích thước phải từ 16 đến 4000 px.',
  source_pixel_limit_exceeded: 'Ảnh nguồn vượt giới hạn xử lý.', invalid_variant: 'Thông số biến thể không hợp lệ.',
  decode_failed: 'Không đọc được ảnh nguồn.', encode_failed: 'Không thể tạo ảnh theo định dạng này.', output_too_large: 'File kết quả vượt giới hạn 10 MB.',
  name_suffix_exhausted: 'Không thể tìm tên file trống. Hãy đổi tên gốc.', storage_failed: 'Không thể lưu file mới.', metadata_persist_failed: 'Không thể lưu thông tin file mới.',
};

function getSizes(home: boolean, detail: boolean, custom: boolean, width: string, height: string): Size[] {
  const sizes: Size[] = [];
  if (home) sizes.push({ width: 600, height: 600, preset: 'home-600x600' });
  if (detail) sizes.push({ width: 1000, height: 1000, preset: 'product-detail-1000x1000' });
  if (custom && Number.isInteger(Number(width)) && Number.isInteger(Number(height)) && Number(width) >= 16 && Number(width) <= 4000 && Number(height) >= 16 && Number(height) <= 4000) sizes.push({ width: Number(width), height: Number(height), preset: 'custom' });
  return sizes;
}

function cropRect(iw: number, ih: number, width: number, height: number, focal: { x: number; y: number }) {
  const ratio = width / height;
  let w = iw, h = ih;
  if (iw / ih > ratio) w = ih * ratio; else h = iw / ratio;
  const left = clamp(focal.x * iw - w / 2, 0, iw - w);
  const top = clamp(focal.y * ih - h / 2, 0, ih - h);
  return { left, top, width: w, height: h };
}

function clampViewportOffset(offset: number, contentSize: number, stageSize: number) {
  if (contentSize <= stageSize) return 0;
  return clamp(offset, (stageSize - contentSize) / 2, (contentSize - stageSize) / 2);
}

function fitScaleFor(size: Size, stage: DOMRect) {
  return Math.min((stage.width - 24) / size.width, (stage.height - 24) / size.height, 1);
}

function DerivativePreview({ image, size, fit, background, focal, onFocalChange }: {
  image: HTMLImageElement | null; size: Size | undefined; fit: 'cover' | 'contain'; background: string;
  focal: { x: number; y: number }; onFocalChange: (value: { x: number; y: number }) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; startX: number; startY: number; startFocal: { x: number; y: number }; mode: 'crop' | 'move' } | null>(null);
  const [view, setView] = useState<PreviewState>({ fit: 1, scale: 1, x: 0, y: 0, tool: 'crop' });
  const viewRef = useRef(view); viewRef.current = view;
  const focalRef = useRef(focal); focalRef.current = focal;

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || !size || !image?.naturalWidth || !image.naturalHeight) return;
    const cap = Math.min(1, 1600 / Math.max(size.width, size.height));
    canvas.width = Math.max(1, Math.round(size.width * cap)); canvas.height = Math.max(1, Math.round(size.height * cap));
    const context = canvas.getContext('2d'); if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (fit === 'contain' && background !== 'transparent') { context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.imageSmoothingQuality = 'high';
    if (fit === 'cover') {
      const rect = cropRect(image.naturalWidth, image.naturalHeight, size.width, size.height, focalRef.current);
      context.drawImage(image, rect.left, rect.top, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
    } else {
      const ratio = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const w = image.naturalWidth * ratio, h = image.naturalHeight * ratio;
      context.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    }
    const rect = stage.getBoundingClientRect();
    setView(current => {
      const fitScale = Math.min((rect.width - 24) / size.width, (rect.height - 24) / size.height, 1);
      if (!Number.isFinite(fitScale) || fitScale <= 0) return current;
      if (current.fit === 1 && current.scale === 1 && current.x === 0 && current.y === 0) return { ...current, fit: fitScale, scale: fitScale, x: 0, y: 0 };
      return current;
    });
  }, [image, size?.width, size?.height, fit, background]);

  useEffect(() => { paint(); }, [paint, focal.x, focal.y]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !size) return;
    const nextFit = fitScaleFor(size, stage.getBoundingClientRect());
    if (!Number.isFinite(nextFit) || nextFit <= 0) return;
    setView(current => ({ ...current, fit: nextFit, scale: nextFit, x: 0, y: 0, tool: 'crop' }));
  }, [size?.width, size?.height]);
  useEffect(() => {
    const stage = stageRef.current; if (!stage || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!size) return;
      const rect = stage.getBoundingClientRect();
      const nextFit = fitScaleFor(size, rect);
      setView(current => {
        const wasFit = current.scale <= current.fit + 0.001;
        const nextScale = wasFit ? nextFit : Math.max(current.scale, nextFit);
        const x = wasFit ? 0 : clampViewportOffset(current.x, size.width * nextScale, rect.width);
        const y = wasFit ? 0 : clampViewportOffset(current.y, size.height * nextScale, rect.height);
        return { ...current, fit: nextFit, scale: nextScale, x, y };
      });
    });
    observer.observe(stage); return () => observer.disconnect();
  }, [size?.width, size?.height]);

  useEffect(() => {
    const stage = stageRef.current; if (!stage) return;
    const keydown = (event: KeyboardEvent) => {
      if (!(event.target instanceof HTMLElement) || !stage.contains(event.target)) return;
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1.25); }
      else if (event.key === '-') { event.preventDefault(); zoomBy(1 / 1.25); }
      else if (event.key === '0') { event.preventDefault(); fitView(); }
    };
    stage.addEventListener('keydown', keydown); return () => stage.removeEventListener('keydown', keydown);
  });

  function fitView() {
    setView(current => ({ ...current, scale: current.fit, x: 0, y: 0, tool: 'crop' }));
  }
  function zoomAt(scale: number, clientX: number, clientY: number) {
    const stage = stageRef.current; if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    setView(current => {
      const next = clamp(scale, Math.max(current.fit, MIN_ZOOM), MAX_ZOOM);
      const cx = clientX - bounds.left - bounds.width / 2, cy = clientY - bounds.top - bounds.height / 2;
      const ratio = next / current.scale;
      const x = cx - (cx - current.x) * ratio, y = cy - (cy - current.y) * ratio;
      return { ...current, scale: next, x: clampViewportOffset(x, (size?.width ?? 0) * next, bounds.width), y: clampViewportOffset(y, (size?.height ?? 0) * next, bounds.height) };
    });
  }
  function zoomBy(multiplier: number) {
    const rect = stageRef.current?.getBoundingClientRect(); if (rect) zoomAt(viewRef.current.scale * multiplier, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
  function onWheel(event: WheelEvent<HTMLDivElement>) { event.preventDefault(); zoomAt(viewRef.current.scale * Math.exp(-event.deltaY * 0.0016), event.clientX, event.clientY); }
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const current = viewRef.current;
    const mode = current.tool === 'crop' && fit === 'cover' ? 'crop' : current.tool === 'move' && current.scale > current.fit + 0.001 ? 'move' : null;
    if (!mode) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, startX: current.x, startY: current.y, startFocal: { ...focalRef.current }, mode };
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const currentDrag = drag.current; if (!currentDrag || currentDrag.pointer !== event.pointerId || !size || !image) return;
    const dx = event.clientX - currentDrag.x, dy = event.clientY - currentDrag.y;
    if (currentDrag.mode === 'move') {
      const bounds = stageRef.current?.getBoundingClientRect();
      setView(current => ({ ...current, x: bounds ? clampViewportOffset(currentDrag.startX + dx, size.width * current.scale, bounds.width) : current.x, y: bounds ? clampViewportOffset(currentDrag.startY + dy, size.height * current.scale, bounds.height) : current.y }));
      return;
    }
    const crop = cropRect(image.naturalWidth, image.naturalHeight, size.width, size.height, currentDrag.startFocal);
    const nextX = crop.width < image.naturalWidth ? currentDrag.startFocal.x - dx / (viewRef.current.scale * image.naturalWidth) : currentDrag.startFocal.x;
    const nextY = crop.height < image.naturalHeight ? currentDrag.startFocal.y - dy / (viewRef.current.scale * image.naturalHeight) : currentDrag.startFocal.y;
    onFocalChange({ x: clamp(nextX, 0, 1), y: clamp(nextY, 0, 1) });
  }
  const transform = `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px)) scale(${view.scale})`;
  const zoomPct = Math.round(view.scale * 100);
  const canCrop = fit === 'cover' && Boolean(size && image && (image.naturalWidth / image.naturalHeight !== size.width / size.height));
  return <section className="derivative-preview" aria-label="Xem trước từng biến thể">
    <div className="derivative-preview-tools">
      <div className="derivative-tools">
        <div className="derivative-tool-switch" role="group" aria-label="Công cụ kéo">
          <Button size="sm" aria-pressed={view.tool === 'crop'} disabled={!canCrop} onClick={() => setView(current => ({ ...current, tool: 'crop' }))}>✥ Vùng cắt</Button>
          <Button size="sm" aria-pressed={view.tool === 'move'} disabled={view.scale <= view.fit + 0.001} onClick={() => setView(current => ({ ...current, tool: 'move' }))}>✋ Di chuyển</Button>
        </div>
        <div className="derivative-zoom-tools"><Button size="sm" aria-label="Thu nhỏ" disabled={zoomPct <= Math.round(Math.max(view.fit, MIN_ZOOM) * 100)} onClick={() => zoomBy(1 / 1.25)}>−</Button><Button size="sm" aria-label="Phóng to" disabled={view.scale >= MAX_ZOOM - 0.001} onClick={() => zoomBy(1.25)}>＋</Button><Button size="sm" onClick={fitView}>Vừa khung</Button><Button size="sm" onClick={() => zoomBy(1 / view.scale)}>100%</Button></div>
      </div>
    </div>
    <div ref={stageRef} className={`derivative-stage ${view.tool === 'move' ? 'is-move' : 'is-crop'}`} tabIndex={0} aria-label="Xem trước. Cuộn để zoom tại con trỏ; kéo để chọn vùng cắt hoặc di chuyển khung nhìn" onWheel={onWheel} onDoubleClick={event => view.scale > view.fit + 0.001 ? fitView() : zoomAt(Math.max(1, view.fit * 2), event.clientX, event.clientY)} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <canvas ref={canvasRef} aria-label="Ảnh sau khi xử lý" style={{ width: size?.width, height: size?.height, transform }} />
      <span className="derivative-zoom-badge">{zoomPct}%</span><span className="derivative-zoom-hint">Cuộn để zoom tại con trỏ</span>
    </div>
    <div className="derivative-preview-meta"><span>{size ? `${size.width} × ${size.height} px · ${fit === 'cover' ? 'cắt khung' : 'giữ nguyên + nền'}` : 'Chọn kích thước để xem trước'}</span><span>{view.tool === 'crop' && canCrop ? 'Kéo ảnh để chọn vùng giữ lại' : view.scale > view.fit + 0.001 ? 'Kéo để di chuyển khung nhìn' : ''}</span></div>
  </section>;
}

export function DerivativeModal({ file, requestAdmin, existingFiles, onClose, onCreated }: Props) {
  const [home, setHome] = useState(true), [detail, setDetail] = useState(false), [custom, setCustom] = useState(false);
  const [width, setWidth] = useState('800'), [height, setHeight] = useState('600');
  const [fit, setFit] = useState<'cover' | 'contain'>('cover'), [background, setBackground] = useState('#ffffff');
  const [format, setFormat] = useState<DerivativeVariantRequest['format']>(file.contentType === 'image/png' ? 'keep' : 'webp');
  const [quality, setQuality] = useState<70 | 80 | 90>(90), [name, setName] = useState(basename(file.originalFileName));
  const [active, setActive] = useState(''), [focals, setFocals] = useState<Record<string, { x: number; y: number }>>({});
  const [image, setImage] = useState<HTMLImageElement | null>(null), [imageError, setImageError] = useState('');
  const [results, setResults] = useState<Record<string, { status: 'loading' | 'success' | 'error'; result?: DerivativeVariantResult; error?: string }>>({});
  const [globalError, setGlobalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const sizes = useMemo(() => getSizes(home, detail, custom, width, height), [home, detail, custom, width, height]);
  const currentSize = sizes.find(size => `${size.width}x${size.height}` === active) ?? sizes[0];
  const keys = sizes.map(size => `${size.width}x${size.height}`);
  const activeFocal = focals[`${currentSize?.width}x${currentSize?.height}`] ?? { x: 0.5, y: 0.5 };
  const collisions = useMemo(() => new Set(existingFiles.map(item => basename(item.originalFileName).toLocaleLowerCase())), [existingFiles]);
  const collisionByKey = (size: Size) => collisions.has(`${name.trim()}-${size.width}x${size.height}`.toLocaleLowerCase());
  const warnings = currentSize && image ? [
    (image.naturalWidth < currentSize.width || image.naturalHeight < currentSize.height) ? `Ảnh gốc ${image.naturalWidth}×${image.naturalHeight} nhỏ hơn ${currentSize.width}×${currentSize.height}: phải phóng to nên ảnh có thể mờ.` : '',
    fit === 'cover' && (image.naturalWidth / image.naturalHeight > 1.8 || image.naturalWidth / image.naturalHeight < 0.55) ? 'Ảnh rất dài hoặc rất cao; cắt khung có thể làm mất nhiều nội dung.' : '',
    ...sizes.filter(collisionByKey).map(size => `Tên ${name.trim()}-${size.width}x${size.height} đã tồn tại; máy chủ sẽ tự thêm hậu tố.`),
  ].filter(Boolean) : [];

  useEffect(() => {
    const source = new Image(); source.crossOrigin = 'anonymous'; source.onload = () => setImage(source); source.onerror = () => setImageError('Không tải được ảnh xem trước. Bạn vẫn có thể tạo bản sao từ máy chủ.'); source.src = publicFileUrl(file.id);
  }, [file.id]);
  useEffect(() => { if (!keys.includes(active)) setActive(keys[0] ?? ''); }, [keys.join(','), active]);
  function setFocal(value: { x: number; y: number }) { if (currentSize) setFocals(current => ({ ...current, [`${currentSize.width}x${currentSize.height}`]: value })); }
  function makeVariant(size: Size): DerivativeVariantRequest {
    const focal = focals[`${size.width}x${size.height}`] ?? { x: 0.5, y: 0.5 };
    const variant: DerivativeVariantRequest = { width: size.width, height: size.height, fit, background, format, quality, name: `${name.trim()}-${size.width}x${size.height}` };
    if (fit === 'cover') { variant.focalX = focal.x; variant.focalY = focal.y; }
    return variant;
  }
  async function create(selected: Size[]) {
    if (!selected.length || submitting) return;
    setGlobalError(''); setSubmitting(true);
    const started: Record<string, { status: 'loading' }> = {};
    selected.forEach(size => { started[`${size.width}x${size.height}`] = { status: 'loading' }; });
    setResults(current => ({ ...current, ...started }));
    try {
      const outcomes = await createFileDerivatives(requestAdmin, file.id, selected.map(makeVariant));
      let hasSuccess = false;
      outcomes.forEach((result, index) => {
        const size = selected[index]; if (!size) return;
        const key = `${size.width}x${size.height}`;
        const succeeded = result.success && Boolean(result.file?.id);
        if (succeeded) hasSuccess = true;
        setResults(current => ({ ...current, [key]: succeeded ? { status: 'success', result } : { status: 'error', result, error: errorText[result.errorCode ?? ''] || result.error || 'Không tạo được bản sao.' } }));
      });
      selected.slice(outcomes.length).forEach(size => setResults(current => ({ ...current, [`${size.width}x${size.height}`]: { status: 'error', error: 'Máy chủ không trả kết quả cho biến thể này.' } })));
      if (hasSuccess) { onCreated(); }
      if (outcomes.length === selected.length && outcomes.every(result => result.success)) onClose();
    } catch (reason) { setGlobalError(reason instanceof Error ? reason.message : 'Không tạo được các bản sao.'); selected.forEach(size => setResults(current => ({ ...current, [`${size.width}x${size.height}`]: { status: 'error', error: reason instanceof Error ? reason.message : 'Request failed.' } }))); }
    finally { setSubmitting(false); }
  }
  async function retry(size: Size) { await create([size]); }
  const failedSizes = sizes.filter(size => results[`${size.width}x${size.height}`]?.status === 'error');
  const pendingCount = Object.values(results).filter(result => result.status === 'loading').length;
  const outputExtension = extensionFor(format, file.contentType);
  const currentResult = currentSize ? results[`${currentSize.width}x${currentSize.height}`] : undefined;
  const currentOutput = currentResult?.result?.file;
  const successWarnings = [...(currentResult?.result?.warnings ?? []), ...(currentOutput?.warnings ?? [])];

  return <Modal open onClose={() => { if (!submitting) onClose(); }} title="Tạo bản sao theo kích thước" className="derivative-modal" actions={<><span className="derivative-modal-summary">Bản gốc giữ nguyên. {pendingCount ? `Đang xử lý ${pendingCount} bản…` : `${sizes.length} biến thể được chọn.`}</span><Button disabled={submitting} onClick={onClose}>Huỷ</Button><Button tone="primary" disabled={!sizes.length || submitting} onClick={() => void create(sizes)}>{submitting ? 'Đang xử lý…' : `Tạo ${sizes.length} bản sao`}</Button></>}>
    <div className="derivative-layout">
      <div className="derivative-settings">
        <h3>1. Kích thước</h3>
        <div className="derivative-presets">
          <label><input type="checkbox" checked={home} onChange={event => setHome(event.target.checked)} /><span><b>600 × 600 px · Trang chủ</b><small>Thẻ sản phẩm nổi bật và danh sách</small></span></label>
          <label><input type="checkbox" checked={detail} onChange={event => setDetail(event.target.checked)} /><span><b>1000 × 1000 px · Chi tiết sản phẩm</b><small>Ảnh lớn ở trang chi tiết sản phẩm</small></span></label>
          <label className="derivative-custom"><input type="checkbox" checked={custom} onChange={event => setCustom(event.target.checked)} /><span><b>Tuỳ chọn</b><span className="derivative-dimensions"><input aria-label="Rộng" type="number" min={16} max={4000} value={width} onChange={event => setWidth(event.target.value)} /> × <input aria-label="Cao" type="number" min={16} max={4000} value={height} onChange={event => setHeight(event.target.value)} /> px (16 đến 4000)</span></span></label>
        </div>
        {custom && !sizes.some(size => size.preset === 'custom') && <p className="derivative-invalid" role="alert">Kích thước tuỳ chọn phải là số nguyên từ 16 đến 4000 px.</p>}

        <h3>2. Cách xử lý ảnh không vuông</h3>
        <div className="derivative-segment" role="group" aria-label="Cách xử lý ảnh"><Button aria-pressed={fit === 'cover'} onClick={() => setFit('cover')}>Cắt khung (lấp đầy)</Button><Button aria-pressed={fit === 'contain'} onClick={() => setFit('contain')}>Giữ nguyên ảnh + nền</Button></div>
        {fit === 'contain' && <div className="derivative-background" role="group" aria-label="Nền"><span>Nền:</span>{[['#ffffff','Nền trắng'],['#000000','Nền đen'],['transparent','Nền trong suốt'],['#ff5a00','Nền cam']].map(([color,label]) => <button key={color} type="button" aria-label={label} aria-pressed={background === color} style={{ background: color === 'transparent' ? 'repeating-conic-gradient(#999 0 25%,#fff 0 50%) 50%/10px 10px' : color }} onClick={() => setBackground(color)} />)}</div>}
        <p className="derivative-help">{fit === 'cover' ? 'Ảnh lấp đầy khung; kéo trong xem trước để chọn vùng giữ lại.' : 'Toàn bộ ảnh giữ đúng tỉ lệ; phần trống dùng nền đã chọn.'}</p>

        <h3>3. Định dạng và tên</h3>
        <div className="derivative-fields"><label>Định dạng<Select aria-label="Định dạng" value={format} onChange={event => setFormat(event.target.value as DerivativeVariantRequest['format'])}><option value="keep">Giữ nguyên</option><option value="webp">WebP</option><option value="jpg">JPG</option><option value="png">PNG</option></Select></label><label>Chất lượng<Select aria-label="Chất lượng" value={quality} onChange={event => setQuality(Number(event.target.value) as 70 | 80 | 90)}><option value="90">90 (đề xuất)</option><option value="80">80</option><option value="70">70</option></Select></label></div>
        <Field label="Tên gốc" value={name} onChange={event => setName(event.target.value)} />
        <p className="derivative-help">Tên file mới: <code>tên-gốc-RộngxCao.{outputExtension}</code>. Có thể sửa tên gốc.</p>
        <div className="derivative-name-list" aria-live="polite">{sizes.length ? sizes.map(size => { const key = `${size.width}x${size.height}`, state = results[key]; return <div key={key}><code>{name.trim()}-{key}.{outputExtension}</code><span>{state?.status === 'success' ? 'Đã tạo' : state?.status === 'loading' ? 'Đang xử lý…' : state?.status === 'error' ? 'Lỗi' : collisionByKey(size) ? 'Tên trùng, tự thêm hậu tố' : `${presetLabel(size.preset)} · ${key}`}</span></div>; }) : <span>Chưa chọn kích thước hợp lệ.</span>}</div>
        {warnings.map(warning => <div className="derivative-warning" key={warning} role="status">{warning}</div>)}
        {globalError && <ErrorState title={globalError} />}
        {failedSizes.map(size => { const key = `${size.width}x${size.height}`, result = results[key]; return <div className="derivative-result-error" key={key} role="alert"><span>{key}: {result.error}</span><Button size="sm" disabled={submitting} onClick={() => void retry(size)}>Thử lại</Button></div>; })}
      </div>
      <div className="derivative-output-preview">
        <h3>Xem trước</h3>
        <div className="derivative-variant-tabs" role="group" aria-label="Chọn kích thước xem trước">{sizes.map(size => { const key = `${size.width}x${size.height}`; return <Button key={key} size="sm" aria-pressed={key === (currentSize ? `${currentSize.width}x${currentSize.height}` : '')} onClick={() => setActive(key)}>{key}</Button>; })}</div>
        {imageError && <div className="derivative-warning" role="status">{imageError}</div>}
        <DerivativePreview key={currentSize ? `${currentSize.width}x${currentSize.height}` : 'empty'} image={image} size={currentSize} fit={fit} background={background} focal={activeFocal} onFocalChange={setFocal} />
        {currentResult?.status === 'success' && currentOutput?.id && <div className="derivative-result-success" role="status">Đã tạo {currentOutput.originalFileName}. {successWarnings.join(' ')} <a href={currentOutput.publicUrl || publicFileUrl(currentOutput.id)} target="_blank" rel="noreferrer">Mở file mới</a></div>}
      </div>
    </div>
  </Modal>;
}
