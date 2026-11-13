import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BanApiError, createBannedItem, getBannedItems, getProductTargets, revokeBannedItem, type AdminRequest, type BanTargetType, type BannedItem, type ProductTarget } from './bannedItemsApi';
import { Button, Card, DataTable, Drawer, EmptyState, ErrorState, Loading, Modal, PageHeader, Pager, Pill, SearchField, Select, TableFooter, Toolbar } from './ui';
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
  const addSubmitting = useRef(false);
  const closeAdd = () => {
    if (!addSubmitting.current) setAddOpen(false);
  };
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
    <PageHeader eyebrow="CATALOG & PRICING" title="Banned items" description="Manage brands and products hidden from public CompareShop." actions={canManage && <Button tone="primary" onClick={openAdd}>＋ Add banned item</Button>} />

    <Toolbar className="banned-toolbar" role="search" aria-label="Filter banned items">
      <SearchField label="Search banned items" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search brand or product…" />
      <Select aria-label="Filter by target type" value={targetType} onChange={event => { setTargetType(event.target.value as 'all' | BanTargetType); setPage(1); }}><option value="all">All target types</option><option value="Brand">Brand</option><option value="Product">Product</option></Select>
      <Select aria-label="Filter by status" value={String(active)} onChange={event => { setActive(event.target.value === 'true'); setPage(1); }}><option value="true">Active</option><option value="false">Revoked</option></Select>
    </Toolbar>

    {error && <div className="banned-alert"><ErrorState title={error} /><Button size="sm" onClick={() => setReloadKey(current => current + 1)}>Retry</Button></div>}
    {loading ? <BannedItemsLoading />
      : items.length === 0 && !error ? <Card className="banned-state"><EmptyState title={query ? 'No results' : `No ${active ? 'active' : 'revoked'} bans found`}>{query ? `No banned items match “${query}”.` : 'Try another target type or add a ban.'}</EmptyState>{query && <Button size="sm" onClick={() => setSearch('')}>Clear search</Button>}{canManage && !query && <Button tone="primary" onClick={openAdd}>＋ Add banned item</Button>}</Card>
        : <>
          <Card className="banned-table-panel" aria-label="Banned items list">
            <DataTable role="region" tabIndex={0} aria-label="Banned items table, scroll horizontally"><thead><tr><th scope="col">Target</th><th scope="col">Reason</th><th scope="col">Status</th><th scope="col">Added by</th><th scope="col">Added at</th><th scope="col">Revoked by</th><th scope="col">Revoked at</th>{canManage && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>{items.map(item => <tr key={item.id}>
                <td><strong>{targetName(item)}</strong><small>{item.targetType}{item.targetType === 'Product' && item.brandName ? ` · ${item.brandName}` : ''}</small></td>
                <td className="banned-reason">{item.reason || '—'}</td>
                <td><Pill tone={item.isActive ? 'ok' : 'neutral'}>{item.isActive ? '● Active' : '◆ Revoked'}</Pill></td>
                <td>{item.createdBy || '—'}</td><td>{dateTime(item.createdAtUtc)}</td><td>{item.revokedBy || '—'}</td><td>{dateTime(item.revokedAtUtc)}</td>
                {canManage && <td>{item.isActive && <Button tone="danger" size="sm" onClick={() => setPendingRevoke(item)}>Revoke</Button>}</td>}
              </tr>)}</tbody></DataTable>
            <TableFooter start={totalItems === 0 ? 0 : (page - 1) * pageSize + 1} end={Math.min(page * pageSize, totalItems)} total={totalItems} summary={`Showing ${totalItems === 0 ? 0 : (page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalItems)} of ${totalItems} entries`}><Pager page={page} pages={pageCount} onChange={setPage} previousLabel="Previous page" nextLabel="Next page" formatPage={(current, pages) => `Page ${current} of ${pages}`} /></TableFooter>
          </Card>
          <section className="banned-cards" aria-label="Banned items list">{items.map(item => <Card as="article" className="banned-card" key={item.id}>
            <div className="banned-card-head"><div><strong>{targetName(item)}</strong><small>{item.targetType}{item.targetType === 'Product' && item.brandName ? ` · ${item.brandName}` : ''}</small></div><Pill tone={item.isActive ? 'ok' : 'neutral'}>{item.isActive ? '● Active' : '◆ Revoked'}</Pill></div>
            <p className="banned-card-reason">{item.reason || 'No reason provided.'}</p>
            <dl><div><dt>Added by</dt><dd>{item.createdBy || '—'}</dd></div><div><dt>Added at</dt><dd>{dateTime(item.createdAtUtc)}</dd></div>{!item.isActive && <><div><dt>Revoked by</dt><dd>{item.revokedBy || '—'}</dd></div><div><dt>Revoked at</dt><dd>{dateTime(item.revokedAtUtc)}</dd></div></>}</dl>
            {canManage && item.isActive && <Button tone="danger" className="banned-mobile-revoke" onClick={() => setPendingRevoke(item)}>Revoke ban</Button>}
          </Card>)}</section>
        </>}

    <Modal open={Boolean(pendingRevoke)} onClose={() => { if (!revoking) setPendingRevoke(null); }} title="Revoke this ban?" role="alertdialog" className="banned-confirm-modal" actions={<><Button disabled={revoking} onClick={() => setPendingRevoke(null)}>Cancel</Button><Button tone="danger" disabled={revoking} onClick={revoke}>{revoking ? 'Revoking…' : 'Revoke ban'}</Button></>}>
      <p>{pendingRevoke && `${targetName(pendingRevoke)} will be marked as revoked. Confirm to continue.`}</p>{error && <ErrorState title={error} />}
    </Modal>
    <Drawer open={addOpen} onClose={closeAdd} title="Add banned item"><BannedItemForm canManage requestAdmin={requestAdmin} fullScreen={false} onCancel={closeAdd} onSubmittingChange={submitting => { addSubmitting.current = submitting; }} onCreated={() => { setAddOpen(false); setReloadKey(current => current + 1); }} /></Drawer>
  </div>;
}

