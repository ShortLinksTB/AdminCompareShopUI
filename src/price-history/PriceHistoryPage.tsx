import { useEffect, useMemo, useState } from 'react';
import type { AdminRequest } from '../products/products-api';
import { getAdminProducts, type AdminProduct } from '../products/products-api';
import { getAdminProductOffers, getOfferPriceHistory, type AdminOffer, type PriceHistoryPoint } from '../offers/offers-api';
import { Button, Card, DataTable, EmptyState, ErrorState, Loading, PageHeader, SearchField, Select, Toolbar } from '../ui';
import './price-history.css';

const money = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const formatPrice = (value: number) => `${money.format(value)} ₫`;
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN').format(date);
};

function chartPath(points: PriceHistoryPoint[]): string {
  if (points.length < 2) return '';
  const prices = points.map(point => point.priceVnd);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const spread = high - low || Math.max(Math.abs(high) * 0.05, 1);
  return points.map((point, index) => {
    const x = (index / (points.length - 1)) * 800;
    const y = 205 - ((point.priceVnd - low) / spread) * 180;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

export function PriceHistory({ requestAdmin }: { requestAdmin: AdminRequest }) {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [search, setSearch] = useState('');
  const [showMatches, setShowMatches] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<AdminProduct | null>(null);
  const [offers, setOffers] = useState<AdminOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState('');
  const [selectedOfferId, setSelectedOfferId] = useState<number | null>(null);
  const [history, setHistory] = useState<PriceHistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [exportNotice, setExportNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setProductsLoading(true);
      setProductsError('');
      try {
        const firstPage = await getAdminProducts(requestAdmin, 1, 100, controller.signal);
        const all = [...firstPage.items];
        const pageCount = Math.ceil(firstPage.totalItems / firstPage.pageSize);
        for (let page = 2; page <= pageCount; page += 1) {
          const result = await getAdminProducts(requestAdmin, page, firstPage.pageSize, controller.signal);
          all.push(...result.items);
        }
        if (!controller.signal.aborted) setProducts(all);
      } catch (reason) {
        if (!controller.signal.aborted) setProductsError(reason instanceof Error ? reason.message : 'Could not load products.');
      } finally {
        if (!controller.signal.aborted) setProductsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [requestAdmin]);

  useEffect(() => {
    if (selectedProduct === null) return;
    const controller = new AbortController();
    void (async () => {
      setOffersLoading(true);
      setOffersError('');
      setOffers([]);
      setSelectedOfferId(null);
      setHistory([]);
      setHistoryError('');
      try {
        const result = await getAdminProductOffers(requestAdmin, selectedProduct.id, controller.signal);
        if (!controller.signal.aborted) {
          setOffers(result);
          setSelectedOfferId(result[0]?.id ?? null);
        }
      } catch (reason) {
        if (!controller.signal.aborted) setOffersError(reason instanceof Error ? reason.message : 'Could not load product offers.');
      } finally {
        if (!controller.signal.aborted) setOffersLoading(false);
      }
    })();
    return () => controller.abort();
  }, [requestAdmin, selectedProduct]);

  useEffect(() => {
    if (selectedOfferId === null) return;
    const controller = new AbortController();
    void (async () => {
      setHistoryLoading(true);
      setHistoryError('');
      setHistory([]);
      try {
        const points = await getOfferPriceHistory(requestAdmin, selectedOfferId, controller.signal, 180);
        if (!controller.signal.aborted) setHistory([...points].sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc)));
      } catch (reason) {
        if (!controller.signal.aborted) setHistoryError(reason instanceof Error ? reason.message : 'Could not load price history.');
      } finally {
        if (!controller.signal.aborted) setHistoryLoading(false);
      }
    })();
    return () => controller.abort();
  }, [requestAdmin, selectedOfferId]);

  const matchingProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query ? products.filter(product => product.name.toLocaleLowerCase().includes(query) || (product.brand ?? '').toLocaleLowerCase().includes(query) || product.slug.toLocaleLowerCase().includes(query)).slice(0, 8) : [];
  }, [products, search]);
  const selectedOffer = offers.find(offer => offer.id === selectedOfferId) ?? null;
  const line = chartPath(history);

  const chooseProduct = (product: AdminProduct) => {
    setSelectedProduct(product);
    setSearch(product.name);
    setShowMatches(false);
    setExportNotice('');
  };

  return <div className="price-history-page">
    <PageHeader eyebrow="CATALOG & PRICING" title="Price History" description="Theo dõi biến động giá và phát hiện bất thường."
      actions={<Button onClick={() => setExportNotice('Price history export is not available yet. No export API or existing price-history export is implemented.')}>⇩ Export report</Button>} />
    {exportNotice && <p className="price-history-export-notice" role="status">{exportNotice}</p>}
    <Toolbar className="price-history-toolbar" role="search">
      <div className="price-history-product-search">
        <SearchField label="Search product" type="search" value={search} onFocus={() => setShowMatches(true)} onChange={event => { setSearch(event.target.value); setSelectedProduct(null); setOffers([]); setOffersError(''); setHistory([]); setHistoryError(''); setShowMatches(true); }} placeholder="Search product..." autoComplete="off" />
        {showMatches && search.trim() && <div className="price-history-product-results" role="listbox" aria-label="Products">
          {productsLoading ? <Loading label="Loading products" /> : productsError ? <ErrorState title="Could not search products">{productsError}</ErrorState> : matchingProducts.length ? matchingProducts.map(product => <button type="button" role="option" aria-selected={selectedProduct?.id === product.id} key={product.id} onClick={() => chooseProduct(product)}>{product.name}{product.brand && <small>{product.brand}</small>}</button>) : <EmptyState title="No products found" />}
        </div>}
      </div>
      {selectedProduct && <Select aria-label="Product offer" value={selectedOfferId ?? ''} disabled={offersLoading || offers.length === 0} onChange={event => setSelectedOfferId(Number(event.target.value))}>
        {offersLoading && <option value="">Loading shops…</option>}
        {!offersLoading && offers.length === 0 && <option value="">No shop offers</option>}
        {offers.map(offer => <option key={offer.id} value={offer.id}>{offer.partnerShopName || 'Shop'} · {formatPrice(offer.priceVnd)}</option>)}
      </Select>}
    </Toolbar>
    {offersError && <ErrorState title="Could not load product offers">{offersError}</ErrorState>}
    {selectedProduct && !offersLoading && !offersError && offers.length === 0 && <EmptyState title="No shop offers">This product has no offers to compare.</EmptyState>}
    <Card className="price-history-chart-card">
      <div className="price-history-heading">
        <div><h2>{selectedProduct?.name ?? 'Select a product'}</h2><p>{selectedOffer ? `${selectedOffer.partnerShopName || 'Shop'} · Price trend · 6 tháng gần nhất` : 'Price trend · 6 tháng gần nhất'}</p></div>
        <strong>{history.length ? formatPrice(history.at(-1)!.priceVnd) : '—'}</strong>
      </div>
      <div className="price-history-chart" role="img" aria-label="Price trend over six months">
        {historyLoading ? <Loading label="Loading price history" /> : historyError ? <ErrorState title="Could not load price history">{historyError}</ErrorState> : history.length === 0 ? <EmptyState title={selectedOffer ? 'No price history available' : 'Choose a product and shop to view price history'} /> : <svg viewBox="0 0 800 230" preserveAspectRatio="none" aria-hidden="true">{history.length > 1 && <path d={line} />}{history.length === 1 && <circle cx="400" cy="115" r="5" />}</svg>}
      </div>
    </Card>
    <Card className="price-history-table-card" aria-label="Price history records">
      <DataTable className="price-history-table-wrap">
        <thead><tr><th>Date</th><th>Shop</th><th>Price</th><th>Change</th><th>Event</th></tr></thead>
        <tbody>{history.map((point, index) => {
          const previous = history[index - 1];
          const delta = previous ? point.priceVnd - previous.priceVnd : null;
          const change = delta === null ? '—' : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${formatPrice(Math.abs(delta))}`;
          return <tr key={`${point.dateUtc}-${index}`}><td>{formatDate(point.dateUtc)}</td><td>{selectedOffer?.partnerShopName || '—'}</td><td className="price-history-amount">{formatPrice(point.priceVnd)}</td><td className={delta !== null && delta < 0 ? 'price-history-decrease' : 'price-history-amount'}>{change}</td><td>—</td></tr>;
        })}</tbody>
      </DataTable>
      <div className="price-history-footer">{history.length} price {history.length === 1 ? 'record' : 'records'}</div>
    </Card>
  </div>;
}
