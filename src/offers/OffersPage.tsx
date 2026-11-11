import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminOffer, AdminRequest, OfferFilter, OfferSort, PriceHistoryPoint } from './offers-api';
import { getAdminOffers, getAdminProductOffers, getOfferPriceHistory, updateAdminOffer, updateAdminOfferOutlierReason } from './offers-api';
import { getPartnerShops, type PartnerShop } from '../shopsApi';
import { Button, Card, DataTable, Drawer, EmptyState, ErrorState, FilterChips, Lightbox, Loading, PageHeader, Pager, Pill, RowMenu, SearchField, Select, TableFooter, Toast, Toolbar } from '../ui';
import './offers.css';

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
  return <Drawer open onClose={close} title="Chi tiết offer">
      <div className="offers-drawer-body">
        <header className="offers-drawer-head"><span className="offers-drawer-shop">{offer.partnerShopName || `Cửa hàng #${offer.partnerShopId}`}</span><h2>{offer.productName || `Sản phẩm #${offer.productId}`}</h2><small>SKU {offer.externalSku || '—'} · Offer #{offer.id}</small></header>
        <section><h3>Tóm tắt giá</h3><div className="offers-facts"><div><span>Giá hiện tại</span><b>{cash(offer.priceVnd)}</b></div><div><span>Giá gốc</span><b>{cash(offer.originalPriceVnd)}</b></div><div><span>Giá thấp nhất</span><b>{cash(offer.lowestPriceVnd)}</b></div><div><span>Cập nhật gần nhất</span><b>{ageLabel(offer.updatedAtUtc).text}</b></div></div></section>
        <section><h3>Lịch sử giá · 30 ngày</h3>{loading ? <div className="offers-inline-state" role="status">Đang tải lịch sử…</div> : error ? <div className="offers-inline-error" role="alert">{error}</div> : <PriceChart points={points} />}</section>
        <section><h3>So sánh cửa hàng · cùng sản phẩm</h3>{peersLoading ? <div className="offers-inline-state" role="status">Đang tải so sánh…</div> : peersError ? <div className="offers-inline-error" role="alert">{peersError}</div> : peers.length === 0 ? <p className="offers-note">Chưa có dữ liệu so sánh cho sản phẩm này.</p> : <ul className="offers-peer-list">{peers.map(peer => <li key={peer.id} className={peer.id === offer.id ? 'current' : ''}><span className="offers-peer-name">{peer.partnerShopName || `Cửa hàng #${peer.partnerShopId}`}<small>{peer.id === offer.id ? 'Đang xem' : peer.isActive ? 'Hiển thị' : 'Đang ẩn'}{peer.isOutlier ? ' · Giá bất thường' : ''}</small></span><b>{cash(peer.priceVnd)}{peer.lowestPriceVnd === peer.priceVnd && peer.isActive && peer.stockStatus === 'in_stock' ? <small className="offers-lowest-label">Thấp nhất</small> : null}</b><span className="offers-peer-bar"><i style={{ width: `${Math.max(4, peer.priceVnd / max * 100)}%` }} /></span></li>)}</ul>}</section>
        {offer.isOutlier && offer.outlierReason && <section><h3>Lý do đánh dấu</h3><p className="offers-note">{offer.outlierReason}</p></section>}
      </div>
  </Drawer>;
}

function ImageLightbox({ offer, close }: { offer: AdminOffer; close: () => void }) {
  const [source, setSource] = useState<'shop' | 'product'>('shop');
  const [broken, setBroken] = useState(false);
  const url = source === 'shop' ? offer.imageUrl : offer.productImageUrl;
  const toolbar = <><div className="offers-lightbox-tabs"><Button tone="ghost" aria-pressed={source === 'shop'} onClick={() => { setSource('shop'); setBroken(false); }}>{`Ảnh của ${offer.partnerShopName || 'cửa hàng'}`}</Button><Button tone="ghost" aria-pressed={source === 'product'} onClick={() => { setSource('product'); setBroken(false); }}>Ảnh sản phẩm chuẩn</Button></div><strong>{offer.productName || `Offer #${offer.id}`}</strong></>;
  return <Lightbox open onClose={close} label="Xem ảnh lớn" className="offers-image-lightbox" toolbar={toolbar} clickZoom resetKey={source}>
    {url && !broken ? <img src={url} alt={offer.productName || ''} draggable="false" onError={() => setBroken(true)} /> : <span>{source === 'shop' ? 'Cửa hàng chưa cung cấp ảnh cho offer này.' : 'Chưa có ảnh sản phẩm chuẩn.'}</span>}
  </Lightbox>;
}

