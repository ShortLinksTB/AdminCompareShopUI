import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { matchingQueue, type Status } from '../mockData';
import { getAdminProducts } from '../products/products-api';
import { getAllAdminOffers, type AdminOffer } from '../offers/offers-api';

const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

function DashboardPageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) { return <div className="page-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>; }
function DashboardKpi({ label, value, change, tone }: { label: string; value: string; change: string; tone: string }) { return <article className="kpi-card"><div className={`kpi-icon ${tone}`}>{tone === 'orange' ? '▦' : tone === 'green' ? '↗' : tone === 'blue' ? '⌂' : '◷'}</div><span>{label}</span><strong>{value}</strong><small className={change.startsWith('+') ? 'positive' : change.startsWith('-') ? 'negative' : ''}>{change}</small></article>; }
function DashboardStatusBadge({ status }: { status: Status }) { return <span className={`status status-${status.toLowerCase()}`}>{status}</span>; }

export function Dashboard({ requestAdmin, permissions }: { requestAdmin: (path: string, init?: RequestInit) => Promise<Response>; permissions: string[] }) {
  const [productTotal, setProductTotal] = useState<number | null>(null);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [productsReload, setProductsReload] = useState(0);
  const [offersData, setOffersData] = useState<AdminOffer[] | null>(null);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError] = useState('');
  const [offersReload, setOffersReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setProductsLoading(true);
    setProductsError('');
    setProductTotal(null);
    if (!permissions.includes('products.read')) {
      setProductsError('You do not have permission to view products.');
      setProductsLoading(false);
      return () => controller.abort();
    }
    getAdminProducts(requestAdmin, 1, 20, controller.signal)
      .then(result => { if (!controller.signal.aborted) setProductTotal(result.totalItems); })
      .catch(reason => { if (!controller.signal.aborted) setProductsError(reason instanceof Error ? reason.message : 'Could not load products. Please try again.'); })
      .finally(() => { if (!controller.signal.aborted) setProductsLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, permissions, productsReload]);

  useEffect(() => {
    const controller = new AbortController();
    setOffersLoading(true);
    setOffersError('');
    setOffersData(null);
    if (!permissions.includes('offers.read')) {
      setOffersError('You do not have permission to view offers.');
      setOffersLoading(false);
      return () => controller.abort();
    }
    getAllAdminOffers(requestAdmin, controller.signal)
      .then(result => { if (!controller.signal.aborted) setOffersData(result); })
      .catch(reason => { if (!controller.signal.aborted) setOffersError(reason instanceof Error ? reason.message : 'Could not load offers. Please try again.'); })
      .finally(() => { if (!controller.signal.aborted) setOffersLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, permissions, offersReload]);

  const activeOffers = offersData?.filter(offer => offer.isActive).length;
  const outlierCount = offersData?.filter(offer => offer.isOutlier).length;
  const retry = (type: 'products' | 'offers') => type === 'products'
    ? setProductsReload(value => value + 1)
    : setOffersReload(value => value + 1);

  return <><DashboardPageHeader eyebrow="OVERVIEW" title="Dashboard" description="Tổng quan sức khỏe catalog, giá và affiliate data." action={<button className="primary-button">+ Tạo sản phẩm</button>} /><div className="kpi-grid">
    <DashboardKpi label="Products total" value={productsLoading || productsError ? '—' : (productTotal ?? 0).toLocaleString()} change={productsLoading ? 'Loading…' : productsError ? 'Unavailable' : productTotal === 0 ? 'No products found' : 'All catalog products'} tone="orange" />
    <DashboardKpi label="Offers active" value={offersLoading || offersError ? '—' : (activeOffers ?? 0).toLocaleString()} change={offersLoading ? 'Loading…' : offersError ? 'Unavailable' : `of ${(offersData ?? []).length.toLocaleString()} offers`} tone="green" />
    <DashboardKpi label="Partner shops" value="24" change="+3 shop mới" tone="blue" /><DashboardKpi label="Sync success rate" value="98.2%" change="-1.1% trong 24 giờ" tone="purple" />
  </div><div className="dashboard-grid"><section className="panel chart-panel"><div className="panel-heading"><div><h2>Traffic & affiliate clicks</h2><p>30 ngày gần nhất</p></div><select><option>30 ngày</option><option>7 ngày</option><option>90 ngày</option></select></div><div className="chart-legend"><span><i className="legend orange"></i>Product views</span><span><i className="legend purple"></i>Affiliate clicks</span></div><div className="line-chart"><div className="chart-y"><span>12k</span><span>8k</span><span>4k</span><span>0</span></div><svg viewBox="0 0 600 190" preserveAspectRatio="none" aria-label="Traffic chart"><path className="area" d="M0 160 C55 135 60 148 105 110 S170 120 210 92 S270 120 315 75 S380 98 420 55 S490 100 540 40 S575 55 600 25 L600 190 L0 190Z" /><path className="line orange-line" d="M0 160 C55 135 60 148 105 110 S170 120 210 92 S270 120 315 75 S380 98 420 55 S490 100 540 40 S575 55 600 25" /><path className="line purple-line" d="M0 175 C55 160 70 168 105 145 S175 150 210 125 S275 145 315 110 S380 130 420 92 S490 128 540 78 S575 100 600 65" /></svg></div></section><section className="panel health-panel"><div className="panel-heading"><div><h2>Data health</h2><p>Tình trạng pipeline hiện tại</p></div><button className="icon-button">•••</button></div><div className="health-score"><div className="score-ring"><strong>96<span>%</span></strong></div><div><strong>Healthy</strong><p>Không có incident nghiêm trọng</p></div></div><div className="health-list"><span><i className="dot green"></i>Sources đang hoạt động <b>18/20</b></span><span><i className="dot orange"></i>Offers flagged as outlier <b>{offersLoading ? '…' : offersError ? '—' : (outlierCount ?? 0).toLocaleString()}</b></span><span><i className="dot red"></i>Sync jobs lỗi <b>3</b></span></div></section></div><div className="dashboard-grid lower"><section className="panel"><div className="panel-heading"><div><h2>Offers flagged as outlier</h2><p>{outlierCount === undefined ? 'Outlier flag summary from available offers.' : `${outlierCount} offers flagged as outliers.`}</p></div><NavLink to="/offers">Xem tất cả →</NavLink></div>
    {offersLoading ? <div className="offers-state" role="status">Loading offers…</div> : offersError ? <div className="banned-alert" role="alert">{offersError}<button className="outline-button small" type="button" onClick={() => retry('offers')}>Retry</button></div> : offersData?.length === 0 ? <div className="offers-state" role="status"><strong>No offers found</strong><span>Offers will appear here when available.</span></div> : <DashboardOffersTable offers={(offersData ?? []).filter(offer => offer.isOutlier).slice(0, 3)} />}
  </section><section className="panel"><div className="panel-heading"><div><h2>Matching queue</h2><p>Listing đang chờ admin review</p></div><NavLink to="/matching">Xem tất cả →</NavLink></div><div className="queue-list">{matchingQueue.map(item => <div className="queue-item" key={item.id}><span className="queue-avatar">{item.shop.slice(0, 1)}</span><span><strong>{item.listing}</strong><small>{item.shop} · Match {item.confidence}%</small></span><DashboardStatusBadge status="Pending" /></div>)}</div></section></div>
    {productsLoading ? <span className="sr-only" role="status">Loading products…</span> : productsError ? <div className="banned-alert" role="alert">{productsError}<button className="outline-button small" type="button" onClick={() => retry('products')}>Retry products</button></div> : null}
  </>;
}
function DashboardOffersTable({ offers }: { offers: AdminOffer[] }) { return offers.length === 0 ? <div className="offers-state" role="status"><strong>No flagged offers</strong><span>Offers flagged as outliers will appear here.</span></div> : <div className="offer-table-wrap offers-table-wrap"><table><thead><tr><th>Offer / product ID</th><th>Partner shop ID</th><th>Price</th><th>Active</th><th>Outlier</th></tr></thead><tbody>{offers.map(offer => <tr key={offer.id}><td><strong>{offer.id}</strong><small>Product ID {offer.productId}</small></td><td>{offer.partnerShopId}</td><td><strong className="money">{money(offer.priceVnd)}</strong></td><td><span className={`status ${offer.isActive ? 'status-active' : 'status-disabled'}`}>{offer.isActive ? 'Active' : 'Inactive'}</span></td><td><span className="status status-outlier">Outlier</span></td></tr>)}</tbody></table></div>; }
