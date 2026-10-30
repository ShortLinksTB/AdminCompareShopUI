import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BanApiError, createBannedItem, getBannedItems, getProductTargets, revokeBannedItem, type AdminRequest, type BanTargetType, type BannedItem, type ProductTarget } from './bannedItemsApi';
import './bannedItems.css';

const pageSize = 20;
const dateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';

function targetName(item: BannedItem) {
  return item.targetType === 'Brand' ? item.brandName || 'Unnamed brand' : item.productName || item.productId || 'Unnamed product';
}

export function BannedItemsRoute({ permissions, requestAdmin }: { permissions: string[]; requestAdmin: AdminRequest }) {
  const location = useLocation();
  const canRead = permissions.includes('compliance.read');
  const canManage = permissions.includes('compliance.manage');
  const navigate = useNavigate();
  if (!canRead) return <Navigate to="/" replace />;
  if (location.pathname.endsWith('/new')) {
    if (!canManage) return <Navigate to="/" replace />;
    return <BannedItemForm canManage requestAdmin={requestAdmin} fullScreen onCancel={() => navigate('/banned-items')} onCreated={() => navigate('/banned-items')} />;
  }
  return <BannedItemsPage canManage={canManage} requestAdmin={requestAdmin} />;
}

function BannedItemsPage({ canManage, requestAdmin }: { canManage: boolean; requestAdmin: AdminRequest }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<BannedItem[]>([]);
  const [active, setActive] = useState(true);
  const [targetType, setTargetType] = useState<'all' | BanTargetType>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingRevoke, setPendingRevoke] = useState<BannedItem | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const openAdd = () => {
    if (window.innerWidth <= 680) navigate('/banned-items/new');
    else setAddOpen(true);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setQuery(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getBannedItems(requestAdmin, { active, targetType, search: query, page, pageSize }, controller.signal)
      .then(result => {
        setItems(result.items);
        setTotalItems(result.totalItems);
      })
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Unable to load banned items.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [active, targetType, query, page, reloadKey]);

  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const revoke = async () => {
    if (!pendingRevoke) return;
    setRevoking(true);
    setError('');
    try {
      await revokeBannedItem(requestAdmin, pendingRevoke.id);
      setPendingRevoke(null);
      if (items.length === 1 && page > 1) setPage(current => current - 1);
      else setItems(current => current.filter(item => item.id !== pendingRevoke.id));
      setTotalItems(current => Math.max(0, current - 1));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to revoke this ban.');
    } finally {
      setRevoking(false);
    }
  };

  return <div className="banned-page">
    <div className="page-header">
      <div><span className="eyebrow">CATALOG & PRICING</span><h1>Banned items</h1><p>Manage brands and products hidden from public CompareShop.</p></div>
      {canManage && <button className="primary-button" onClick={openAdd}>＋ Add banned item</button>}
    </div>

    <div className="banned-toolbar" role="search">
      <label className="toolbar-search">⌕<input aria-label="Search banned items" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search brand or product…" /></label>
      <label className="banned-filter"><span className="sr-only">Filter by target type</span><select value={targetType} onChange={event => { setTargetType(event.target.value as 'all' | BanTargetType); setPage(1); }}><option value="all">All target types</option><option value="Brand">Brand</option><option value="Product">Product</option></select></label>
      <label className="banned-filter"><span className="sr-only">Filter by status</span><select value={String(active)} onChange={event => { setActive(event.target.value === 'true'); setPage(1); }}><option value="true">Active</option><option value="false">Revoked</option></select></label>
    </div>

    {error && <div className="banned-alert" role="alert">{error}<button className="outline-button small" onClick={() => setReloadKey(current => current + 1)}>Retry</button></div>}
    {loading ? <BannedItemsLoading />
      : items.length === 0 && !error ? <div className="banned-state panel"><strong>{query ? 'No results' : `No ${active ? 'active' : 'revoked'} bans found`}</strong><span>{query ? `No banned items match “${query}”.` : 'Try another target type or add a ban.'}</span>{query && <button className="outline-button small" onClick={() => setSearch('')}>Clear search</button>}{canManage && !query && <button className="primary-button" onClick={openAdd}>＋ Add banned item</button>}</div>
        : <>
          <section className="panel banned-table-panel" aria-label="Banned items list">
            <div className="banned-table-scroll"><table>
              <thead><tr><th>Target</th><th>Reason</th><th>Status</th><th>Added by</th><th>Added at</th><th>Revoked by</th><th>Revoked at</th>{canManage && <th><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>{items.map(item => <tr key={item.id}>
                <td><strong>{targetName(item)}</strong><small>{item.targetType}{item.targetType === 'Product' && item.brandName ? ` · ${item.brandName}` : ''}</small></td>
                <td className="banned-reason">{item.reason || '—'}</td>
                <td><span className={`banned-status ${item.isActive ? 'is-active' : 'is-revoked'}`}><i />{item.isActive ? 'Active' : 'Revoked'}</span></td>
                <td>{item.createdBy || '—'}</td><td>{dateTime(item.createdAtUtc)}</td><td>{item.revokedBy || '—'}</td><td>{dateTime(item.revokedAtUtc)}</td>
                {canManage && <td>{item.isActive && <button className="banned-revoke-link" onClick={() => setPendingRevoke(item)}>Revoke</button>}</td>}
              </tr>)}</tbody>
            </table></div>
            <div className="table-footer"><span>Showing {totalItems === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} of {totalItems} entries</span><div><button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>‹</button><span className="banned-page-number">Page {page} of {pageCount}</span><button aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage(current => current + 1)}>›</button></div></div>
          </section>
          <section className="banned-cards" aria-label="Banned items list">{items.map(item => <article className="panel banned-card" key={item.id}>
            <div className="banned-card-head"><div><strong>{targetName(item)}</strong><small>{item.targetType}{item.targetType === 'Product' && item.brandName ? ` · ${item.brandName}` : ''}</small></div><span className={`banned-status ${item.isActive ? 'is-active' : 'is-revoked'}`}><i />{item.isActive ? 'Active' : 'Revoked'}</span></div>
            <p className="banned-card-reason">{item.reason || 'No reason provided.'}</p>
            <dl><div><dt>Added by</dt><dd>{item.createdBy || '—'}</dd></div><div><dt>Added at</dt><dd>{dateTime(item.createdAtUtc)}</dd></div>{!item.isActive && <><div><dt>Revoked by</dt><dd>{item.revokedBy || '—'}</dd></div><div><dt>Revoked at</dt><dd>{dateTime(item.revokedAtUtc)}</dd></div></>}</dl>
            {canManage && item.isActive && <button className="banned-mobile-revoke" onClick={() => setPendingRevoke(item)}>Revoke ban</button>}
          </article>)}</section>
        </>}

    {pendingRevoke && <div className="banned-dialog-backdrop" role="presentation"><section className="banned-dialog" role="alertdialog" aria-modal="true" aria-labelledby="revoke-title" aria-describedby="revoke-description">
      <span className="banned-dialog-icon">!</span><h2 id="revoke-title">Revoke this ban?</h2><p id="revoke-description">{targetName(pendingRevoke)} will be marked as revoked. Confirm to continue.</p>
      {error && <div className="banned-alert" role="alert">{error}</div>}
      <div><button className="outline-button" disabled={revoking} onClick={() => setPendingRevoke(null)}>Cancel</button><button className="banned-danger-button" disabled={revoking} onClick={revoke}>{revoking ? 'Revoking…' : 'Revoke ban'}</button></div>
    </section></div>}
    {addOpen && <BannedItemForm canManage requestAdmin={requestAdmin} fullScreen={false} onCancel={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); setReloadKey(current => current + 1); }} />}
  </div>;
}

