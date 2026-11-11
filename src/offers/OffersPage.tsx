import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminOffer, AdminRequest, OfferFilter, OfferSort, PriceHistoryPoint } from './offers-api';
import { getAdminOffers, getAdminProductOffers, getOfferPriceHistory, updateAdminOffer, updateAdminOfferOutlierReason } from './offers-api';
import { getPartnerShops, type PartnerShop } from '../shopsApi';

const money = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const cash = (value: number | null) => value === null ? '—' : `${money.format(value)} ₫`;
const stockLabels = { in_stock: ['Còn hàng', 'ok'], out_of_stock: ['Hết hàng', 'bad'], coming_soon: ['Sắp có', 'neutral'], unknown: ['Chưa rõ', 'neutral'] } as const;
const filters: { key: OfferFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' }, { key: 'outlier', label: 'Giá bất thường' },
  { key: 'stale', label: 'Lâu chưa cập nhật' }, { key: 'out_of_stock', label: 'Hết hàng' }, { key: 'inactive', label: 'Đang ẩn' },
];

function ageLabel(value: string): { text: string; stale: boolean } {
  const date = new Date(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value);
  if (Number.isNaN(date.getTime())) return { text: value, stale: false };
  const hours = Math.max(0, (Date.now() - date.getTime()) / 3_600_000);
  const days = Math.floor(hours / 24);
  return { text: hours < 1 ? 'Vừa xong' : hours < 24 ? `${Math.floor(hours)} giờ trước` : `${days} ngày trước`, stale: hours > 72 };
}