function BannedItemsLoading() {
  return <Loading label="Loading banned items" />;
}

function BannedItemForm({ canManage, requestAdmin, fullScreen, onCancel, onCreated, onSubmittingChange }: { canManage: boolean; requestAdmin: AdminRequest; fullScreen: boolean; onCancel: () => void; onCreated: () => void; onSubmittingChange?: (submitting: boolean) => void }) {
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
    onSubmittingChange?.(true);
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
      onSubmittingChange?.(false);
    }
  };

  const form = <>
    <div className="banned-form-heading"><div><span className="eyebrow">CATALOG & PRICING / BANNED ITEMS</span>{fullScreen && <h2>Add banned item</h2>}<p>Choose a catalog target and explain why it is being banned.</p></div>{fullScreen && <Button tone="ghost" type="button" aria-label="Close add banned item" onClick={onCancel}>×</Button>}</div>
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
      <div className="banned-form-actions"><Button type="button" disabled={submitting} onClick={onCancel}>Cancel</Button><Button tone="primary" type="submit" disabled={submitting || !selectedTarget || !reason.trim()}>{submitting ? 'Adding…' : 'Add to banned list'}</Button></div>
    </form>
    {fullScreen && <Card className="banned-recent"><h2>Recently added</h2>{recent.length ? recent.map(item => <div className="banned-recent-item" key={item.id}><strong>{targetName(item)}</strong><small>Added by {item.createdBy || '—'} · {dateTime(item.createdAtUtc)}</small></div>) : <p>No active bans to preview.</p>}</Card>}
  </>;
  return fullScreen
    ? <div className="banned-page banned-form-page"><div className="banned-mobile-back"><Button type="button" onClick={onCancel}>‹ Back to banned items</Button></div><PageHeader eyebrow="CATALOG & PRICING / BANNED ITEMS" title="Add banned item" description="Choose a target and provide a reason." /><div className="banned-form-layout"><Card className="banned-mobile-form">{form}</Card></div></div>
    : <div className="banned-form-drawer-content">{form}</div>;
}