function BannedItemsLoading() {
  return <div className="banned-loading" role="status" aria-label="Loading banned items">
    <section className="panel banned-skeleton-table" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <div className="banned-skeleton-row" key={index}><i /><i /><i /><i /></div>)}</section>
    <section className="banned-skeleton-cards" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <div className="panel banned-skeleton-card" key={index}><i /><i /><i /></div>)}</section>
    <span className="sr-only">Loading banned items…</span>
  </div>;
}

function BannedItemForm({ canManage, requestAdmin, fullScreen, onCancel, onCreated }: { canManage: boolean; requestAdmin: AdminRequest; fullScreen: boolean; onCancel: () => void; onCreated: () => void }) {
  const [targetType, setTargetType] = useState<BanTargetType>('Brand');
  const [targets, setTargets] = useState<ProductTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [targetLoadError, setTargetLoadError] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<ProductTarget | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<BannedItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setTargetsLoading(true);
    setTargetLoadError('');
    getProductTargets(requestAdmin, controller.signal)
      .then(result => setTargets(result.filter(product => product.isActive)))
      .catch(failure => {
        if (failure instanceof DOMException && failure.name === 'AbortError') return;
        setTargetLoadError(failure instanceof Error ? failure.message : 'Unable to load catalog targets.');
      })
      .finally(() => { if (!controller.signal.aborted) setTargetsLoading(false); });
    getBannedItems(requestAdmin, { active: true, targetType: 'all', search: '', page: 1, pageSize: 3 }, controller.signal)
      .then(result => setRecent(result.items))
      .catch(() => setRecent([]));
    return () => controller.abort();
  }, []);

  if (!canManage) return <Navigate to="/" replace />;
  const brands = [...new Set(targets.map(product => product.brand?.trim()).filter((brand): brand is string => Boolean(brand)))].sort((a, b) => a.localeCompare(b));
  const normalizedSearch = targetSearch.trim().toLocaleLowerCase();
  const matchingProducts = targets.filter(product => `${product.name} ${product.brand ?? ''} ${product.id}`.toLocaleLowerCase().includes(normalizedSearch)).slice(0, 8);
  const matchingBrands = brands.filter(brand => brand.toLocaleLowerCase().includes(normalizedSearch)).slice(0, 8);
  const chosenLabel = targetType === 'Brand' ? selectedTarget?.brand?.trim() : selectedTarget ? `${selectedTarget.name}${selectedTarget.brand ? ` · ${selectedTarget.brand}` : ''}` : '';
  const hasMatchingTargets = targetType === 'Brand' ? matchingBrands.length > 0 : matchingProducts.length > 0;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (targetType === 'Brand') {
        const brandName = selectedTarget?.brand?.trim();
        if (!brandName) throw new Error('Choose a brand from the catalog.');
        if (!reason.trim()) throw new Error('Enter a ban reason.');
        await createBannedItem(requestAdmin, { targetType, brandName, reason: reason.trim() });
      } else {
        if (!selectedTarget) throw new Error('Choose a product from the catalog.');
        if (!reason.trim()) throw new Error('Enter a ban reason.');
        await createBannedItem(requestAdmin, { targetType, productId: selectedTarget.id, reason: reason.trim() });
      }
      onCreated();
    } catch (failure) {
      setError(failure instanceof BanApiError ? failure.message : failure instanceof Error ? failure.message : 'Unable to create this ban.');
    } finally {
      setSubmitting(false);
    }
  };

  const form = <>
    <div className="banned-form-heading"><div><span className="eyebrow">CATALOG & PRICING / BANNED ITEMS</span><h2 id="add-banned-title">Add banned item</h2><p>Choose a catalog target and explain why it is being banned.</p></div><button className="banned-close-button" type="button" aria-label="Close add banned item" onClick={onCancel}>×</button></div>
    <form className="banned-form" onSubmit={submit}>
      <div className="banned-notice">This target will be hidden from public CompareShop when the ban takes effect.</div>
      <h3>Entry details</h3>
      <fieldset className="banned-field"><legend>Target type <span>*</span></legend><div className="banned-choice-row">
        {(['Brand', 'Product'] as const).map(kind => <label className="banned-choice" key={kind}><input type="radio" name="targetType" value={kind} checked={targetType === kind} onChange={() => { setTargetType(kind); setSelectedTarget(null); setTargetSearch(''); }} />{kind}</label>)}
      </div></fieldset>
      <div className="banned-field"><label htmlFor="targetSearch">{targetType} <b>*</b></label>
        <div className="banned-target-select"><input id="targetSearch" role="combobox" aria-expanded={Boolean(targetSearch) && hasMatchingTargets} aria-controls="target-options" aria-autocomplete="list" autoComplete="off" value={selectedTarget ? chosenLabel ?? '' : targetSearch} onChange={event => { setSelectedTarget(null); setTargetSearch(event.target.value); }} onFocus={() => { if (selectedTarget) { setSelectedTarget(null); setTargetSearch(chosenLabel ?? ''); } }} placeholder={`Search and select a ${targetType.toLowerCase()}`} />
          {targetSearch && !selectedTarget && <div className="banned-target-options" id="target-options" role="listbox" aria-label={`${targetType} results`}>
            {targetsLoading ? <span className="banned-target-empty" role="status">Loading catalog…</span>
              : targetLoadError ? <span className="banned-target-empty" role="alert">{targetLoadError}</span>
                : hasMatchingTargets ? targetType === 'Brand' ? matchingBrands.map(brand => <button key={brand} type="button" role="option" aria-selected={false} onClick={() => { setSelectedTarget(targets.find(product => product.brand?.trim() === brand) ?? null); setTargetSearch(''); }}>{brand}</button>) : matchingProducts.map(product => <button key={product.id} type="button" role="option" aria-selected={false} onClick={() => { setSelectedTarget(product); setTargetSearch(''); }}>{product.name}<small>{product.brand || `Product #${product.id}`}</small></button>)
                  : <span className="banned-target-empty">No matching {targetType.toLowerCase()} found.</span>}
          </div>}
        </div>
        {selectedTarget && <span className="banned-selected-target" role="status">Selected: {chosenLabel}<button type="button" onClick={() => setSelectedTarget(null)}>Change</button></span>}
      </div>
      <label className="banned-field" htmlFor="banReason"><span>Ban reason <b>*</b></span><textarea id="banReason" required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Describe why this target is being banned…" /><small>This reason is visible to authorized Admin users.</small></label>
      {error && <div className="banned-alert" role="alert">{error}</div>}
      <div className="banned-form-actions"><button className="outline-button" type="button" disabled={submitting} onClick={onCancel}>Cancel</button><button className="primary-button" type="submit" disabled={submitting || !selectedTarget || !reason.trim()}>{submitting ? 'Adding…' : 'Add to banned list'}</button></div>
    </form>
    {fullScreen && <aside className="panel banned-recent"><h2>Recently added</h2>{recent.length ? recent.map(item => <div className="banned-recent-item" key={item.id}><strong>{targetName(item)}</strong><small>Added by {item.createdBy || '—'} · {dateTime(item.createdAtUtc)}</small></div>) : <p>No active bans to preview.</p>}</aside>}
  </>;
  return fullScreen
    ? <div className="banned-page banned-form-page"><div className="banned-mobile-back"><button className="outline-button" type="button" onClick={onCancel}>‹ Back to banned items</button></div><div className="page-header"><div><span className="eyebrow">CATALOG & PRICING / BANNED ITEMS</span><h1>Add banned item</h1><p>Choose a target and provide a reason.</p></div></div><div className="banned-form-layout"><section className="panel banned-mobile-form">{form}</section></div></div>
    : <div className="banned-drawer-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) onCancel(); }}><aside className="banned-drawer" role="dialog" aria-modal="true" aria-labelledby="add-banned-title"><div className="banned-drawer-scroll"><div className="banned-drawer-body">{form}</div></div></aside></div>;
}
