import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type WheelEvent } from 'react';
import { getPartnerShops, type PartnerShop } from '../shopsApi';
import { getAdminOffers, getOfferPriceHistory, updateAdminOffer, type AdminOffer, type AdminOffersPage, type AdminRequest, type OfferFilter, type OfferSort, type PriceHistoryPoint } from './offers-api';
import './offers.css';

const PAGE_SIZES = [10, 20, 50];
const STALE_HOURS = 72;
const EMPTY_COUNTS = { all: 0, outlier: 0, stale: 0, outOfStock: 0, inactive: 0 };
const EMPTY_PAGE: AdminOffersPage = { items: [], page: 1, pageSize: 10, totalItems: 0, counts: EMPTY_COUNTS };
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const compactMoney = (value: number) => money.format(value);

function formatDate(value: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function ageLabel(value: string): { text: string; stale: boolean } {
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value;
  const timestamp = new Date(normalized).getTime();
  if (Number.isNaN(timestamp)) return { text: value, stale: false };
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
  if (hours < 1) return { text: 'Vừa cập nhật', stale: false };
  if (hours < 24) return { text: `${hours} giờ trước`, stale: hours > STALE_HOURS };
  const days = Math.floor(hours / 24);
  return { text: `${days} ngày trước`, stale: hours > STALE_HOURS };
}

function safeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function stockLabel(stock: AdminOffer['stockStatus']): string {
  if (stock === 'in_stock') return 'Còn hàng';
  if (stock === 'out_of_stock') return 'Hết hàng';
  return 'Chưa rõ';
}

type Lightbox = { offer: AdminOffer; source: 'shop' | 'product' };
function ImageLightbox({ value, onClose }: { value: Lightbox; onClose: () => void }) {
  const [source, setSource] = useState(value.source);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ id: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const [hint, setHint] = useState(true);
  const stage = useRef<HTMLDivElement>(null);
  const offer = value.offer;
  const src = source === 'shop' ? offer.imageUrl : offer.productImageUrl;
  const zoomTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const timer = window.setTimeout(() => setHint(false), 2200);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => { window.clearTimeout(timer); window.clearTimeout(zoomTimer.current); window.removeEventListener('keydown', escape); };
  }, [onClose]);
  function zoomAt(event: { clientX: number; clientY: number }, target: number) {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const cx = event.clientX - (box.left + box.width / 2);
    const cy = event.clientY - (box.top + box.height / 2);
    const next = Math.max(1, Math.min(4, target));
    setPan(current => next === 1 ? { x: 0, y: 0 } : {
      x: cx - ((cx - current.x) / zoom) * next,
      y: cy - ((cy - current.y) / zoom) * next,
    });
    setZoom(next);
  }
  return <div className="offer-lightbox" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="offer-lbbar"><strong className="offer-lbtitle">{offer.productName || `Sản phẩm #${offer.productId}`}</strong>
      <div className="offer-lbtabs" role="group" aria-label="Nguồn ảnh">
        <button type="button" aria-pressed={source === 'shop'} onClick={() => { setSource('shop'); setZoom(1); setPan({ x: 0, y: 0 }); }}>Ảnh của {offer.partnerShopName || 'cửa hàng'}</button>
        <button type="button" aria-pressed={source === 'product'} onClick={() => { setSource('product'); setZoom(1); setPan({ x: 0, y: 0 }); }}>Ảnh sản phẩm chuẩn</button>
      </div>
      <button className="offer-lb-close" type="button" aria-label="Đóng ảnh" onClick={onClose}>✕</button>
    </div>
    <div ref={stage} className="offer-lb-stage" onWheel={event => { event.preventDefault(); zoomAt(event, zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)); }}
      onClick={event => zoomAt(event, zoom === 1 ? 2 : 1)}
      onPointerDown={event => { if (zoom > 1) { event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }); } }}
      onPointerMove={(event: PointerEvent<HTMLDivElement>) => { if (drag?.id === event.pointerId) setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y }); }}
      onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
      {src ? <img src={src} alt={offer.productName || 'Ảnh sản phẩm'} draggable="false" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} /> : <div className="offer-lb-no-image">{source === 'shop' ? 'Cửa hàng chưa cung cấp ảnh cho offer này.' : 'Chưa có ảnh sản phẩm chuẩn.'}</div>}
    </div>
    {hint && <div className="offer-lb-hint">Cuộn để phóng to tại con trỏ · kéo để di chuyển · bấm để đổi 100% / 200%</div>}
    <span className="offer-lb-zoom">{Math.round(zoom * 100)}%</span>
  </div>;
}

