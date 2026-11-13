import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminRequest, Page } from './bannedItemsApi';
import { createPartnerShop, deletePartnerShop, getPartnerShops, updatePartnerShop, type PartnerShop, type ShopInput } from './shopsApi';
import { Button, Card, EmptyState, Field, Modal, PageHeader, Pager, Pill, Select, TableFooter } from './ui';
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
    <PageHeader eyebrow="Catalog" title="Partner Shops" description="Manage partner shop details and availability." actions={can('shops.create') && <Button tone="primary" onClick={() => setEditing(null)}>+ Add shop</Button>} />
    {error && <div className="partner-shop-alert" role="alert"><span>{error}</span><Button size="sm" onClick={() => void load()}>Retry</Button></div>}
    {loading ? <section className="partner-shop-grid" aria-label="Loading partner shops" role="status">{Array.from({ length: 4 }, (_, i) => <Card as="article" className="partner-shop-skeleton" key={i} aria-hidden="true"><i /><i /><i /></Card>)}</section>
      : !error && result.items.length === 0 ? <Card className="partner-shop-empty"><EmptyState title="No partner shops found." /></Card>
      : <section className="partner-shop-grid" aria-label="Partner shops">{result.items.map(shop => <Card as="article" className="shop-card" key={shop.id}>
        <div className="shop-card-head"><span className="shop-logo" aria-hidden="true">{shop.name.slice(0, 1).toUpperCase()}</span><code className="studio-tabular">#{shop.id}</code></div>
        <h2>{shop.name}</h2><p className="partner-shop-slug">{shop.slug}</p>
        {shop.websiteUrl && <a className="partner-shop-website" href={shop.websiteUrl} target="_blank" rel="noreferrer">{shop.websiteUrl}</a>}
        <div className="shop-card-bottom"><Pill tone={shop.isActive ? 'ok' : 'neutral'}>{shop.isActive ? 'Active' : 'Inactive'}</Pill><div className="partner-shop-actions">
          {can('shops.update') && <Button size="sm" onClick={() => setEditing(shop)}>Edit</Button>}
          {can('shops.delete') && <Button size="sm" tone="danger" disabled={deletingId === shop.id} onClick={() => void remove(shop)}>{deletingId === shop.id ? 'Deleting…' : 'Delete'}</Button>}
        </div></div>
      </Card>)}</section>}
    <TableFooter start={result.totalItems === 0 ? 0 : (page - 1) * pageSize + 1} end={Math.min(page * pageSize, result.totalItems)} total={result.totalItems} startContent={<span>Showing {result.totalItems === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, result.totalItems)} of {result.totalItems} shops</span>} center={<label className="partner-shop-page-size">Rows per page <Select size="sm" aria-label="Rows per page" value={pageSize} disabled={loading} onChange={event => { const size = Number(event.target.value); setPage(1); setPageSize(size); void load(1, size); }}>{PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}</Select></label>}>
      <Pager page={page} pages={totalPages} previousLabel="Previous page" nextLabel="Next page" formatPage={(current, count) => `Page ${current} of ${count}`} disabled={loading} onChange={next => void load(next)} />
    </TableFooter>
    {editing !== undefined && <Modal open onClose={() => !saving && setEditing(undefined)} closeLabel="Close" closeDisabled={saving} title={editing ? 'Edit shop' : 'Add shop'} className="partner-shop-modal" actions={<><Button tone="ghost" type="button" disabled={saving} onClick={() => setEditing(undefined)}>Cancel</Button><Button tone="primary" type="submit" form="partner-shop-form" disabled={saving}>{saving ? 'Saving…' : 'Save shop'}</Button></>}>
      <form id="partner-shop-form" className="partner-shop-form" onSubmit={event => void submit(event)}>
        <p>Enter the partner shop details.</p>
        <Field label="Slug" name="slug" required defaultValue={editing?.slug ?? ''} />
        <Field label="Name" name="name" required defaultValue={editing?.name ?? ''} />
        <Field label="Website URL (optional)" name="websiteUrl" type="text" maxLength={2048} defaultValue={editing?.websiteUrl ?? ''} />
        <label className="partner-shop-active"><input className="studio-checkbox" name="isActive" type="checkbox" defaultChecked={editing?.isActive ?? true} /> Active</label>
      </form>
    </Modal>}
  </div>;
}
