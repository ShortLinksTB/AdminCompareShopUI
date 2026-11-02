import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminRequest, Page } from './bannedItemsApi';
import { createPartnerShop, deletePartnerShop, getPartnerShops, updatePartnerShop, type PartnerShop, type ShopInput } from './shopsApi';
import './partnerShops.css';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const emptyPage: Page<PartnerShop> = { items: [], pageNumber: 1, pageSize: 20, totalItems: 0 };

export function PartnerShops({ requestAdmin, permissions }: { requestAdmin: AdminRequest; permissions: string[] }) {
  const [result, setResult] = useState(emptyPage);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PartnerShop | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async (requestedPage = page, requestedSize = pageSize) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPartnerShops(requestAdmin, requestedPage, requestedSize);
      setResult(data);
      setPage(data.pageNumber);
      setPageSize(data.pageSize);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load partner shops. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [requestAdmin, page, pageSize]);

  useEffect(() => { void load(1, 20); }, [requestAdmin]);

  const can = (permission: string) => permissions.includes(permission);
  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing === undefined) return;
    const form = new FormData(event.currentTarget);
    const input: ShopInput = {
      slug: String(form.get('slug') ?? '').trim(),
      name: String(form.get('name') ?? '').trim(),
      websiteUrl: String(form.get('websiteUrl') ?? '').trim() || undefined,
      isActive: form.get('isActive') === 'on',
    };
    setSaving(true);
    setError(null);
    try {
      if (editing) await updatePartnerShop(requestAdmin, editing.id, input);
      else await createPartnerShop(requestAdmin, input);
      setEditing(undefined);
      await load(page, pageSize);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this shop. Your values are still here; please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(shop: PartnerShop) {
    if (!window.confirm(`Delete ${shop.name}?`)) return;
    setDeletingId(shop.id);
    setError(null);
    try {
      await deletePartnerShop(requestAdmin, shop.id);
      const nextTotal = Math.max(0, result.totalItems - 1);
      const nextPage = page > 1 && (page - 1) * pageSize >= nextTotal ? page - 1 : page;
      setResult(current => ({ ...current, items: current.items.filter(item => item.id !== shop.id), totalItems: nextTotal }));
      await load(nextPage, pageSize);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete this shop. It remains in the list; please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  return <div className="partner-shops-page">
    <div className="page-header"><div><span className="eyebrow">AFFILIATE &amp; DATA</span><h1>Partner Shops</h1><p>Manage partner shop details and availability.</p></div>{can('shops.create') && <button className="primary-button" onClick={() => setEditing(null)}>+ Add shop</button>}</div>
    {error && <div className="partner-shops-alert" role="alert"><span>{error}</span><button className="outline-button small" onClick={() => void load()}>Retry</button></div>}
    {loading ? <section className="partner-shop-grid" aria-label="Loading partner shops" role="status">{Array.from({ length: 4 }, (_, i) => <div className="panel partner-shop-skeleton" key={i}><i /><i /><i /></div>)}</section>
      : !error && result.items.length === 0 ? <section className="panel empty-state">No partner shops found.</section>
      : <section className="partner-shop-grid">{result.items.map(shop => <article className="panel shop-card" key={shop.id}>
        <div className="shop-card-head"><span className="shop-logo" aria-hidden="true">{shop.name.slice(0, 1).toUpperCase()}</span><code>#{shop.id}</code></div>
        <h2>{shop.name}</h2><p className="partner-shop-slug">{shop.slug}</p>
        {shop.websiteUrl && <a className="partner-shop-website" href={shop.websiteUrl} target="_blank" rel="noreferrer">{shop.websiteUrl}</a>}
        <div className="shop-footer"><span className={`status ${shop.isActive ? 'status-active' : 'status-disabled'}`}>{shop.isActive ? 'Active' : 'Inactive'}</span><div className="partner-shop-actions">
          {can('shops.update') && <button className="outline-button small" onClick={() => setEditing(shop)}>Edit</button>}
          {can('shops.delete') && <button className="outline-button small" disabled={deletingId === shop.id} onClick={() => void remove(shop)}>{deletingId === shop.id ? 'Deleting…' : 'Delete'}</button>}
        </div></div>
      </article>)}</section>}
    <div className="table-footer partner-shop-pagination"><span>Showing {result.totalItems === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, result.totalItems)} of {result.totalItems} shops</span><label>Rows per page <select aria-label="Rows per page" value={pageSize} onChange={event => { const size = Number(event.target.value); setPage(1); setPageSize(size); void load(1, size); }}>{PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}</select></label><div><button aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>‹</button><span>Page {page} of {totalPages}</span><button aria-label="Next page" disabled={page >= totalPages || loading} onClick={() => void load(page + 1)}>›</button></div></div>
    {editing !== undefined && <div className="partner-shop-dialog-backdrop"><section className="panel partner-shop-dialog" role="dialog" aria-modal="true" aria-labelledby="partner-shop-form-title"><form onSubmit={event => void submit(event)}>
      <div className="panel-heading"><div><h2 id="partner-shop-form-title">{editing ? 'Edit shop' : 'Add shop'}</h2><p>Enter the partner shop details.</p></div><button type="button" className="row-menu" aria-label="Close" disabled={saving} onClick={() => setEditing(undefined)}>×</button></div>
      <label>Slug<input name="slug" required defaultValue={editing?.slug ?? ''} /></label>
      <label>Name<input name="name" required defaultValue={editing?.name ?? ''} /></label>
      <label>Website URL (optional)<input name="websiteUrl" type="text" maxLength={2048} defaultValue={editing?.websiteUrl ?? ''} /></label>
      <label className="partner-shop-active"><input name="isActive" type="checkbox" defaultChecked={editing?.isActive ?? true} /> Active</label>
      <div className="partner-shop-dialog-actions"><button className="outline-button" type="button" disabled={saving} onClick={() => setEditing(undefined)}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save shop'}</button></div>
    </form></section></div>}
  </div>;
}