export function OffersPage({ requestAdmin, permissions = ['offers.read', 'offers.update'] }: { requestAdmin: AdminRequest; permissions?: string[] }) {
  const canUpdate = permissions.includes('offers.update');
  const [offers, setOffers] = useState<AdminOffer[]>([]); const [totalItems, setTotalItems] = useState(0); const [counts, setCounts] = useState({ all: 0, outlier: 0, stale: 0, outOfStock: 0, inactive: 0 });
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
  const countFor = (key: OfferFilter) => ({ all: counts.all, outlier: counts.outlier, stale: counts.stale, out_of_stock: counts.outOfStock, inactive: counts.inactive })[key];
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
    <PageHeader eyebrow="Catalog & Pricing" title="Offers & Prices" description="Giá từng cửa hàng đang bán cho từng sản phẩm. Dùng bộ lọc nhanh để xem giá bất thường, dữ liệu cũ hoặc hàng hết kho." />
    <FilterChips label="Bộ lọc nhanh" items={filters.map(item => ({ value: item.key, label: item.label, count: countFor(item.key) }))} value={filter} onChange={value => { setFilter(value as OfferFilter); setPage(1); }} />
    <Toolbar className="offers-toolbar" role="search"><SearchField label="Tìm offer" type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm theo tên sản phẩm, cửa hàng hoặc mã SKU..." />
      <Select aria-label="Lọc theo cửa hàng" value={shopId} onChange={event => { setShopId(event.target.value); setPage(1); }}><option value="">Tất cả cửa hàng</option>{shops.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select>
      <Select aria-label="Sắp xếp" value={sort} onChange={event => { setSort(event.target.value as OfferSort); setPage(1); }}><option value="attention">Cần xem trước</option><option value="oldest">Cập nhật cũ nhất</option><option value="priceAsc">Giá thấp đến cao</option><option value="priceDesc">Giá cao đến thấp</option><option value="name">Tên sản phẩm A–Z</option></Select>
    </Toolbar>
    <Card className="offers-grid-panel" aria-label="Danh sách Offers & Prices">
      {loading ? <Loading label="Đang tải offers" /> : error ? <ErrorState title={error}><Button size="sm" onClick={refresh}>Thử lại</Button></ErrorState> : offers.length === 0 ? <EmptyState title="Không có offer nào khớp bộ lọc">Thử bỏ bớt bộ lọc hoặc đổi từ khoá tìm kiếm.<Button size="sm" onClick={() => { setFilter('all'); setSearch(''); setShopId(''); }}>Bỏ bộ lọc</Button></EmptyState> : <>
        <DataTable className="offers-table-scroll"><thead><tr><th>Sản phẩm</th><th>Cửa hàng</th><th className="align-right">Giá bán</th><th>So với giá thấp nhất</th><th>Kho</th><th>Trạng thái</th><th>Cập nhật</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{offers.map(offer => {
          const age = ageLabel(offer.updatedAtUtc); const stock = stockLabels[offer.stockStatus] || stockLabels.unknown; const low = offer.lowestPriceVnd !== null && offer.priceVnd === offer.lowestPriceVnd && offer.isActive && offer.stockStatus === 'in_stock' && !offer.isOutlier;
          return <tr key={offer.id} tabIndex={0} className={!offer.isActive ? 'is-hidden' : ''} onClick={() => setDetail(offer)} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetail(offer); } }}>
            <td><div className="offers-product-cell"><OfferImage offer={offer} open={() => setZoom(offer)} /><span><b>{offer.productName || `Sản phẩm #${offer.productId}`}</b><small>SKU {offer.externalSku || '—'} · Offer #{offer.id}</small></span></div></td>
            <td><b>{offer.partnerShopName || `Cửa hàng #${offer.partnerShopId}`}</b></td><td className="align-right"><strong className="offers-price">{cash(offer.priceVnd)}</strong>{offer.originalPriceVnd !== null && <small className="offers-original-price">{cash(offer.originalPriceVnd)}</small>}</td>
            <td>{offer.isOutlier ? <><Pill tone="warn">Giá bất thường</Pill>{offer.outlierDeviationPercent !== null && <small className="offers-delta-detail">{offer.outlierDeviationPercent > 0 ? '+' : ''}{offer.outlierDeviationPercent.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% so với trung bình {cash(offer.otherOffersAveragePriceVnd)}</small>}{offer.outlierReason && <small className="offers-delta-detail">{offer.outlierReason}</small>}</> : offer.lowestPriceVnd === null ? <Pill tone="neutral">Chưa có giá để so</Pill> : low ? <Pill tone="ok">Thấp nhất</Pill> : <span className="offers-delta">{offer.deltaVnd !== null && offer.deltaVnd > 0 ? '+' : ''}{cash(offer.deltaVnd)}<small>{offer.deltaPercent !== null ? `${offer.deltaPercent > 0 ? '+' : ''}${offer.deltaPercent.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% so với thấp nhất` : 'so với thấp nhất'}</small></span>}</td>
            <td><Pill tone={stock[1] === 'ok' ? 'ok' : stock[1] === 'bad' ? 'bad' : 'neutral'}>{stock[0]}</Pill></td><td><Pill tone={offer.isActive ? 'ok' : 'bad'}>{offer.isActive ? 'Hiển thị' : 'Ẩn'}</Pill></td><td><span className={`offers-age${age.stale ? ' stale' : ''}`}>{age.text}{age.stale && <small>Lâu chưa cập nhật</small>}</span></td>
            <td className="offers-actions" onClick={event => event.stopPropagation()}><RowMenu open={menuId === offer.id} onOpenChange={open => setMenuId(open ? offer.id : null)} label={`Thao tác cho offer ${offer.id}`}><Button size="sm" tone="ghost" role="menuitem" onClick={() => { setDetail(offer); setMenuId(null); }}>Xem so sánh giá và lịch sử</Button>{safeHref(offer.url) && <a role="menuitem" href={safeHref(offer.url)!} target="_blank" rel="noreferrer">Mở trang trên cửa hàng ↗</a>}<a role="menuitem" href={`/products/${offer.productId}`}>Mở sản phẩm trong Products</a>{canUpdate && <><hr /><Button size="sm" tone="ghost" role="menuitem" onClick={() => void act(offer, 'toggle')}>{offer.isActive ? 'Ẩn khỏi trang so sánh' : 'Hiển thị lại trên trang so sánh'}</Button><Button size="sm" tone="ghost" role="menuitem" onClick={() => void act(offer, 'outlier')}>{offer.isOutlier ? 'Bỏ đánh dấu giá bất thường' : 'Đánh dấu giá bất thường'}</Button></>}</RowMenu></td>
          </tr>;
        })}</tbody></DataTable>
        <TableFooter start={totalItems ? (page - 1) * pageSize + 1 : 0} end={Math.min(page * pageSize, totalItems)} total={totalItems} center={<label className="offers-page-size">Số dòng <Select aria-label="Số dòng mỗi trang" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></Select> / trang</label>}><Pager page={page} pages={maxPage} onChange={setPage} /></TableFooter>
      </>}
    </Card>
    <div className="offers-legend"><span><b>Giá bất thường</b>: giá bị admin đánh dấu và không được dùng để tính giá thấp nhất.</span><span><b>Ẩn</b>: offer không hiển thị trên trang so sánh của khách.</span></div>
    {detail && <PriceDrawer offer={detail} requestAdmin={requestAdmin} close={() => setDetail(null)} />}
    {zoom && <ImageLightbox offer={zoom} close={() => setZoom(null)} />}
    {toast && <Toast onClose={() => setToast('')}>{toast}</Toast>}
  </div>;
}