function PriceChart({ points }: { points: PriceHistoryPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return <div className="offer-history-empty">Chưa có dữ liệu lịch sử giá trong 30 ngày.</div>;
  const width = 420; const height = 150; const pad = { x: 12, top: 12, bottom: 28 };
  const prices = points.map(point => point.priceVnd);
  let min = Math.min(...prices); let max = Math.max(...prices);
  if (min === max) { min -= 1; max += 1; }
  const extra = (max - min) * 0.12; min -= extra; max += extra;
  const xAt = (index: number) => pad.x + (points.length < 2 ? (width - pad.x * 2) / 2 : index * (width - pad.x * 2) / (points.length - 1));
  const yAt = (price: number) => pad.top + (max - price) * (height - pad.top - pad.bottom) / (max - min);
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${xAt(index).toFixed(1)} ${yAt(point.priceVnd).toFixed(1)}`).join(' ');
  return <div className="offer-chart" onMouseLeave={() => setHover(null)}><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Lịch sử giá 30 ngày">
    {[0, 1, 2].map(index => <line key={index} x1={pad.x} x2={width - pad.x} y1={pad.top + index * 52} y2={pad.top + index * 52} className="offer-chart-grid" />)}
    <path d={path} fill="none" className="offer-chart-line" />
    {points.map((point, index) => <circle key={`${point.dateUtc}-${index}`} cx={xAt(index)} cy={yAt(point.priceVnd)} r={index === points.length - 1 ? 4 : 2.5} className={index === points.length - 1 ? 'offer-chart-point current' : 'offer-chart-point'} onMouseEnter={() => setHover(index)} />)}
    {hover !== null && <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.top} y2={height - pad.bottom} className="offer-chart-hover" />}
    <text x={pad.x} y={height - 4}>30 ngày trước</text><text x={width - pad.x} y={height - 4} textAnchor="end">Gần nhất</text>
  </svg>{hover !== null && <div className="offer-chart-tooltip">{formatDate(points[hover].dateUtc)} · {compactMoney(points[hover].priceVnd)}</div>}</div>;
}

function PriceComparison({ offers, current }: { offers: AdminOffer[]; current: AdminOffer }) {
  const maxPrice = Math.max(1, ...offers.map(offer => offer.priceVnd));
  return <ul className="offer-compare-list">{offers.map(offer => <li key={offer.id} className={offer.id === current.id ? 'current' : ''}>
    <span className="offer-compare-shop">{offer.partnerShopName || `Cửa hàng #${offer.partnerShopId}`}{offer.id === current.id ? ' · đang xem' : ''}</span>
    <b className="offer-compare-price">{compactMoney(offer.priceVnd)}</b>
    <small>{stockLabel(offer.stockStatus)} · {ageLabel(offer.updatedAtUtc).text}{offer.isActive ? '' : ' · Ẩn'}{offer.isOutlier ? ' · Giá bất thường' : ''}</small>
    <small className="offer-compare-min">{offer.lowestPriceVnd === offer.priceVnd && !offer.isOutlier ? 'Thấp nhất' : ''}</small>
    <span className="offer-compare-bar"><i style={{ width: `${Math.max(2, offer.priceVnd / maxPrice * 100)}%` }} /></span>
  </li>)}</ul>;
}

