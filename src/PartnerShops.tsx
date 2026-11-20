import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AdminRequest, Page } from './bannedItemsApi';
import { createPartnerShop, deletePartnerShop, getPartnerShops, updatePartnerShop, type PartnerShop, type ShopInput } from './shopsApi';
import { getCountries, type Country } from './countries/countries-api';
import { Button, Card, DataTable, EmptyState, Field, FilterChips, Modal, PageHeader, Pager, Pill, Select, Switch, TableFooter } from './ui';
import './partnerShops.css';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const API_PAGE_SIZE = 100;
const emptyPage: Page<PartnerShop> = { items: [], pageNumber: 1, pageSize: 20, totalItems: 0 };
type VisibilityFilter = 'all' | 'shown' | 'hidden';
type PartnerShopToast = { message: string; variant: 'success' | 'error' };

function generateShopSlug(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, match => match === 'đ' ? 'd' : 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function PartnerShops({ requestAdmin, permissions }: { requestAdmin: AdminRequest; permissions: string[] }) {
  const [result, setResult] = useState(emptyPage);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countriesError, setCountriesError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PartnerShop | null | undefined>(undefined);
  const [showOnHomeDraft, setShowOnHomeDraft] = useState(false);
  const [isActiveDraft, setIsActiveDraft] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingIds, setUpdatingIds] = useState<number[]>([]);
  const [filter, setFilter] = useState<VisibilityFilter>('all');
  const [toast, setToast] = useState<PartnerShopToast | null>(null);

  const load = useCallback(async (requestedPage = page, requestedSize = pageSize) => {
    setLoading(true);
    setError(null);
    try {
      const firstPage = await getPartnerShops(requestAdmin, 1, API_PAGE_SIZE);
      const pageCount = Math.ceil(firstPage.totalItems / firstPage.pageSize);
      const remainingPages = await Promise.all(Array.from(
        { length: Math.max(0, pageCount - 1) },
        (_, index) => getPartnerShops(requestAdmin, index + 2, API_PAGE_SIZE),
      ));
      const items = [firstPage, ...remainingPages].flatMap(data => data.items);
      const totalItems = firstPage.totalItems;
      const requestedPageCount = Math.max(1, Math.ceil(totalItems / requestedSize));
      setResult({ ...firstPage, items, totalItems });
      setPage(Math.min(requestedPage, requestedPageCount));
      setPageSize(requestedSize);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load partner shops. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [requestAdmin, page, pageSize]);

  useEffect(() => { void load(1, 20); }, [requestAdmin]);

  useEffect(() => {
    const controller = new AbortController();
    setCountriesLoading(true);
    setCountriesError(null);
    getCountries(requestAdmin, controller.signal)
      .then(items => setCountries(items))
      .catch(reason => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
          setCountriesError(reason instanceof Error ? reason.message : 'Could not load countries. Please try again.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setCountriesLoading(false); });
    return () => controller.abort();
  }, [requestAdmin]);

  const can = (permission: string) => permissions.includes(permission);
  const shownCount = result.items.filter(shop => shop.showOnHome).length;
  const hiddenCount = result.items.length - shownCount;
  const filteredShops = result.items.filter(shop => filter === 'all' || (filter === 'shown' ? shop.showOnHome : !shop.showOnHome));
  const totalPages = Math.max(1, Math.ceil(filteredShops.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const displayedShops = filteredShops.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const rangeStart = filteredShops.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, filteredShops.length);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const previewShops = useMemo(() => result.items.filter(shop => shop.isActive && shop.showOnHome)
    .sort((a, b) => (a.homeDisplayOrder ?? Number.MAX_SAFE_INTEGER) - (b.homeDisplayOrder ?? Number.MAX_SAFE_INTEGER) || a.id - b.id), [result.items]);

  async function toggleVisibility(shop: PartnerShop, showOnHome: boolean) {
    if (!can('shops.update') || !shop.isActive || updatingIds.includes(shop.id)) return;
    const previous = shop.showOnHome;
    setUpdatingIds(ids => [...ids, shop.id]);
    setToast(null);
    setResult(current => ({ ...current, items: current.items.map(item => item.id === shop.id ? { ...item, showOnHome } : item) }));
    try {
      await updatePartnerShop(requestAdmin, shop.id, { slug: shop.slug, name: shop.name, countryId: shop.countryId, websiteUrl: shop.websiteUrl ?? undefined, isActive: shop.isActive, showOnHome, homeDisplayOrder: shop.homeDisplayOrder ?? undefined });
      setToast({ message: showOnHome ? `${shop.name} sẽ hiển thị ở trang chủ.` : `${shop.name} đã được ẩn khỏi trang chủ.`, variant: 'success' });
    } catch (reason) {
      setResult(current => ({ ...current, items: current.items.map(item => item.id === shop.id ? { ...item, showOnHome: previous } : item) }));
      setToast({ message: reason instanceof Error ? `Không thể cập nhật hiển thị: ${reason.message}` : 'Không thể cập nhật hiển thị. Đã khôi phục trạng thái trước đó.', variant: 'error' });
    } finally {
      setUpdatingIds(ids => ids.filter(id => id !== shop.id));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing === undefined) return;
    const form = new FormData(event.currentTarget);
    const orderValue = String(form.get('homeDisplayOrder') ?? '').trim();
    const name = String(form.get('name') ?? '').trim();
    const countryId = Number(form.get('countryId'));
    const submittedSlug = String(form.get('slug') ?? '').trim();
    const selectedCountry = countries.find(country => country.id === countryId);
    const unchangedInactiveCountry = Boolean(editing && selectedCountry && !selectedCountry.isActive && editing.countryId === countryId);
    if (!selectedCountry || (!selectedCountry.isActive && !unchangedInactiveCountry)) {
      setError('Select an active Country for this shop.');
      return;
    }
    const input: ShopInput = {
      slug: submittedSlug || generateShopSlug(name),
      name,
      countryId,
      websiteUrl: String(form.get('websiteUrl') ?? '').trim() || undefined,
      isActive: isActiveDraft,
      showOnHome: showOnHomeDraft,
      homeDisplayOrder: orderValue ? Number(orderValue) : undefined,
    };
    setSaving(true);
    setError(null);
    setToast(null);
    try {
      if (editing) await updatePartnerShop(requestAdmin, editing.id, input);
      else await createPartnerShop(requestAdmin, input);
      setEditing(undefined);
      setToast({ message: editing ? 'Đã lưu thay đổi shop.' : 'Đã thêm shop.', variant: 'success' });
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
    <PageHeader eyebrow="AFFILIATE & DATA" title="Partner Shops" description="Active xác định shop còn hoạt động. Hiển thị ở trang chủ là cài đặt riêng cho mục Đối tác." actions={can('shops.create') && <Button tone="primary" disabled={countriesLoading || Boolean(countriesError) || !countries.some(country => country.isActive)} onClick={() => { setShowOnHomeDraft(false); setIsActiveDraft(true); setEditing(null); }}>+ Add shop</Button>} />
    {error && <div className="partner-shop-alert" role="alert"><span>{error}</span><Button size="sm" onClick={() => void load()}>Retry</Button></div>}
    {countriesError && <div className="partner-shop-alert" role="alert"><span>{countriesError}</span><Button size="sm" onClick={() => { setCountriesLoading(true); setCountriesError(null); getCountries(requestAdmin).then(setCountries).catch(reason => setCountriesError(reason instanceof Error ? reason.message : 'Could not load countries. Please try again.')).finally(() => setCountriesLoading(false)); }}>Retry countries</Button></div>}
    {toast && <div className={`partner-shop-toast partner-shop-toast--${toast.variant}`} role={toast.variant === 'error' ? 'alert' : 'status'}><span>{toast.message}</span><Button size="sm" tone="ghost" aria-label="Đóng thông báo" onClick={() => setToast(null)}>×</Button></div>}
    <FilterChips label="Lọc theo hiển thị trang chủ" value={filter} onChange={value => { setFilter(value as VisibilityFilter); setPage(1); }} items={[
      { value: 'all', label: 'Tất cả', count: result.items.length },
      { value: 'shown', label: 'Đang hiển thị', count: shownCount },
      { value: 'hidden', label: 'Đang ẩn', count: hiddenCount },
    ]} />
    {result.items.filter(shop => shop.isActive && shop.showOnHome).length > 12 && <div className="partner-shop-limit" role="status">Trang chủ chỉ hiển thị 12 đối tác đầu theo thứ tự. Các shop vượt quá 12 vẫn được bật nhưng không xuất hiện.</div>}
    <Card className="partner-shop-table-card">
      <DataTable className="partner-shop-table-wrap" aria-label="Partner shops">
        <thead><tr><th>Shop</th><th>Country</th><th>Website</th><th>Hoạt động</th><th><span>Hiển thị ở trang chủ</span><small>Khác với trạng thái hoạt động</small></th><th>Thứ tự</th><th aria-label="Actions" /></tr></thead>
        <tbody>
          {loading && <tr><td colSpan={7}><div className="partner-shop-table-loading" role="status" aria-label="Loading partner shops">Đang tải danh sách shop…</div></td></tr>}
          {!loading && displayedShops.map(shop => <tr key={shop.id}>
            <td className="partner-shop-name"><b>{shop.name}</b><small>{shop.slug} · #{shop.id}</small></td>
            <td>{(() => { const country = countries.find(item => item.id === shop.countryId); return <span className="partner-shop-country">{country ? `${country.code} · ${country.name}` : shop.countryName || shop.countryCode || `Country #${shop.countryId}`}{country && !country.isActive && <small>Inactive</small>}</span>; })()}</td>
            <td>{shop.websiteUrl ? <a className="partner-shop-website" href={shop.websiteUrl} target="_blank" rel="noreferrer">{shop.websiteUrl}</a> : <span className="partner-shop-muted">—</span>}</td>
            <td><Pill tone={shop.isActive ? 'ok' : 'neutral'}>{shop.isActive ? 'Active' : 'Inactive'}</Pill></td>
            <td><div className="partner-shop-toggle-cell"><Switch checked={shop.showOnHome} disabled={!shop.isActive || !can('shops.update') || updatingIds.includes(shop.id)} label={`Hiển thị ${shop.name} ở trang chủ`} onChange={checked => void toggleVisibility(shop, checked)} />
              {updatingIds.includes(shop.id) ? <small role="status">Đang lưu…</small> : !shop.isActive ? <small>Shop không hoạt động sẽ không hiện ở trang chủ</small> : null}</div></td>
            <td>{shop.showOnHome ? shop.homeDisplayOrder ?? '—' : <span className="partner-shop-muted">—</span>}</td>
            <td className="partner-shop-actions-cell">{can('shops.update') && <Button size="sm" onClick={() => { setShowOnHomeDraft(shop.showOnHome); setIsActiveDraft(shop.isActive); setEditing(shop); }}>Sửa</Button>} {can('shops.delete') && <Button size="sm" tone="danger" disabled={deletingId === shop.id} onClick={() => void remove(shop)}>{deletingId === shop.id ? 'Đang xoá…' : 'Xoá'}</Button>}</td>
          </tr>)}
          {!loading && filteredShops.length === 0 && <tr><td colSpan={7}><EmptyState title={error ? 'Không thể tải danh sách shop.' : filter === 'all' ? 'Chưa có partner shop.' : 'Không có shop trong bộ lọc này.'} /></td></tr>}
        </tbody>
      </DataTable>
      <TableFooter start={rangeStart} end={rangeEnd} total={filteredShops.length} startContent={<span>Showing {rangeStart}–{rangeEnd} of {filteredShops.length} shops</span>} center={<label className="partner-shop-page-size">Rows per page <Select size="sm" aria-label="Rows per page" value={pageSize} disabled={loading} onChange={event => { const size = Number(event.target.value); setPage(1); setPageSize(size); }}>{PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}</Select></label>}>
        <Pager page={currentPage} pages={totalPages} previousLabel="Previous page" nextLabel="Next page" formatPage={(current, count) => `Page ${current} of ${count}`} disabled={loading} onChange={setPage} />
      </TableFooter>
    </Card>
    <Card className="partner-shop-preview"><div><h2>Xem trước mục “Đối tác của chúng tôi” ở trang chủ</h2><p>Tối đa 12 shop đang hoạt động, theo thứ tự hiển thị.</p></div>
      {previewShops.length ? <div className="partner-shop-preview-grid">{previewShops.map((shop, index) => <div className={`partner-shop-preview-tile${index >= 12 ? ' is-over-limit' : ''}`} key={shop.id} title={shop.name}><span>{shop.name}</span>{index >= 12 && <small>Không hiển thị</small>}</div>)}</div> : <p className="partner-shop-preview-empty">Chưa có shop đang hoạt động được bật hiển thị. Mục này sẽ ẩn khỏi trang chủ.</p>}
      {previewShops.length > 12 && <p className="partner-shop-limit">Trang chủ chỉ hiển thị 12 đối tác đầu theo thứ tự.</p>}
    </Card>
    <div className="partner-shop-explainer"><b>Hoạt động và hiển thị là hai cài đặt riêng.</b> Shop không hoạt động sẽ không xuất hiện trên trang chủ dù cờ hiển thị đang bật.</div>
    {editing !== undefined && <Modal open onClose={() => !saving && setEditing(undefined)} title={editing ? `Sửa shop · ${editing.name}` : 'Add shop'} className="partner-shop-modal" actions={<><Button tone="ghost" type="button" disabled={saving} onClick={() => setEditing(undefined)}>Cancel</Button><Button tone="primary" type="submit" form="partner-shop-form" disabled={saving}>{saving ? 'Saving…' : 'Save shop'}</Button></>}>
      <form id="partner-shop-form" className="partner-shop-form" onSubmit={event => void submit(event)}>
        <p>Enter the partner shop details.</p>
        <Field label="Slug (Không bắt buộc)" name="slug" placeholder="Tự động sinh từ tên nếu để trống" defaultValue={editing?.slug ?? ''} />
        <Field label="Name" name="name" required defaultValue={editing?.name ?? ''} />
        <label className="partner-shop-country-field" htmlFor="partner-shop-country">Country<select id="partner-shop-country" name="countryId" required defaultValue={editing?.countryId ?? ''} disabled={countriesLoading || Boolean(countriesError)}><option value="" disabled>Select a country</option>{countries.filter(country => country.isActive || (editing && country.id === editing.countryId)).map(country => <option key={country.id} value={country.id}>{country.code} · {country.name}{country.isActive ? '' : ' · Inactive'}</option>)}</select>{countriesError && <small role="alert">Country choices are unavailable until the list can be loaded.</small>}</label>
        <Field label="Website URL (optional)" name="websiteUrl" type="text" maxLength={2048} defaultValue={editing?.websiteUrl ?? ''} />
        <label className="partner-shop-active"><input className="studio-checkbox" name="isActive" type="checkbox" checked={isActiveDraft} onChange={event => { const active = event.target.checked; setIsActiveDraft(active); if (!active) setShowOnHomeDraft(false); }} /> Active</label>
        <div className="partner-shop-modal-switch"><div><b>Hiển thị ở trang chủ</b><small>Bật để shop xuất hiện trong mục Đối tác trên trang chủ.</small></div><Switch checked={showOnHomeDraft} disabled={!isActiveDraft} label="Hiển thị ở trang chủ" onChange={setShowOnHomeDraft} />{!isActiveDraft && <small>Shop không hoạt động nên không thể hiển thị ở trang chủ.</small>}</div>
        <Field label="Thứ tự hiển thị" name="homeDisplayOrder" type="number" min={1} max={99} defaultValue={editing?.homeDisplayOrder ?? ''} />
        <small className="partner-shop-order-help">Số nhỏ hiển thị trước. Chỉ áp dụng khi bật hiển thị.</small>
      </form>
    </Modal>}
  </div>;
}