function safeHref(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

function OfferImage({ offer, open }: { offer: AdminOffer; open: () => void }) {
  const [broken, setBroken] = useState(false);
  const src = offer.imageUrl || offer.productImageUrl;
  return <button className={`offer-thumb${!src || broken ? ' noimg' : ''}`} type="button" onClick={event => { event.stopPropagation(); open(); }} aria-label={`Xem ảnh lớn của ${offer.productName || `offer ${offer.id}`}`}>
    {src && !broken ? <img src={src} alt="" onError={() => setBroken(true)} /> : <span>No img</span>}
  </button>;
}

function PriceChart({ points }: { points: PriceHistoryPoint[] }) {
  if (!points.length) return <div className="offer-history-empty">Chưa có dữ liệu lịch sử giá trong 30 ngày.</div>;
  const values = points.map(point => point.priceVnd);
  const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1;
  const coords = points.map((point, index) => `${8 + index / Math.max(points.length - 1, 1) * 404},${104 - (point.priceVnd - min) / span * 82}`).join(' ');
  return <div className="offer-chart-wrap"><svg viewBox="0 0 420 120" role="img" aria-label="Biểu đồ lịch sử giá 30 ngày">
    <path className="offer-chart-grid" d="M8 22H412M8 63H412M8 104H412" /><polyline points={coords} />
    {points.map((point, index) => { const x = 8 + index / Math.max(points.length - 1, 1) * 404; const y = 104 - (point.priceVnd - min) / span * 82; return <circle key={`${point.dateUtc}-${index}`} cx={x} cy={y} r={index === points.length - 1 ? 4 : 2.5}><title>{new Date(point.dateUtc).toLocaleDateString('vi-VN')} · {cash(point.priceVnd)}</title></circle>; })}
  </svg><div className="offer-chart-range"><span>{new Date(points[0].dateUtc).toLocaleDateString('vi-VN')}</span><span>{new Date(points.at(-1)!.dateUtc).toLocaleDateString('vi-VN')}</span></div></div>;
}

function PriceDrawer({ offer, requestAdmin, close }: { offer: AdminOffer; requestAdmin: AdminRequest; close: () => void }) {
  const [points, setPoints] = useState<PriceHistoryPoint[]>([]);
  const [peers, setPeers] = useState<AdminOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [peersLoading, setPeersLoading] = useState(true);
  const [error, setError] = useState('');
  const [peersError, setPeersError] = useState('');
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [close]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    getOfferPriceHistory(requestAdmin, offer.id, controller.signal).then(setPoints).catch(reason => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : 'Không thể tải lịch sử giá.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    getAdminProductOffers(requestAdmin, offer.productId, controller.signal).then(setPeers).catch(reason => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setPeers([]); setPeersError(reason instanceof Error ? reason.message : 'Không thể tải so sánh cửa hàng.');
    }).finally(() => { if (!controller.signal.aborted) setPeersLoading(false); });
    return () => controller.abort();
  }, [offer.id, requestAdmin]);
  const compare = peers.length ? peers : [offer];
  const max = Math.max(...compare.map(item => item.priceVnd), 1);
  return <><button className="offers-scrim" aria-label="Đóng chi tiết" onClick={close} />
    <aside className="offers-drawer" role="dialog" aria-modal="true" aria-label="Chi tiết offer">
      <header className="offers-drawer-head"><div><span className="offers-drawer-shop">{offer.partnerShopName || `Cửa hàng #${offer.partnerShopId}`}</span><h2>{offer.productName || `Sản phẩm #${offer.productId}`}</h2><small>SKU {offer.externalSku || '—'} · Offer #{offer.id}</small></div><button className="offers-close" onClick={close} aria-label="Đóng">×</button></header>
      <div className="offers-drawer-body">
        <section><h3>Tóm tắt giá</h3><div className="offers-facts"><div><span>Giá hiện tại</span><b>{cash(offer.priceVnd)}</b></div><div><span>Giá gốc</span><b>{cash(offer.originalPriceVnd)}</b></div><div><span>Giá thấp nhất</span><b>{cash(offer.lowestPriceVnd)}</b></div><div><span>Cập nhật gần nhất</span><b>{ageLabel(offer.updatedAtUtc).text}</b></div></div></section>
        <section><h3>Lịch sử giá · 30 ngày</h3>{loading ? <div className="offers-inline-state" role="status">Đang tải lịch sử…</div> : error ? <div className="offers-inline-error" role="alert">{error}</div> : <PriceChart points={points} />}</section>
        <section><h3>So sánh cửa hàng · cùng sản phẩm</h3>{peersLoading ? <div className="offers-inline-state" role="status">Đang tải so sánh…</div> : peersError ? <div className="offers-inline-error" role="alert">{peersError}</div> : peers.length === 0 ? <p className="offers-note">Chưa có dữ liệu so sánh cho sản phẩm này.</p> : <ul className="offers-peer-list">{peers.map(peer => <li key={peer.id} className={peer.id === offer.id ? 'current' : ''}><span className="offers-peer-name">{peer.partnerShopName || `Cửa hàng #${peer.partnerShopId}`}<small>{peer.id === offer.id ? 'Đang xem' : peer.isActive ? 'Hiển thị' : 'Đang ẩn'}{peer.isOutlier ? ' · Giá bất thường' : ''}</small></span><b>{cash(peer.priceVnd)}{peer.lowestPriceVnd === peer.priceVnd && peer.isActive && peer.stockStatus === 'in_stock' ? <small className="offers-lowest-label">Thấp nhất</small> : null}</b><span className="offers-peer-bar"><i style={{ width: `${Math.max(4, peer.priceVnd / max * 100)}%` }} /></span></li>)}</ul>}</section>
        {offer.isOutlier && offer.outlierReason && <section><h3>Lý do đánh dấu</h3><p className="offers-note">{offer.outlierReason}</p></section>}
      </div>
    </aside>
  </>;
}