function DetailDrawer({ offer, requestAdmin, canUpdate, onClose, onAction }: { offer: AdminOffer; requestAdmin: AdminRequest; canUpdate: boolean; onClose: () => void; onAction: (offer: AdminOffer, action: 'active' | 'outlier', reason?: string) => Promise<void> }) {
  const [history, setHistory] = useState<PriceHistoryPoint[]>([]);
  const [comparison, setComparison] = useState<AdminOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([
      getOfferPriceHistory(requestAdmin, offer.id, controller.signal),
      getAdminOffers(requestAdmin, { page: 1, pageSize: 100, productId: offer.productId, sort: 'priceAsc' }, controller.signal),
    ]).then(([points, result]) => { setHistory(points); setComparison(result.items); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Không thể tải chi tiết offer.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => { controller.abort(); window.removeEventListener('keydown', escape); };
  }, [offer.id, offer.productId, requestAdmin, onClose]);
  const peers = useMemo(() => comparison.length ? comparison : [offer], [comparison, offer]);
  return <><button className="offer-scrim" aria-label="Đóng chi tiết" onClick={onClose} /><aside className="offer-drawer" role="dialog" aria-modal="true" aria-label="Chi tiết offer">
    <header className="offer-drawer-head"><div className="offer-drawer-thumb">{(offer.imageUrl || offer.productImageUrl) ? <img src={offer.imageUrl || offer.productImageUrl || ''} alt="" /> : <span>No img</span>}</div><div><h2>{offer.productName || `Sản phẩm #${offer.productId}`}</h2><p>{offer.partnerShopName || `Cửa hàng #${offer.partnerShopId}`} · SKU {offer.externalSku || '—'}</p></div><button className="offer-close" type="button" aria-label="Đóng" onClick={onClose}>✕</button></header>
    <div className="offer-drawer-body">
      {offer.isOutlier && <p className="offer-reason"><span className="offer-pill warn">Giá bất thường</span> {offer.outlierReason || 'Chưa có lý do được ghi.'}</p>}
      <section><h3>Tóm tắt</h3><div className="offer-facts">
        <div><span>Giá hiện tại</span><b>{compactMoney(offer.priceVnd)}</b></div><div><span>Giá gốc (shop)</span><b>{offer.originalPriceVnd == null ? 'Không có' : compactMoney(offer.originalPriceVnd)}</b></div>
        <div><span>Giá thấp nhất của sản phẩm</span><b>{offer.lowestPriceVnd == null ? 'Chưa có' : compactMoney(offer.lowestPriceVnd)}</b></div><div><span>Cập nhật gần nhất</span><b>{ageLabel(offer.updatedAtUtc).text}</b></div>
      </div></section>
      <section><h3>Giá 30 ngày của offer này</h3>{loading ? <div className="offer-detail-state">Đang tải lịch sử giá…</div> : <PriceChart points={history} />}</section>
      <section><h3>So sánh giữa các cửa hàng ({peers.length})</h3>{loading ? <div className="offer-detail-state">Đang tải các cửa hàng…</div> : <PriceComparison offers={peers} current={offer} />}</section>
      {error && <p className="offer-inline-error" role="alert">{error}</p>}
    </div>
    {canUpdate && <footer className="offer-drawer-actions"><button type="button" onClick={() => void onAction(offer, 'active')}>{offer.isActive ? 'Ẩn offer' : 'Hiển thị offer'}</button><button type="button" onClick={() => void onAction(offer, 'outlier')}>{offer.isOutlier ? 'Bỏ đánh dấu bất thường' : 'Đánh dấu giá bất thường'}</button>{safeUrl(offer.url) && <a className="primary-button" href={safeUrl(offer.url) || undefined} target="_blank" rel="noreferrer">Mở trang trên cửa hàng ↗</a>}</footer>}
  </aside></>;
}

