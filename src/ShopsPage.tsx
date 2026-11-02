import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { createShop, deleteShop, getShops, updateShop, type AdminRequest, type AdminShop, type ShopInput } from './shopsApi';
import './shops.css';

const defaultPageSize = 20;

function safeWebsiteLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function ShopsPage({ permissions, requestAdmin }: { permissions: string[]; requestAdmin: AdminRequest }) {
  const canRead = permissions.includes('shops.read');
  const canCreate = permissions.includes('shops.create');
  const canUpdate = permissions.includes('shops.update');
  const canDelete = permissions.includes('shops.delete');
  const [items, setItems] = useState<AdminShop[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<AdminShop | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getShops(requestAdmin, page, pageSize, controller.signal)
      .then(result => {
        setItems(result.items);
        setPage(result.pageNumber);
        setPageSize(result.pageSize);
        setTotalItems(result.totalItems);
      })
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Unable to load partner shops.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [canRead, page, pageSize, reloadKey, requestAdmin]);

  if (!canRead) return <Navigate to="/" replace />;

  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (shop: AdminShop) => { setEditing(shop); setFormOpen(true); };
  const save = async (input: ShopInput): Promise<void> => {
    if (editing) await updateShop(requestAdmin, editing.id, input);
    else await createShop(requestAdmin, input);
    setFormOpen(false);
    setEditing(null);
    setReloadKey(value => value + 1);
  };

  const remove = async (shop: AdminShop) => {
    if (!window.confirm(`Delete ${shop.name}? This action cannot be undone.`)) return;
    setError('');
    try {
      await deleteShop(requestAdmin, shop.id);
      if (items.length === 1 && page > 1) {
        setItems(current => current.filter(item => item.id !== shop.id));
        setPage(current => current - 1);
        setTotalItems(current => Math.max(0, current - 1));
      } else {
        setItems(current => current.filter(item => item.id !== shop.id));
        setTotalItems(current => Math.max(0, current - 1));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete this shop.');
    }
  };

  return <div className="shops-page">
    <div className="page-header">
      <div><span className="eyebrow">AFFILIATE &amp; DATA</span><h1>Partner Shops</h1><p>Quản lý partner và thông tin cửa hàng trong catalog.</p></div>
      {canCreate && <button className="primary-button" onClick={openCreate}>＋ Add shop</button>}
    </div>

    {error && <div className="banned-alert" role="alert">{error}<button className="outline-button small" onClick={() => setReloadKey(value => value + 1)}>Retry</button></div>}
    {loading ? <ShopsLoading /> : items.length === 0 && !error
      ? <div className="panel shops-state"><strong>No partner shops found</strong><span>Partner shops will appear here when they are added.</span>{canCreate && <button className="primary-button" onClick={openCreate}>＋ Add shop</button>}</div>
      : items.length === 0 ? <div className="panel shops-state"><strong>Unable to load partner shops</strong><span>Retry the request to see the current list.</span></div>
        : <>
          <section className="shop-grid" aria-label="Partner shops list">
            {items.map(shop => <article className="panel shop-card" key={shop.id}>
              <div className="shop-card-head"><span className="shop-logo" aria-hidden="true">{shop.name.slice(0, 1).toUpperCase()}</span><span className={`shop-status ${shop.isActive ? 'is-active' : 'is-inactive'}`}>{shop.isActive ? 'Active' : 'Inactive'}</span></div>
              <h2>{shop.name}</h2>
              <span className="shop-slug">{shop.slug}</span>
              {shop.websiteUrl && (safeWebsiteLink(shop.websiteUrl)
                ? <a className="shop-website" href={safeWebsiteLink(shop.websiteUrl)!} target="_blank" rel="noreferrer">{shop.websiteUrl}</a>
                : <span className="shop-website">{shop.websiteUrl}</span>)}
              <div className="shop-card-meta"><span><small>Shop ID</small><b>{shop.id}</b></span></div>
              {(canUpdate || canDelete) && <div className="shop-actions">
                {canUpdate && <button className="outline-button small" onClick={() => openEdit(shop)}>Edit</button>}
                {canDelete && <button className="shop-delete-button" onClick={() => void remove(shop)}>Delete</button>}
              </div>}
            </article>)}
          </section>
          <section className="panel shops-pagination" aria-label="Partner shops pagination">
            <span>Showing {totalItems === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} of {totalItems} shops</span>
            <label>Rows per page <select aria-label="Rows per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label>
            <div><button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>‹</button><span>Page {page} of {pageCount}</span><button aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage(value => value + 1)}>›</button></div>
          </section>
        </>}
    {formOpen && <ShopForm shop={editing} onCancel={() => { setFormOpen(false); setEditing(null); }} onSave={save} />}
  </div>;
}

function ShopsLoading() {
  return <section className="shop-grid shops-loading" role="status" aria-label="Loading partner shops" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div className="panel shop-card" key={index}><i /><i /><i /><i /></div>)}</section>;
}

function ShopForm({ shop, onCancel, onSave }: { shop: AdminShop | null; onCancel: () => void; onSave: (input: ShopInput) => Promise<void> }) {
  const [slug, setSlug] = useState(shop?.slug ?? '');
  const [name, setName] = useState(shop?.name ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(shop?.websiteUrl ?? '');
  const [isActive, setIsActive] = useState(shop?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await onSave({ slug: slug.trim(), name: name.trim(), websiteUrl: websiteUrl.trim() || null, isActive });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save this shop.');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="shop-form-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) onCancel(); }}>
    <section className="shop-form-dialog" role="dialog" aria-modal="true" aria-labelledby="shop-form-title">
      <div className="shop-form-heading"><div><span className="eyebrow">PARTNER SHOPS</span><h2 id="shop-form-title">{shop ? 'Edit shop' : 'Add shop'}</h2><p>Enter the details used to identify this partner shop.</p></div><button className="banned-close-button" aria-label="Close" disabled={submitting} onClick={onCancel}>×</button></div>
      <form onSubmit={event => void submit(event)}>
        <label className="banned-field" htmlFor="shop-slug"><span>Slug <b>*</b></span><input id="shop-slug" required value={slug} onChange={event => setSlug(event.target.value)} /></label>
        <label className="banned-field" htmlFor="shop-name"><span>Name <b>*</b></span><input id="shop-name" required value={name} onChange={event => setName(event.target.value)} /></label>
        <label className="banned-field" htmlFor="shop-website"><span>Website URL</span><input id="shop-website" inputMode="url" maxLength={2048} value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder="https://example.com" /></label>
        <label className="shop-active-toggle"><input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} /><span><b>Active</b><small>Shop is available to the catalog.</small></span></label>
        {error && <div className="banned-alert" role="alert">{error}</div>}
        <div className="banned-form-actions"><button className="outline-button" type="button" disabled={submitting} onClick={onCancel}>Cancel</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Saving…' : shop ? 'Save changes' : 'Add shop'}</button></div>
      </form>
    </section>
  </div>;
}