function ImageLightbox({ offer, close }: { offer: AdminOffer; close: () => void }) {
  const [source, setSource] = useState<'shop' | 'product'>('shop');
  const [scale, setScale] = useState(1); const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [broken, setBroken] = useState(false); const [hintVisible, setHintVisible] = useState(true);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean; onImage: boolean } | null>(null);
  const url = source === 'shop' ? offer.imageUrl : offer.productImageUrl;
  const zoom = (event: React.WheelEvent<HTMLDivElement>) => { event.preventDefault(); const next = Math.max(1, Math.min(4, scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15))); const rect = event.currentTarget.getBoundingClientRect(); const cx = event.clientX - rect.left - rect.width / 2; const cy = event.clientY - rect.top - rect.height / 2; setOffset(next === 1 ? { x: 0, y: 0 } : { x: cx - (cx - offset.x) * next / scale, y: cy - (cy - offset.y) * next / scale }); setScale(next); };
  const changeSource = (next: 'shop' | 'product') => { setSource(next); setScale(1); setOffset({ x: 0, y: 0 }); setBroken(false); setHintVisible(true); };
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [close]);
  useEffect(() => { if (!hintVisible) return; const timer = window.setTimeout(() => setHintVisible(false), 2200); return () => window.clearTimeout(timer); }, [hintVisible]);
  return <div className="offers-lightbox" role="dialog" aria-modal="true" aria-label="Xem ảnh lớn" onClick={close}>
    <div className="offers-lightbox-bar" onClick={event => event.stopPropagation()}><div className="offers-lightbox-tabs"><button aria-pressed={source === 'shop'} onClick={() => changeSource('shop')}>Ảnh của {offer.partnerShopName || 'cửa hàng'}</button><button aria-pressed={source === 'product'} onClick={() => changeSource('product')}>Ảnh sản phẩm chuẩn</button></div><strong>{offer.productName || `Offer #${offer.id}`}</strong><button className="offers-lightbox-close" onClick={close} aria-label="Đóng">×</button></div>
    <div className="offers-lightbox-stage" onClick={event => event.stopPropagation()} onWheel={zoom} onPointerDown={event => { drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y, moved: false, onImage: event.target instanceof HTMLImageElement }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (!drag.current) return; const dx = event.clientX - drag.current.x; const dy = event.clientY - drag.current.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true; if (scale > 1) setOffset({ x: drag.current.ox + dx, y: drag.current.oy + dy }); }} onPointerUp={event => { const gesture = drag.current; drag.current = null; if (!gesture || gesture.moved) return; if (!gesture.onImage) close(); else { const next = scale > 1 ? 1 : 2; setScale(next); if (next === 1) setOffset({ x: 0, y: 0 }); } }}>
      {url && !broken ? <img src={url} alt={offer.productName || ''} draggable="false" onError={() => setBroken(true)} style={{ transform: `translate(${offset.x}px,${offset.y}px) scale(${scale})` }} /> : <span>{source === 'shop' ? 'Cửa hàng chưa cung cấp ảnh cho offer này.' : 'Chưa có ảnh sản phẩm chuẩn.'}</span>}
    </div><div className="offers-zoom-badge">{Math.round(scale * 100)}%</div>{hintVisible && <p className="offers-zoom-hint">Cuộn để phóng to tại con trỏ · kéo để di chuyển · bấm để chuyển 100% / 200%</p>}
  </div>;
}

