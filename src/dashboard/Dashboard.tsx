import { useEffect, useState } from 'react';
import { getAdminProducts } from '../products/products-api';
import { getAdminOffers, type AdminOfferPage } from '../offers/offers-api';
import { Button, Card, PageHeader } from '../ui';
import './dashboard.css';

function DashboardKpi({ label, value, change, tone, onRetry }: { label: string; value: string; change: string; tone: string; onRetry?: () => void }) {
  const icon = tone === 'orange' ? '▦' : tone === 'green' ? '↗' : tone === 'blue' ? '⌂' : '◷';
  return <Card as="article" className="dashboard-kpi">
    <span className={`dashboard-kpi-icon ${tone}`} aria-hidden="true">{icon}</span>
    <span className="dashboard-kpi-label">{label}</span>
    <strong>{value}</strong>
    <small className={change.startsWith('+') ? 'positive' : change.startsWith('-') ? 'negative' : ''}>{change}</small>
    {onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}
  </Card>;
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

  return <div className="studio-dashboard">
    <PageHeader eyebrow="OVERVIEW" title="Dashboard" description="Tổng quan sức khỏe catalog, giá và affiliate data."
      actions={<Button tone="primary">+ Tạo sản phẩm</Button>} />

    <section className="dashboard-kpi-grid" aria-label="Chỉ số tổng quan">
      <DashboardKpi label="Products total" value={productsLoading || productsError ? '—' : (productTotal ?? 0).toLocaleString()} change={productsLoading ? 'Loading…' : productsError ? 'Unavailable' : productTotal === 0 ? 'No products found' : 'All catalog products'} tone="orange" />
      <DashboardKpi label="Offers active" value={offersLoading || offersError ? '—' : (activeOffers ?? 0).toLocaleString()} change={offersLoading ? 'Loading…' : offersError ? 'Unavailable' : offersData?.totalItems === 0 ? 'No offers found' : `of ${(offersData?.totalItems ?? 0).toLocaleString()} offers`} tone="green" onRetry={offersError ? () => setOffersReload(value => value + 1) : undefined} />
      <DashboardKpi label="Partner shops" value="24" change="+3 shop mới" tone="blue" />
      <DashboardKpi label="Sync success rate" value="98.2%" change="-1.1% trong 24 giờ" tone="purple" />
    </section>

    {productsLoading ? <span className="sr-only" role="status">Loading products…</span> : productsError ? <div className="dashboard-error" role="alert">{productsError}<Button size="sm" onClick={() => setProductsReload(value => value + 1)}>Retry products</Button></div> : null}
    {offersError ? <span className="sr-only" role="alert">{offersError}</span> : null}
  </div>;
}
