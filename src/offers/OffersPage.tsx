import { useEffect, useMemo, useState } from 'react';
import type { AdminOffer, AdminRequest } from './offers-api';
import { getAdminOffers } from './offers-api';

type OfferFilter = 'all' | 'active' | 'inactive' | 'outlier';

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

function updatedAt(value: string): string {
  // AdminOffer.updatedAtUtc is UTC even when the API omits an explicit zone.
  // JavaScript treats an offset-less ISO date-time as local time, so mark that
  // contract form as UTC before parsing. Keep other input formats unchanged.
  const utcValue = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
    ? `${value}Z`
    : value;
  const date = new Date(utcValue);
  if (Number.isNaN(date.getTime())) return value;

  const twoDigits = (part: number) => String(part).padStart(2, '0');
  const time = `${twoDigits(date.getUTCHours())}:${twoDigits(date.getUTCMinutes())}:${twoDigits(date.getUTCSeconds())}`;
  const day = twoDigits(date.getUTCDate());
  const month = twoDigits(date.getUTCMonth() + 1);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  return `${time} ${day}/${month}/${year}`;
}

function safeExternalHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function OffersTable({ offers }: { offers: AdminOffer[] }) {
  return <div className="offer-table-wrap offers-table-wrap"><table>
    <thead><tr><th>Offer / product ID</th><th>Partner shop ID</th><th>Price</th><th>Active</th><th>Outlier</th><th>Updated (UTC)</th><th>URL</th></tr></thead>
    <tbody>{offers.map(offer => {
      const url = offer.url ? safeExternalHref(offer.url) : null;
      return <tr key={offer.id}>
      <td><strong>{offer.id}</strong><small>Product ID {offer.productId}</small></td>
      <td>{offer.partnerShopId}</td>
      <td><strong className="money">{money.format(offer.priceVnd)}</strong></td>
      <td><span className={`status status-${offer.isActive ? 'active' : 'disabled'}`}>{offer.isActive ? 'Active' : 'Inactive'}</span></td>
      <td><span className={`status status-${offer.isOutlier ? 'outlier' : 'neutral'}`}>{offer.isOutlier ? 'Outlier' : 'Not flagged'}</span></td>
      <td>{updatedAt(offer.updatedAtUtc)}</td>
      <td>{url ? <a href={url} target="_blank" rel="noreferrer">Open offer</a> : offer.url || '—'}</td>
    </tr>;
    })}</tbody>
  </table></div>;
}

export function OffersPage({ requestAdmin }: { requestAdmin: AdminRequest }) {
  const [offers, setOffers] = useState<AdminOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<OfferFilter>('all');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getAdminOffers(requestAdmin, controller.signal)
      .then(result => setOffers(result))
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setOffers([]);
        setError(reason instanceof Error ? reason.message : 'Could not load offers. Please try again.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, reloadKey]);

  const visibleOffers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return offers.filter(offer => {
      const matchesQuery = !query || `${offer.id} ${offer.productId} ${offer.partnerShopId}`.toLocaleLowerCase().includes(query);
      const matchesFilter = filter === 'all'
        || (filter === 'active' && offer.isActive)
        || (filter === 'inactive' && !offer.isActive)
        || (filter === 'outlier' && offer.isOutlier);
      return matchesQuery && matchesFilter;
    });
  }, [offers, search, filter]);

  return <div className="offers-page">
    <div className="page-header"><div><span className="eyebrow">CATALOG &amp; PRICING</span><h1>Offers &amp; Prices</h1><p>Review prices, active and outlier flags, update times, and offer URLs.</p></div></div>
    <div className="toolbar" role="search">
      <label className="toolbar-search">⌕<input aria-label="Search offers" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search offer, product, or partner shop ID..." /></label>
      <label><span className="sr-only">Filter offers</span><select aria-label="Filter offers" value={filter} onChange={event => setFilter(event.target.value as OfferFilter)}><option value="all">All offers</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="outlier">Outliers</option></select></label>
    </div>
    {error && <div className="banned-alert" role="alert">{error}<button className="outline-button small" type="button" onClick={() => setReloadKey(value => value + 1)}>Retry</button></div>}
    <section className="panel table-panel" aria-label="Offers list">
      {loading ? <div className="offers-state" role="status">Loading offers…</div>
        : !error && visibleOffers.length === 0 ? <div className="offers-state" role="status"><strong>No offers found</strong><span>{offers.length === 0 ? 'Offers will appear here when available.' : 'Try changing your search or status filter.'}</span></div>
          : !error && <><OffersTable offers={visibleOffers} /><div className="table-footer"><span>Showing {visibleOffers.length} of {offers.length} offers</span></div></>}
    </section>
  </div>;
}
