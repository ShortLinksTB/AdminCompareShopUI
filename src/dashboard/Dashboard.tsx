import { useEffect, useState } from 'react';
import { getAdminProducts } from '../products/products-api';
import { getAdminOffers, type AdminOfferPage } from '../offers/offers-api';
import { getDashboardPartnerShopTotal, getDashboardSyncJobTotals } from './dashboard-api';
import { Button, Card, PageHeader } from '../ui';
import './dashboard.css';

function DashboardKpi({ label, value, change, tone }: { label: string; value: string; change: string; tone: string }) {
  const icon = tone === 'orange' ? '▦' : tone === 'green' ? '↗' : tone === 'blue' ? '⌂' : '◷';
  return <Card as="article" className="dashboard-kpi">
    <span className={`dashboard-kpi-icon ${tone}`} aria-hidden="true">{icon}</span>
    <span className="dashboard-kpi-label">{label}</span>
    <strong>{value}</strong>
    <small className={change.startsWith('+') ? 'positive' : change.startsWith('-') ? 'negative' : ''}>{change}</small>
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
  const [shopsTotal, setShopsTotal] = useState<number | null>(null);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [shopsError, setShopsError] = useState('');
  const [shopsReload, setShopsReload] = useState(0);
  const [syncRate, setSyncRate] = useState<number | null>(null);
  const [syncHasTerminalJobs, setSyncHasTerminalJobs] = useState(false);
  const [syncLoading, setSyncLoading] = useState(true);
  const [syncError, setSyncError] = useState('');
  const [syncReload, setSyncReload] = useState(0);

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
    getAdminOffers(requestAdmin, { page: 1, pageSize: 1, q: '', shopId: null, filter: 'all', sort: 'attention' }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setOffersData(result); })
      .catch(reason => { if (!controller.signal.aborted) setOffersError(reason instanceof Error ? reason.message : 'Could not load offers. Please try again.'); })
      .finally(() => { if (!controller.signal.aborted) setOffersLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, permissions, offersReload]);

  useEffect(() => {
    const controller = new AbortController();
    setShopsLoading(true);
    setShopsError('');
    setShopsTotal(null);
    if (!permissions.includes('shops.read')) {
      setShopsError('You do not have permission to view partner shops.');
      setShopsLoading(false);
      return () => controller.abort();
    }
    getDashboardPartnerShopTotal(requestAdmin, controller.signal)
      .then(total => { if (!controller.signal.aborted) setShopsTotal(total); })
      .catch(reason => { if (!controller.signal.aborted) setShopsError(reason instanceof Error ? reason.message : 'Could not load partner shops. Please try again.'); })
      .finally(() => { if (!controller.signal.aborted) setShopsLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, permissions, shopsReload]);

  useEffect(() => {
    const controller = new AbortController();
    setSyncLoading(true);
    setSyncError('');
    setSyncRate(null);
    setSyncHasTerminalJobs(false);
    if (!permissions.includes('sync_jobs.read')) {
      setSyncError('You do not have permission to view Sync Jobs.');
      setSyncLoading(false);
      return () => controller.abort();
    }
    getDashboardSyncJobTotals(requestAdmin, controller.signal)
      .then(({ successful, terminal }) => {
        if (!controller.signal.aborted) {
          setSyncHasTerminalJobs(terminal > 0);
          setSyncRate(terminal > 0 ? successful / terminal * 100 : null);
        }
      })
      .catch(reason => { if (!controller.signal.aborted) setSyncError(reason instanceof Error ? reason.message : 'Could not load Sync Jobs. Please try again.'); })
      .finally(() => { if (!controller.signal.aborted) setSyncLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, permissions, syncReload]);

  return <div className="studio-dashboard">
    <PageHeader eyebrow="OVERVIEW" title="Dashboard" description="Tổng quan sức khỏe catalog, giá và affiliate data."
      actions={<Button tone="primary">+ Tạo sản phẩm</Button>} />

    <section className="dashboard-kpi-grid" aria-label="Chỉ số tổng quan">
      <DashboardKpi label="Products total" value={productsLoading || productsError ? '—' : (productTotal ?? 0).toLocaleString()} change={productsLoading ? 'Loading…' : productsError ? 'Unavailable' : productTotal === 0 ? 'No products found' : 'All catalog products'} tone="orange" />
      <DashboardKpi label="Offers active" value={offersLoading || offersError ? '—' : (offersData ? offersData.totalItems - offersData.counts.inactive : 0).toLocaleString()} change={offersLoading ? 'Loading…' : offersError ? 'Unavailable' : `of ${(offersData?.totalItems ?? 0).toLocaleString()} offers`} tone="green" />
      <DashboardKpi label="Partner shops" value={shopsLoading || shopsError ? '—' : (shopsTotal ?? 0).toLocaleString()} change={shopsLoading ? 'Loading…' : shopsError ? 'Unavailable' : 'All partner shops'} tone="blue" />
      <DashboardKpi label="Sync success rate" value={syncLoading || syncError ? '—' : syncHasTerminalJobs && syncRate !== null ? `${syncRate.toFixed(1)}%` : 'N/A'} change={syncLoading ? 'Loading…' : syncError ? 'Unavailable' : syncHasTerminalJobs ? 'Terminal jobs only' : 'No terminal jobs'} tone="purple" />
    </section>

    {productsLoading || offersLoading || shopsLoading || syncLoading ? <span className="sr-only" role="status">Loading dashboard metrics…</span> : null}
    {productsError && <div className="dashboard-error" role="alert">{productsError}<Button size="sm" onClick={() => setProductsReload(value => value + 1)}>Retry products</Button></div>}
    {offersError && <div className="dashboard-error" role="alert">{offersError}<Button size="sm" onClick={() => setOffersReload(value => value + 1)}>Retry offers</Button></div>}
    {shopsError && <div className="dashboard-error" role="alert">{shopsError}<Button size="sm" onClick={() => setShopsReload(value => value + 1)}>Retry partner shops</Button></div>}
    {syncError && <div className="dashboard-error" role="alert">{syncError}<Button size="sm" onClick={() => setSyncReload(value => value + 1)}>Retry Sync Jobs</Button></div>}
  </div>;
}
