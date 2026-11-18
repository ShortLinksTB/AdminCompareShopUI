import { useEffect, useState } from 'react';
import { getAdminProducts } from '../products/products-api';
import { getAdminOffers, type AdminOfferPage } from '../offers/offers-api';
import { getDashboardPartnerShopTotal, getDashboardSyncSuccessRate } from './dashboard-api';
import { Button, Card, PageHeader } from '../ui';
import './dashboard.css';

interface MetricState<T> { value: T | null; loading: boolean; error: string }

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
  const [partnerShops, setPartnerShops] = useState<MetricState<number>>({ value: null, loading: true, error: '' });
  const [partnerShopsReload, setPartnerShopsReload] = useState(0);
  const [syncSuccessRate, setSyncSuccessRate] = useState<MetricState<number>>({ value: null, loading: true, error: '' });
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
    setPartnerShops({ value: null, loading: true, error: '' });
    if (!permissions.includes('shops.read')) {
      setPartnerShops({ value: null, loading: false, error: 'You do not have permission to view partner shops.' });
      return () => controller.abort();
    }
    getDashboardPartnerShopTotal(requestAdmin, controller.signal)
      .then(value => { if (!controller.signal.aborted) setPartnerShops({ value, loading: false, error: '' }); })
      .catch(reason => { if (!controller.signal.aborted) setPartnerShops({ value: null, loading: false, error: reason instanceof Error ? reason.message : 'Could not load partner shops. Please try again.' }); });
    return () => controller.abort();
  }, [requestAdmin, permissions, partnerShopsReload]);

  useEffect(() => {
    const controller = new AbortController();
    setSyncSuccessRate({ value: null, loading: true, error: '' });
    if (!permissions.includes('sync_jobs.read')) {
      setSyncSuccessRate({ value: null, loading: false, error: 'You do not have permission to view Sync Jobs.' });
      return () => controller.abort();
    }
    getDashboardSyncSuccessRate(requestAdmin, controller.signal)
      .then(value => { if (!controller.signal.aborted) setSyncSuccessRate({ value, loading: false, error: '' }); })
      .catch(reason => { if (!controller.signal.aborted) setSyncSuccessRate({ value: null, loading: false, error: reason instanceof Error ? reason.message : 'Could not load Sync Jobs. Please try again.' }); });
    return () => controller.abort();
  }, [requestAdmin, permissions, syncReload]);

  return <div className="studio-dashboard">
    <PageHeader eyebrow="OVERVIEW" title="Dashboard" description="Tổng quan sức khỏe catalog, giá và affiliate data."
      actions={<Button tone="primary">+ Tạo sản phẩm</Button>} />

    <section className="dashboard-kpi-grid" aria-label="Chỉ số tổng quan">
      <DashboardKpi label="Products total" value={productsLoading || productsError ? '—' : (productTotal ?? 0).toLocaleString()} change={productsLoading ? 'Loading…' : productsError ? 'Unavailable' : productTotal === 0 ? 'No products found' : 'All catalog products'} tone="orange" />
      <DashboardKpi label="Offers active" value={offersLoading || offersError ? '—' : (offersData ? offersData.totalItems - offersData.counts.inactive : 0).toLocaleString()} change={offersLoading ? 'Loading…' : offersError ? 'Unavailable' : `of ${(offersData?.totalItems ?? 0).toLocaleString()} offers`} tone="green" />
      <DashboardKpi label="Partner shops" value={partnerShops.loading || partnerShops.error ? '—' : (partnerShops.value ?? 0).toLocaleString()} change={partnerShops.loading ? 'Loading…' : partnerShops.error ? 'Unavailable' : partnerShops.value === 0 ? 'No partner shops found' : 'All partner shops'} tone="blue" />
      <DashboardKpi label="Sync success rate" value={syncSuccessRate.loading || syncSuccessRate.error ? '—' : syncSuccessRate.value === null ? 'N/A' : `${(syncSuccessRate.value * 100).toFixed(1)}%`} change={syncSuccessRate.loading ? 'Loading…' : syncSuccessRate.error ? 'Unavailable' : syncSuccessRate.value === null ? 'No completed sync jobs' : 'Completed sync jobs'} tone="purple" />
    </section>

    {productsLoading || offersLoading || partnerShops.loading || syncSuccessRate.loading ? <span className="sr-only" role="status">Loading dashboard metrics…</span> : null}
    {productsError || offersError || partnerShops.error || syncSuccessRate.error ? <div className="dashboard-error" role="alert">
      {productsError || offersError || partnerShops.error || syncSuccessRate.error}
      {productsError && <Button size="sm" onClick={() => setProductsReload(value => value + 1)}>Retry products</Button>}
      {offersError && <Button size="sm" onClick={() => setOffersReload(value => value + 1)}>Retry offers</Button>}
      {partnerShops.error && <Button size="sm" onClick={() => setPartnerShopsReload(value => value + 1)}>Retry partner shops</Button>}
      {syncSuccessRate.error && <Button size="sm" onClick={() => setSyncReload(value => value + 1)}>Retry Sync Jobs</Button>}
    </div> : null}
  </div>;
}
