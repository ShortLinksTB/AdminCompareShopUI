import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { Button, ErrorState, Modal, Pill, Select } from '../ui';
import { createFileDerivatives, publicFileUrl, type AdminFile, type DerivativeFormat, type FileDerivativeResult, type FileDerivativeVariant } from './files-api';
import type { AdminRequest } from '../products/products-api';
import './file-derivative.css';

type Size = { width: number; height: number; preset?: string };
const presets: Size[] = [{ width: 600, height: 600, preset: 'Trang chủ' }, { width: 1000, height: 1000, preset: 'Chi tiết sản phẩm' }];
const baseName = (file: AdminFile) => file.originalFileName.replace(/\.[^.]+$/, '');

export function FileDerivativeDialog({ file, requestAdmin, existingNames = [], onClose, onCreated }: { file: AdminFile | null; requestAdmin: AdminRequest; existingNames?: string[]; onClose: () => void; onCreated: (complete: boolean) => void }) {
  const [selected, setSelected] = useState<number[]>([0]);
  const [custom, setCustom] = useState(false);
  const [width, setWidth] = useState(800); const [height, setHeight] = useState(600);
  const [fit, setFit] = useState<'cover' | 'contain'>('cover'); const [background, setBackground] = useState('#ffffff');
  const [format, setFormat] = useState<DerivativeFormat>('webp'); const [quality, setQuality] = useState(90);
  const [name, setName] = useState(''); const [focal, setFocal] = useState({ x: .5, y: .5 });
  const [active, setActive] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [results, setResults] = useState<Array<{ variant: FileDerivativeVariant; result?: FileDerivativeResult; state: 'failed' | 'done' }>>([]);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1); const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<'crop' | 'pan'>('crop');
  const canvasRef = useRef<HTMLCanvasElement>(null); const stageRef = useRef<HTMLDivElement>(null); const dragRef = useRef<{ x: number; y: number; focal: { x: number; y: number }; pan: { x: number; y: number } } | null>(null);
  const sizes = useMemo(() => [...selected.map(index => presets[index]), ...(custom && width >= 16 && width <= 4000 && height >= 16 && height <= 4000 ? [{ width, height, preset: 'Tuỳ chọn' }] : [])], [selected, custom, width, height]);
  const size = sizes[Math.min(active, Math.max(0, sizes.length - 1))];

  useEffect(() => {
    if (!file) return;
    setSelected([0]); setCustom(false); setWidth(800); setHeight(600); setFit('cover'); setBackground('#ffffff');
    setFormat(file.contentType === 'image/png' ? 'keep' : 'webp'); setQuality(90); setName(baseName(file)); setFocal({ x: .5, y: .5 });
    setActive(0); setBusy(false); setError(''); setResults([]); setZoom(1); setPan({ x: 0, y: 0 }); setTool('crop');
    const image = new Image(); image.crossOrigin = 'anonymous';
    image.onload = () => { setImageSize({ width: image.naturalWidth, height: image.naturalHeight }); const canvas = canvasRef.current; if (canvas) { const ctx = canvas.getContext('2d'); if (ctx) { canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; ctx.drawImage(image, 0, 0); } } };
    image.src = publicFileUrl(file.id);
  }, [file?.id]);

  useEffect(() => {
    if (!file || !size) return;
    const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => {
      const canvas = canvasRef.current; const ctx = canvas?.getContext('2d'); if (!canvas || !ctx) return;
      const scale = Math.min(1, 1600 / Math.max(size.width, size.height)); canvas.width = Math.max(1, Math.round(size.width * scale)); canvas.height = Math.max(1, Math.round(size.height * scale));
      if (fit === 'contain' && background !== 'transparent') { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); } else ctx.clearRect(0, 0, canvas.width, canvas.height);
      const ratio = fit === 'cover' ? Math.max(canvas.width / image.width, canvas.height / image.height) : Math.min(canvas.width / image.width, canvas.height / image.height);
      const drawnWidth = image.width * ratio; const drawnHeight = image.height * ratio;
      const x = fit === 'cover' ? -(drawnWidth - canvas.width) * focal.x : (canvas.width - drawnWidth) / 2;
      const y = fit === 'cover' ? -(drawnHeight - canvas.height) * focal.y : (canvas.height - drawnHeight) / 2;
      ctx.imageSmoothingQuality = 'high'; ctx.drawImage(image, x, y, drawnWidth, drawnHeight);
    }; image.src = publicFileUrl(file.id);
  }, [file?.id, size?.width, size?.height, fit, background, focal]);

  if (!file) return null;
  const fileNames = sizes.map(item => `${name.trim() || baseName(file)}-${item.width}x${item.height}`);
  const duplicated = fileNames.some((value, index) => fileNames.indexOf(value) !== index);
  const tooSmall = sizes.some(item => imageSize.width && (imageSize.width < item.width || imageSize.height < item.height));
  const extreme = imageSize.width / imageSize.height > 1.8 || imageSize.width / imageSize.height < .55;
  const variants: FileDerivativeVariant[] = sizes.map((item, index) => ({ width: item.width, height: item.height, fit, ...(fit === 'cover' ? { focalX: focal.x, focalY: focal.y } : {}), background, format, quality, name: fileNames[index] }));
  const outputExtension = format === 'keep' ? file.contentType === 'image/gif' ? 'png' : file.contentType === 'image/jpeg' ? 'jpg' : file.contentType.split('/')[1] : format;
  const knownCollision = variants.some(variant => existingNames.some(existing => existing.normalize('NFC').toLocaleLowerCase() === `${variant.name}.${outputExtension}`.normalize('NFC').toLocaleLowerCase()));
  const toggle = (index: number) => setSelected(current => current.includes(index) ? current.filter(value => value !== index) : [...current, index]);
  const submit = async (only?: FileDerivativeVariant[]) => {
    const work = only ?? variants;
    if (!work.length) return;
    setBusy(true); setError('');
    try {
      const response = await createFileDerivatives(requestAdmin, file.id, work);
      const mapped = work.map((variant, index) => ({ variant, result: response[index], state: response[index]?.file ? 'done' as const : 'failed' as const }));
      setResults(current => only ? current.map(item => { const result = mapped.find(value => value.variant.name === item.variant.name); return result ?? item; }) : mapped);
      if (mapped.some(item => item.state === 'done')) onCreated(mapped.every(item => item.state === 'done'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create image derivatives.'); }
    finally { setBusy(false); }
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => { event.preventDefault(); const rect = stageRef.current?.getBoundingClientRect(); if (!rect) return; const next = Math.min(4, Math.max(.56, zoom * Math.exp(-event.deltaY * .0016))); const factor = next / zoom; const px = event.clientX - rect.left - rect.width / 2, py = event.clientY - rect.top - rect.height / 2; setPan(current => ({ x: px - (px - current.x) * factor, y: py - (py - current.y) * factor })); setZoom(next); };
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => { if (event.button !== 0 || (tool === 'pan' && zoom <= 1.03) || (tool === 'crop' && fit !== 'cover')) return; dragRef.current = { x: event.clientX, y: event.clientY, focal, pan }; event.currentTarget.setPointerCapture(event.pointerId); };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => { if (!dragRef.current || !size) return; const drag = dragRef.current, dx = event.clientX - drag.x, dy = event.clientY - drag.y; if (tool === 'pan') setPan({ x: drag.pan.x + dx, y: drag.pan.y + dy }); else if (fit === 'cover' && imageSize.width && imageSize.height) { const scale = Math.max(size.width / imageSize.width, size.height / imageSize.height); const overflowX = Math.max(1, imageSize.width * scale - size.width), overflowY = Math.max(1, imageSize.height * scale - size.height); const canvas = canvasRef.current?.getBoundingClientRect(); const scaleX = canvasRef.current?.width ? (canvas?.width ?? canvasRef.current.width) / canvasRef.current.width : 1; const scaleY = canvasRef.current?.height ? (canvas?.height ?? canvasRef.current.height) / canvasRef.current.height : 1; setFocal({ x: Math.max(0, Math.min(1, drag.focal.x - dx / scaleX / overflowX)), y: Math.max(0, Math.min(1, drag.focal.y - dy / scaleY / overflowY)) }); } };
  const close = () => { if (!busy) onClose(); };
  return <Modal open title="Tạo bản sao theo kích thước" onClose={close} className="file-derivative-modal" actions={<><span style={{ marginRight: 'auto', color: 'var(--studio-muted)', fontSize: 12 }}>Bản gốc giữ nguyên. Tạo {sizes.length} file mới.</span><Button disabled={busy} onClick={close}>Huỷ</Button><Button tone="primary" disabled={busy || !sizes.length} onClick={() => void submit()}>{busy ? 'Đang xử lý…' : sizes.length > 1 ? `Tạo ${sizes.length} bản sao` : 'Tạo bản sao'}</Button></>}>
    <div className="derivative-layout">
      <section className="derivative-options"><h3>1. Kích thước</h3>
        {presets.map((item, index) => <label className="derivative-preset" key={item.preset}><input type="checkbox" checked={selected.includes(index)} onChange={() => toggle(index)} /><span><b>{item.width} × {item.height} px · {item.preset}</b><small>{index === 0 ? 'Ảnh ở thẻ sản phẩm nổi bật và danh sách' : 'Ảnh lớn ở trang chi tiết sản phẩm'}</small></span></label>)}
        <label className="derivative-preset"><input type="checkbox" checked={custom} onChange={event => setCustom(event.target.checked)} /><span><b>Tuỳ chọn</b><span className="derivative-dimensions"><input aria-label="Rộng" type="number" min="16" max="4000" value={width} onChange={event => setWidth(Number(event.target.value))} /> × <input aria-label="Cao" type="number" min="16" max="4000" value={height} onChange={event => setHeight(Number(event.target.value))} /> px (16 đến 4000)</span></span></label>
        {custom && (width < 16 || width > 4000 || height < 16 || height > 4000) && <p className="derivative-warning">Kích thước tuỳ chọn phải từ 16 đến 4000 px.</p>}
        <h3>2. Cách xử lý ảnh không vuông</h3><div className="derivative-segment"><Button size="sm" aria-pressed={fit === 'cover'} onClick={() => { setFit('cover'); setZoom(1); setPan({ x: 0, y: 0 }); }}>Cắt khung (lấp đầy)</Button><Button size="sm" aria-pressed={fit === 'contain'} onClick={() => { setFit('contain'); setZoom(1); setPan({ x: 0, y: 0 }); }}>Giữ nguyên ảnh + nền</Button></div>
        {fit === 'contain' && <div className="derivative-colors" aria-label="Nền">{['#ffffff', '#000000', 'transparent', '#ff5a00'].map(color => <button key={color} type="button" aria-label={`Nền ${color}`} aria-pressed={background === color} style={{ background: color === 'transparent' ? 'repeating-conic-gradient(#aaa 0 25%,white 0 50%) 50%/10px 10px' : color }} onClick={() => setBackground(color)} />)}</div>}
        <h3>3. Định dạng và tên</h3><div className="derivative-fields"><label>Định dạng<Select value={format} onChange={event => setFormat(event.target.value as DerivativeFormat)}><option value="keep">Giữ nguyên</option><option value="webp">WebP</option><option value="jpg">JPG</option><option value="png">PNG</option></Select></label><label>Chất lượng<Select value={quality} onChange={event => setQuality(Number(event.target.value))}><option value={90}>90 (đề xuất)</option><option value={80}>80</option><option value={70}>70</option></Select></label></div>
        <label className="derivative-name">Tên gốc<input value={name} onChange={event => setName(event.target.value)} /><small>Tên file mới: tên-gốc-RộngxCao</small></label>
        <div className="derivative-names" aria-live="polite">{variants.map(variant => <div key={`${variant.width}x${variant.height}`}><code>{variant.name}.{outputExtension}</code><small>{results.find(item => item.variant.name === variant.name)?.state === 'done' ? 'Đã tạo' : `${variant.width}×${variant.height}`}</small></div>)}</div>
        {tooSmall && <p className="derivative-warning">Ảnh gốc nhỏ hơn kích thước đích: cần phóng to nên ảnh có thể mờ.</p>}{fit === 'cover' && extreme && sizes.length > 0 && <p className="derivative-warning">Ảnh rất dài hoặc rất cao: chế độ cắt khung có thể mất nhiều nội dung.</p>}{(duplicated || knownCollision) && <p className="derivative-warning">Tên đã có hoặc trùng với biến thể khác; máy chủ sẽ thêm hậu tố để tránh trùng tên.</p>}{format === 'keep' && file.contentType === 'image/gif' && <p className="derivative-warning">Ảnh GIF sẽ được chuyển thành PNG (khung hình đầu tiên).</p>}
      </section>
      <section className="derivative-preview"><h3>Xem trước</h3><div className="derivative-tabs" role="group" aria-label="Chọn kích thước xem trước">{sizes.map((item, index) => <Button key={`${item.width}-${item.height}`} size="sm" aria-pressed={active === index} onClick={() => setActive(index)}>{item.width}×{item.height}</Button>)}</div>
        <div className="derivative-zoom-tools"><div className="derivative-tool-select"><Button size="sm" aria-pressed={tool === 'crop'} disabled={fit !== 'cover'} onClick={() => setTool('crop')}>✥ Vùng cắt</Button><Button size="sm" aria-pressed={tool === 'pan'} disabled={zoom <= 1.03} onClick={() => setTool('pan')}>✋ Di chuyển</Button></div><Button size="sm" disabled={zoom <= .56} aria-label="Thu nhỏ" onClick={() => setZoom(value => Math.max(.56, value / 1.35))}>−</Button><Button size="sm" disabled={zoom >= 4} aria-label="Phóng to" onClick={() => setZoom(value => Math.min(4, value * 1.35))}>＋</Button><Button size="sm" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Vừa khung</Button><Button size="sm" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>100%</Button><Pill size="sm">{Math.round(zoom * 100)}%</Pill></div>
        <div ref={stageRef} className="derivative-stage" tabIndex={0} aria-label="Xem trước. Cuộn chuột để zoom tại con trỏ, kéo để di chuyển" onWheel={onWheel} onDoubleClick={() => { setZoom(value => value > 1 ? 1 : 2); setPan({ x: 0, y: 0 }); }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} onKeyDown={event => { if (event.key === '+' || event.key === '=') setZoom(value => Math.min(4, value * 1.35)); if (event.key === '-') setZoom(value => Math.max(.56, value / 1.35)); if (event.key === '0') { setZoom(1); setPan({ x: 0, y: 0 }); } }}><canvas ref={canvasRef} aria-label="Xem trước ảnh sau khi xử lý" style={{ width: size ? `min(100%, ${size.width}px)` : '100%', height: size ? `min(100%, ${size.height}px)` : '100%', aspectRatio: size ? `${size.width}/${size.height}` : undefined, background: background === 'transparent' ? undefined : background, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} /></div>
        <div className="derivative-preview-meta">{size && `${size.width} × ${size.height} px · ${fit === 'cover' ? 'cắt khung' : 'giữ nguyên + nền'}`}<span>{tool === 'crop' && fit === 'cover' ? 'Kéo ảnh để chọn vùng giữ lại' : zoom > 1.03 ? 'Kéo để di chuyển khung nhìn' : ''}</span></div>
        {error && <ErrorState title={error} />}{results.filter(item => item.state === 'failed').map(item => <div className="derivative-result-error" key={item.variant.name}><span>{item.result?.error ?? 'Không thể tạo bản sao'} · {item.variant.width}×{item.variant.height}</span><Button size="sm" disabled={busy} onClick={() => void submit([item.variant])}>Thử lại</Button></div>)}
      </section>
    </div>
    </Modal>;
}