export function OffersPage({ requestAdmin, permissions = [] }: { requestAdmin: AdminRequest; permissions?: string[] }) {
  const [result, setResult] = useState(EMPTY_PAGE);
  const [shops, setShops] = useState<PartnerShop[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [shopId, setShopId] = useState<number | ''>('');
  const [filter, setFilter] = useState<OfferFilter>('all');
  const [sort, setSort] = useState<OfferSort>('attention');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [detail, setDetail] = useState<AdminOffer | null>(null);
  const [lightbox, setLightbox] = useState<Lightbox | null>(null);
  const [toast, setToast] = useState('');
  const [actionError, setActionError] = useState('');
  const canUpdate = permissions.includes('offers.update');
  const menuRef = useRef<HTMLDivElement>(null);
  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));

  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query.trim()); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    getAdminOffers(requestAdmin, { page, pageSize, q: search || undefined, shopId: shopId || undefined, filter: filter === 'all' ? undefined : filter, sort, staleHours: STALE_HOURS }, controller.signal)
      .then(data => setResult(data))
      .catch(reason => { if (reason instanceof DOMException && reason.name === 'AbortError') return; setResult(EMPTY_PAGE); setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách offer.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, page, pageSize, search, shopId, filter, sort, reload]);
  useEffect(() => {
    const controller = new AbortController();
    getPartnerShops(requestAdmin, 1, 100, controller.signal).then(data => setShops(data.items.filter(shop => shop.isActive))).catch(() => setShops([]));
    return () => controller.abort();
  }, [requestAdmin]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const close = (event: globalThis.PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpenMenu(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  async function act(offer: AdminOffer, action: 'active' | 'outlier', reasonValue?: string) {
    if (!canUpdate) return;
    setActionError('');
    const patch = action === 'active' ? { isActive: !offer.isActive } : offer.isOutlier
      ? { isOutlier: false, outlierReason: null }
      : { isOutlier: true, outlierReason: reasonValue?.trim() || null };
    try {
      await updateAdminOffer(requestAdmin, offer.id, patch);
      setToast(action === 'active' ? (offer.isActive ? 'Đã ẩn offer.' : 'Đã hiển thị offer.') : (offer.isOutlier ? 'Đã bỏ đánh dấu giá bất thường.' : 'Đã đánh dấu giá bất thường.'));
      setDetail(null); setOpenMenu(null); setReload(value => value + 1);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể cập nhật offer.');
    }
  }

  function handleAction(event: MouseEvent, offer: AdminOffer, action: 'detail' | 'toggle' | 'flag' | 'shop' | 'product') {
    event.stopPropagation(); setOpenMenu(null);
    if (action === 'detail') { setDetail(offer); return; }
    if (action === 'shop') { const url = safeUrl(offer.url); if (url) window.open(url, '_blank', 'noopener,noreferrer'); return; }
    if (action === 'product') { window.location.assign(`/products/${offer.productId}`); return; }
    if (action === 'toggle') { void act(offer, 'active'); return; }
    const reason = offer.isOutlier ? '' : window.prompt('Lý do đánh dấu giá bất thường (không bắt buộc):', '') ?? undefined;
    if (reason !== undefined) void act(offer, 'outlier', reason);
  }

  const pageOffers = result.items;
  return <div className="offers-page">
    <div className="page-header"><div><span className="eyebrow">Catalog &amp; Pricing</span><h1>Offers &amp; Prices</h1><p>Giá từng cửa hàng đang bán cho từng sản phẩm. Dùng bộ lọc nhanh để xử lý offer cần chú ý.</p></div></div>
    <div className="offer-chips" role="group" aria-label="Bộ lọc nhanh">
      {([['all', 'Tất cả', 'all'], ['outlier', 'Giá bất thường', 'outlier'], ['stale', 'Lâu chưa cập nhật', 'stale'], ['out_of_stock', 'Hết hàng', 'outOfStock'], ['inactive', 'Đang ẩn', 'inactive']] as const).map(([key, label, countKey]) => <button key={key} className={`offer-chip${key !== 'all' && result.counts[countKey] > 0 ? ' attention' : ''}`} type="button" aria-pressed={filter === key} onClick={() => { setFilter(key); setPage(1); }}>
        {label}<span>{result.counts[countKey]}</span>
      </button>)}
    </div>
    <div className="toolbar offer-toolbar" role="search">
      <label className="toolbar-search">⌕<input aria-label="Tìm offer" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm theo tên sản phẩm, cửa hàng hoặc mã SKU..." /></label>
      <select className="offer-select" aria-label="Lọc theo cửa hàng" value={shopId} onChange={event => { setShopId(event.target.value ? Number(event.target.value) : ''); setPage(1); }}><option value="">Tất cả cửa hàng</option>{shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select>
      <select className="offer-select" aria-label="Sắp xếp" value={sort} onChange={event => { setSort(event.target.value as OfferSort); setPage(1); }}><option value="attention">Cần xem trước</option><option value="oldest">Cập nhật cũ nhất</option><option value="priceAsc">Giá thấp đến cao</option><option value="priceDesc">Giá cao đến thấp</option><option value="name">Tên sản phẩm A–Z</option></select>
    </div>
    {error && <div className="banned-alert" role="alert">{error}<button className="outline-button small" type="button" onClick={() => setReload(value => value + 1)}>Thử lại</button></div>}
    {actionError && <div className="banned-alert" role="alert">{actionError}<button className="outline-button small" type="button" onClick={() => setActionError('')}>Đóng</button></div>}
    <section className="panel offer-panel" aria-label="Danh sách offers">
      {loading ? <div className="offer-empty" role="status">Đang tải offers…</div> : error ? null : pageOffers.length === 0 ? <div className="offer-empty" role="status"><strong>Không có offer nào khớp bộ lọc</strong><span>Thử bỏ bớt bộ lọc hoặc đổi từ khoá tìm kiếm.</span><button className="outline-button small" type="button" onClick={() => { setFilter('all'); setQuery(''); setSearch(''); setShopId(''); setPage(1); }}>Bỏ bộ lọc</button></div> : <div className="offer-table-scroll"><table><thead><tr><th>Sản phẩm</th><th>Cửa hàng</th><th className="align-right">Giá bán</th><th>So với giá thấp nhất</th><th>Kho</th><th>Trạng thái</th><th>Cập nhật</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody>{pageOffers.map(offer => {
          const age = ageLabel(offer.updatedAtUtc);
          const image = offer.imageUrl || offer.productImageUrl;
          return <tr key={offer.id} className={!offer.isActive ? 'inactive' : ''} onClick={() => setDetail(offer)}>
            <td><div className="offer-product-cell">{image ? <button className="offer-thumb" type="button" aria-label={`Xem ảnh lớn của ${offer.productName || 'sản phẩm'}`} onClick={event => { event.stopPropagation(); setLightbox({ offer, source: offer.imageUrl ? 'shop' : 'product' }); }}><img src={image} alt="" /></button> : <div className="offer-thumb no-image">No img</div>}<div><strong>{offer.productName || `Sản phẩm #${offer.productId}`}</strong><small>SKU {offer.externalSku || '—'} · Offer #{offer.id}</small></div></div></td>
            <td><strong>{offer.partnerShopName || `Cửa hàng #${offer.partnerShopId}`}</strong></td>
            <td className="align-right"><strong className="offer-price">{compactMoney(offer.priceVnd)}</strong>{offer.originalPriceVnd != null && <small className="offer-original-price">{compactMoney(offer.originalPriceVnd)}</small>}</td>
            <td>{offer.isOutlier ? <><span className="offer-pill warn">Giá bất thường</span><small className="offer-subline">{offer.outlierReason || 'Cần xem lại mức giá của offer này.'}</small>{offer.deltaPercent != null && <small className="offer-subline">{offer.deltaPercent > 0 ? '+' : ''}{offer.deltaPercent.toFixed(1).replace('.', ',')}% so với giá thấp nhất</small>}</> : offer.lowestPriceVnd == null ? <span className="offer-pill neutral">Chưa có giá để so</span> : offer.deltaVnd === 0 ? <span className="offer-pill ok">Thấp nhất</span> : offer.deltaVnd == null ? <span className="offer-pill neutral">Chưa có giá để so</span> : <><span className="offer-vs">{offer.deltaVnd > 0 ? '+' : ''}{compactMoney(offer.deltaVnd)}</span><small className="offer-subline">{offer.deltaPercent == null ? '' : `${offer.deltaPercent > 0 ? '+' : ''}${offer.deltaPercent.toFixed(1).replace('.', ',')}% so với thấp nhất`}</small></>}</td>
            <td><span className={`offer-pill ${offer.stockStatus === 'out_of_stock' ? 'bad' : offer.stockStatus === 'unknown' ? 'neutral' : 'ok'}`}>{stockLabel(offer.stockStatus)}</span></td>
            <td><span className={`offer-pill ${offer.isActive ? 'ok' : 'bad'}`}>{offer.isActive ? 'Hiển thị' : 'Ẩn'}</span></td>
            <td><span className={`offer-updated${age.stale ? ' stale' : ''}`}>{age.text}{age.stale && <small>Lâu chưa cập nhật</small>}<small>{formatDate(offer.updatedAtUtc)}</small></span></td>
            <td className="offer-actions" onClick={event => event.stopPropagation()}><button type="button" className="offer-kebab" aria-label={`Thao tác cho offer ${offer.id}`} aria-haspopup="menu" aria-expanded={openMenu === offer.id} onClick={() => setOpenMenu(current => current === offer.id ? null : offer.id)}>⋮</button>
              {openMenu === offer.id && <div ref={menuRef} className="offer-menu" role="menu"><button type="button" role="menuitem" onClick={event => handleAction(event, offer, 'detail')}>Xem so sánh giá và lịch sử</button><button type="button" role="menuitem" onClick={event => handleAction(event, offer, 'shop')}>Mở trang trên cửa hàng ↗</button><button type="button" role="menuitem" onClick={event => handleAction(event, offer, 'product')}>Mở sản phẩm trong Products</button>{canUpdate && <><hr /><button type="button" role="menuitem" onClick={event => handleAction(event, offer, 'toggle')}>{offer.isActive ? 'Ẩn khỏi trang so sánh' : 'Hiển thị lại trên trang so sánh'}</button><button type="button" role="menuitem" onClick={event => handleAction(event, offer, 'flag')}>{offer.isOutlier ? 'Bỏ đánh dấu giá bất thường' : 'Đánh dấu giá bất thường'}</button></>}</div>}
            </td>
          </tr>;
        })}</tbody></table></div>}
      {!loading && !error && <div className="offer-footer"><div className="offer-footer-left"><select className="offer-select" aria-label="Số dòng mỗi trang" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{PAGE_SIZES.map(size => <option key={size} value={size}>{size} dòng</option>)}</select><span className="offer-total"><b>{result.totalItems}</b> offers</span></div><span className="offer-range">{result.totalItems ? `Hiển thị ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, result.totalItems)} / ${result.totalItems}` : 'Không có dữ liệu'}</span><div className="offer-footer-right"><button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>‹</button><span>Trang {page} / {totalPages}</span><button type="button" aria-label="Trang sau" disabled={page >= totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>›</button></div></div>}
    </section>
    <div className="offer-legend"><span><b>Giá bất thường</b>: offer bị đánh dấu sẽ không dùng để tính giá thấp nhất.</span><span><b>Ẩn</b>: offer không hiện trên trang so sánh của khách.</span></div>
    {detail && <DetailDrawer offer={detail} requestAdmin={requestAdmin} canUpdate={canUpdate} onClose={() => setDetail(null)} onAction={act} />}
    {lightbox && <ImageLightbox value={lightbox} onClose={() => setLightbox(null)} />}
    {toast && <div className="offer-toast" role="status">{toast}</div>}
  </div>;
}