export function OffersPage({ requestAdmin, permissions = ['offers.read', 'offers.update'] }: { requestAdmin: AdminRequest; permissions?: string[] }) {
  const canUpdate = permissions.includes('offers.update');
  const [offers, setOffers] = useState<AdminOffer[]>([]); const [totalItems, setTotalItems] = useState(0); const [counts, setCounts] = useState({ all: 0, outlier: 0, stale: 0, out_of_stock: 0, inactive: 0 });
  const [shopOptions, setShopOptions] = useState<PartnerShop[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [reload, setReload] = useState(0);
  const [search, setSearch] = useState(''); const [shopId, setShopId] = useState(''); const [filter, setFilter] = useState<OfferFilter>('all');
  const [sort, setSort] = useState<OfferSort>('attention'); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [menuId, setMenuId] = useState<number | null>(null); const [detail, setDetail] = useState<AdminOffer | null>(null); const [zoom, setZoom] = useState<AdminOffer | null>(null);
  const [toast, setToast] = useState('');
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError('');
    getAdminOffers(requestAdmin, { page, pageSize, q: search, shopId: shopId ? Number(shopId) : null, filter, sort }, controller.signal)
      .then(result => { setOffers(result.items || []); setTotalItems(result.totalItems); setCounts(result.counts); })
      .catch(reason => { if (reason instanceof DOMException && reason.name === 'AbortError') return; setOffers([]); setError(reason instanceof Error ? reason.message : 'Không thể tải offers.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, page, pageSize, search, shopId, filter, sort, reload]);
  useEffect(() => {
    const controller = new AbortController();
    getPartnerShops(requestAdmin, 1, 100, controller.signal).then(result => setShopOptions(result.items)).catch(() => setShopOptions([]));
    return () => controller.abort();
  }, [requestAdmin]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3000); return () => window.clearTimeout(timer); }, [toast]);
  const shops = useMemo(() => {
    const options = new Map(shopOptions.filter(shop => Boolean(shop.name)).map(shop => [shop.id, shop.name]));
    offers.forEach(offer => options.set(offer.partnerShopId, offer.partnerShopName || options.get(offer.partnerShopId) || `Cửa hàng #${offer.partnerShopId}`));
    return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  }, [offers, shopOptions]);
  const maxPage = Math.max(1, Math.ceil(totalItems / pageSize));
  const refresh = useCallback(() => setReload(value => value + 1), []);
  const act = async (offer: AdminOffer, action: 'toggle' | 'outlier') => {
    setMenuId(null);
    const isOutlier = action === 'outlier' ? !offer.isOutlier : offer.isOutlier;
    const reason = action === 'outlier' && isOutlier
      ? window.prompt('Lý do đánh dấu giá bất thường (không bắt buộc):', offer.outlierReason || '')?.trim() || null
      : null;
    const patch = { priceVnd: offer.priceVnd, url: offer.url, isActive: action === 'toggle' ? !offer.isActive : offer.isActive, isOutlier };
    try {
      await updateAdminOffer(requestAdmin, offer.id, patch);
      if (action === 'outlier') await updateAdminOfferOutlierReason(requestAdmin, offer.id, isOutlier ? reason : null);
      setToast(action === 'toggle' ? (offer.isActive ? 'Đã ẩn offer.' : 'Đã hiển thị offer.') : offer.isOutlier ? 'Đã bỏ đánh dấu giá bất thường.' : 'Đã đánh dấu giá bất thường.'); refresh();
    }
    catch (reason) { setToast(reason instanceof Error ? reason.message : 'Không thể cập nhật offer.'); refresh(); }
  };

  return <div className="offers-page offers-redesign">
    <div className="page-header"><div><span className="eyebrow">Catalog &amp; Pricing</span><h1>Offers &amp; Prices</h1><p>Giá từng cửa hàng đang bán cho từng sản phẩm. Dùng bộ lọc nhanh để xem giá bất thường, dữ liệu cũ hoặc hàng hết kho.</p></div></div>
    <div className="offers-chips" role="group" aria-label="Bộ lọc nhanh">{filters.map(item => <button key={item.key} className={`offers-chip${item.key !== 'all' && item.key !== 'inactive' && counts[item.key] > 0 ? ' attention' : ''}`} aria-pressed={filter === item.key} onClick={() => { setFilter(item.key); setPage(1); }}>{item.label}<span>{counts[item.key]}</span></button>)}</div>
    <div className="toolbar offers-toolbar" role="search"><label className="toolbar-search"><span aria-hidden="true">⌕</span><input aria-label="Tìm offer" type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm theo tên sản phẩm, cửa hàng hoặc mã SKU..." /></label>
      <select aria-label="Lọc theo cửa hàng" value={shopId} onChange={event => { setShopId(event.target.value); setPage(1); }}><option value="">Tất cả cửa hàng</option>{shops.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <select aria-label="Sắp xếp" value={sort} onChange={event => { setSort(event.target.value as OfferSort); setPage(1); }}><option value="attention">Cần xem trước</option><option value="oldest">Cập nhật cũ nhất</option><option value="priceAsc">Giá thấp đến cao</option><option value="priceDesc">Giá cao đến thấp</option><option value="name">Tên sản phẩm A–Z</option></select>
    </div>
    {error && <div className="banned-alert" role="alert">{error}<button className="outline-button small" onClick={refresh}>Thử lại</button></div>}
    <section className="panel offers-grid-panel" aria-label="Danh sách Offers & Prices">
      {loading ? <div className="offers-redesign-state" role="status">Đang tải offers…</div> : !error && offers.length === 0 ? <div className="offers-redesign-state"><strong>Không có offer nào khớp bộ lọc</strong><span>Thử bỏ bớt bộ lọc hoặc đổi từ khoá tìm kiếm.</span><button className="outline-button small" onClick={() => { setFilter('all'); setSearch(''); setShopId(''); }}>Bỏ bộ lọc</button></div> : !error && <>
        <div className="offers-table-scroll"><table className="offers-redesign-table"><thead><tr><th>Sản phẩm</th><th>Cửa hàng</th><th className="align-right">Giá bán</th><th>So với giá thấp nhất</th><th>Kho</th><th>Trạng thái</th><th>Cập nhật</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{offers.map(offer => {
          const age = ageLabel(offer.updatedAtUtc); const stock = stockLabels[offer.stockStatus] || stockLabels.unknown; const low = offer.lowestPriceVnd !== null && offer.priceVnd === offer.lowestPriceVnd && offer.isActive && offer.stockStatus === 'in_stock' && !offer.isOutlier;
          return <tr key={offer.id} className={!offer.isActive ? 'is-hidden' : ''} onClick={() => setDetail(offer)}>
            <td><div className="offers-product-cell"><OfferImage offer={offer} open={() => setZoom(offer)} /><span><b>{offer.productName || `Sản phẩm #${offer.productId}`}</b><small>SKU {offer.externalSku || '—'} · Offer #{offer.id}</small></span></div></td>
            <td><b>{offer.partnerShopName || `Cửa hàng #${offer.partnerShopId}`}</b></td><td className="align-right"><strong className="offers-price">{cash(offer.priceVnd)}</strong>{offer.originalPriceVnd !== null && <small className="offers-original-price">{cash(offer.originalPriceVnd)}</small>}</td>
            <td>{offer.isOutlier ? <><span className="offers-pill warn">Giá bất thường</span>{offer.outlierDeviationPercent !== null && <small className="offers-delta-detail">{offer.outlierDeviationPercent > 0 ? '+' : ''}{offer.outlierDeviationPercent.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% so với trung bình {cash(offer.otherOffersAveragePriceVnd)}</small>}{offer.outlierReason && <small className="offers-delta-detail">{offer.outlierReason}</small>}</> : offer.lowestPriceVnd === null ? <span className="offers-pill neutral">Chưa có giá để so</span> : low ? <span className="offers-pill ok">Thấp nhất</span> : <span className="offers-delta">{offer.deltaVnd !== null && offer.deltaVnd > 0 ? '+' : ''}{cash(offer.deltaVnd)}<small>{offer.deltaPercent !== null ? `${offer.deltaPercent > 0 ? '+' : ''}${offer.deltaPercent.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% so với thấp nhất` : 'so với thấp nhất'}</small></span>}</td>
            <td><span className={`offers-pill ${stock[1]}`}>{stock[0]}</span></td><td><span className={`offers-pill ${offer.isActive ? 'ok' : 'bad'}`}>{offer.isActive ? 'Hiển thị' : 'Ẩn'}</span></td><td><span className={`offers-age${age.stale ? ' stale' : ''}`}>{age.text}{age.stale && <small>Lâu chưa cập nhật</small>}</span></td>
            <td className="offers-actions" onClick={event => event.stopPropagation()}><button className="offers-kebab" aria-label={`Thao tác cho offer ${offer.id}`} aria-expanded={menuId === offer.id} onClick={() => setMenuId(menuId === offer.id ? null : offer.id)}>⋮</button>{menuId === offer.id && <div className="offers-menu" role="menu"><button role="menuitem" onClick={() => { setDetail(offer); setMenuId(null); }}>Xem so sánh giá và lịch sử</button>{safeHref(offer.url) && <a role="menuitem" href={safeHref(offer.url)!} target="_blank" rel="noreferrer">Mở trang trên cửa hàng ↗</a>}<a role="menuitem" href={`/products/${offer.productId}`}>Mở sản phẩm trong Products</a>{canUpdate && <><hr /><button role="menuitem" onClick={() => void act(offer, 'toggle')}>{offer.isActive ? 'Ẩn khỏi trang so sánh' : 'Hiển thị lại trên trang so sánh'}</button><button role="menuitem" onClick={() => void act(offer, 'outlier')}>{offer.isOutlier ? 'Bỏ đánh dấu giá bất thường' : 'Đánh dấu giá bất thường'}</button></>}</div>}</td>
          </tr>;
        })}</tbody></table></div>
        <div className="offers-footer"><div className="offers-footer-left"><select aria-label="Số dòng mỗi trang" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 dòng</option><option value={20}>20 dòng</option><option value={50}>50 dòng</option></select><span className="offers-total">Tổng <b>{totalItems}</b></span></div><span className="offers-range">{totalItems === 0 ? '0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalItems)}`} / {totalItems}</span><div className="offers-page-control"><button aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>‹</button><span>Trang {page} / {maxPage}</span><button aria-label="Trang tiếp" disabled={page >= maxPage} onClick={() => setPage(value => Math.min(maxPage, value + 1))}>›</button></div></div>
      </>}
    </section>
    <div className="offers-legend"><span><b>Giá bất thường</b>: giá bị admin đánh dấu và không được dùng để tính giá thấp nhất.</span><span><b>Ẩn</b>: offer không hiển thị trên trang so sánh của khách.</span></div>
    {detail && <PriceDrawer offer={detail} requestAdmin={requestAdmin} close={() => setDetail(null)} />}
    {zoom && <ImageLightbox offer={zoom} close={() => setZoom(null)} />}
    {toast && <div className="offers-toast" role="status">{toast}</div>}
  </div>;
}
