import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { matchingQueue, type Status } from '../mockData';
import { getAdminProducts } from '../products/products-api';
import { getAdminOffers, type AdminOffer, type AdminOfferPage } from '../offers/offers-api';
import { Button, Card, DataTable, PageHeader, Pill, Select } from '../ui';
import './dashboard.css';

const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

function DashboardKpi({ label, value, change, tone }: { label: string; value: string; change: string; tone: string }) {
  const icon = tone === 'orange' ? '▦' : tone === 'green' ? '↗' : tone === 'blue' ? '⌂' : '◷';
  return <Card as="article" className="dashboard-kpi">
    <span className={`dashboard-kpi-icon ${tone}`} aria-hidden="true">{icon}</span>
    <span className="dashboard-kpi-label">{label}</span>
    <strong>{value}</strong>
    <small className={change.startsWith('+') ? 'positive' : change.startsWith('-') ? 'negative' : ''}>{change}</small>
  </Card>;
}

function DashboardStatusBadge({ status }: { status: Status }) {
  return <Pill tone="warn" size="sm">{status}</Pill>;
}

export function Dashboard({ requestAdmin, permissions }: { requestAdmin: (path: string, init?: RequestInit) => Promise<Response>; permissions: string[] }) {
  const [productTotal, setProductTotal] = useState<number | null>(null);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [productsReload, setProductsReload] = useState(0);
  const [offersData, setOffersData] = useState<AdminOfferPage | null>(null);
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
    getAdminOffers(requestAdmin, { page: 1, pageSize: 100, q: '', shopId: null, filter: 'all', sort: 'attention' }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setOffersData(result); })
      .catch(reason => { if (!controller.signal.aborted) setOffersError(reason instanceof Error ? reason.message : 'Could not load offers. Please try again.'); })
      .finally(() => { if (!controller.signal.aborted) setOffersLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, permissions, offersReload]);

  const activeOffers = offersData ? offersData.totalItems - offersData.counts.inactive : undefined;
  const outlierCount = offersData?.counts.outlier;
  const retry = (type: 'products' | 'offers') => type === 'products'
    ? setProductsReload(value => value + 1)
    : setOffersReload(value => value + 1);

  return <div className="studio-dashboard">
    <PageHeader eyebrow="OVERVIEW" title="Dashboard" description="Tổng quan sức khỏe catalog, giá và affiliate data."
      actions={<Button tone="primary">+ Tạo sản phẩm</Button>} />

    <section className="dashboard-kpi-grid" aria-label="Chỉ số tổng quan">
      <DashboardKpi label="Products total" value={productsLoading || productsError ? '—' : (productTotal ?? 0).toLocaleString()} change={productsLoading ? 'Loading…' : productsError ? 'Unavailable' : productTotal === 0 ? 'No products found' : 'All catalog products'} tone="orange" />
      <DashboardKpi label="Offers active" value={offersLoading || offersError ? '—' : (activeOffers ?? 0).toLocaleString()} change={offersLoading ? 'Loading…' : offersError ? 'Unavailable' : `of ${(offersData?.totalItems ?? 0).toLocaleString()} offers`} tone="green" />
      <DashboardKpi label="Partner shops" value="24" change="+3 shop mới" tone="blue" />
      <DashboardKpi label="Sync success rate" value="98.2%" change="-1.1% trong 24 giờ" tone="purple" />
    </section>

    <section className="dashboard-grid dashboard-grid-top">
      <Card className="dashboard-panel dashboard-chart-panel">
        <div className="dashboard-panel-heading"><div><h2>Traffic &amp; affiliate clicks</h2><p>30 ngày gần nhất</p></div><Select aria-label="Khoảng thời gian" defaultValue="30 ngày"><option>30 ngày</option><option>7 ngày</option><option>90 ngày</option></Select></div>
        <div className="dashboard-chart-legend" aria-label="Chú giải"><span><i className="views-dot" />Product views</span><span><i className="clicks-dot" />Affiliate clicks</span></div>
        <div className="dashboard-chart" role="img" aria-label="Biểu đồ lượt xem và lượt click theo ngày, 30 ngày gần nhất">
          <div className="dashboard-chart-ticks" aria-hidden="true"><span>12k</span><span>8k</span><span>4k</span><span>0</span></div>
          <div className="dashboard-chart-plot"><svg viewBox="0 0 600 170" preserveAspectRatio="none" aria-hidden="true">
            <path className="dashboard-line views-line" d="M0 145 C55 125 65 138 105 102 S170 112 210 84 S270 110 315 67 S380 91 420 49 S490 91 540 34 S575 50 600 20"><title>Product views · 12,480</title></path>
            <path className="dashboard-line clicks-line" d="M0 158 C55 145 65 153 105 127 S170 139 210 111 S270 131 315 98 S380 116 420 82 S490 112 540 66 S575 87 600 54"><title>Affiliate clicks · 8,420</title></path>
            <circle cx="420" cy="49" r="5" className="dashboard-chart-marker"><title>Product views · 9,200</title></circle>
          </svg><div className="dashboard-chart-xlabels"><span>Oct 17</span><span>Oct 24</span><span>Oct 31</span><span>Nov 7</span><span>Nov 13</span></div></div>
        </div>
        <details className="dashboard-alternate-data"><summary>Bảng dữ liệu thay thế cho biểu đồ</summary>
          <DataTable><thead><tr><th>Ngày</th><th>Product views</th><th>Affiliate clicks</th></tr></thead><tbody>
            <tr><td>17/10/2026</td><td>6,840 lượt xem</td><td>4,120 lượt click</td></tr>
            <tr><td>31/10/2026</td><td>9,200 lượt xem</td><td>6,480 lượt click</td></tr>
            <tr><td>13/11/2026</td><td>12,480 lượt xem</td><td>8,420 lượt click</td></tr>
          </tbody></DataTable>
        </details>
      </Card>

      <Card className="dashboard-panel dashboard-health-panel">
        <div className="dashboard-panel-heading"><div><h2>Data health</h2><p>Tình trạng pipeline hiện tại</p></div><Button aria-label="Thao tác khác" tone="ghost">•••</Button></div>
        <div className="dashboard-health-score"><div className="dashboard-score-ring" aria-label="Health score 96 phần trăm"><strong>96<span>%</span></strong></div><div><strong>Healthy</strong><p>Không có incident nghiêm trọng</p></div></div>
        <div className="dashboard-health-list"><div><i className="health-dot healthy" />Sources đang hoạt động<strong>18/20</strong></div><div><i className="health-dot warning" />Offers flagged as outlier<strong>{offersLoading ? '…' : offersError ? '—' : (outlierCount ?? 0).toLocaleString()}</strong></div><div><i className="health-dot danger" />Sync jobs lỗi<strong>3</strong></div></div>
      </Card>
    </section>

    <section className="dashboard-grid dashboard-grid-lower">
      <Card className="dashboard-panel dashboard-outlier-panel">
        <div className="dashboard-panel-heading dashboard-outlier-heading"><div><h2>Offers flagged as outlier</h2><p>{outlierCount === undefined ? 'Outlier flag summary from available offers.' : `${outlierCount} offers flagged as outliers.`}</p></div><NavLink to="/offers">Xem tất cả →</NavLink></div>
        <div className="dashboard-outlier-content">
          {offersLoading ? <div className="dashboard-offers-state" role="status">Loading offers…</div> : offersError ? <div className="dashboard-error" role="alert">{offersError}<Button size="sm" onClick={() => retry('offers')}>Retry</Button></div> : offersData?.totalItems === 0 ? <div className="dashboard-offers-state" role="status"><strong>No offers found</strong><span>Offers will appear here when available.</span></div> : <DashboardOffersTable offers={(offersData?.items ?? []).filter(offer => offer.isOutlier).slice(0, 3)} />}
        </div>
      </Card>
      <Card className="dashboard-panel">
        <div className="dashboard-panel-heading"><div><h2>Matching queue</h2><p>Listing đang chờ admin review</p></div><NavLink to="/matching">Xem tất cả →</NavLink></div>
        <div className="dashboard-queue-list">{matchingQueue.map(item => <div className="dashboard-queue-item" key={item.id}><span className="dashboard-queue-avatar">{item.shop.slice(0, 1)}</span><span><strong>{item.listing}</strong><small>{item.shop} · Match {item.confidence}%</small></span><DashboardStatusBadge status="Pending" /></div>)}</div>
      </Card>
    </section>

    {productsLoading ? <span className="sr-only" role="status">Loading products…</span> : productsError ? <div className="dashboard-error dashboard-product-error" role="alert">{productsError}<Button size="sm" onClick={() => retry('products')}>Retry products</Button></div> : null}
  </div>;
}

function DashboardOffersTable({ offers }: { offers: AdminOffer[] }) {
  return offers.length === 0 ? <div className="dashboard-offers-state" role="status"><strong>No flagged offers</strong><span>Offers flagged as outliers will appear here.</span></div> : <DataTable className="dashboard-offer-table"><thead><tr><th>Offer / product ID</th><th>Partner shop ID</th><th>Price</th><th>Active</th><th>Outlier</th></tr></thead><tbody>{offers.map(offer => <tr key={offer.id}><td><strong>{offer.id}</strong><small>Product ID {offer.productId}</small></td><td>{offer.partnerShopId}</td><td><strong className="dashboard-money">{money(offer.priceVnd)}</strong></td><td><Pill tone={offer.isActive ? 'ok' : 'bad'} size="sm">{offer.isActive ? 'Active' : 'Inactive'}</Pill></td><td><Pill tone="warn" size="sm">Outlier</Pill></td></tr>)}</tbody></DataTable>;
}
