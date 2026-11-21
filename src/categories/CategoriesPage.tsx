import { useEffect, useState, type FormEvent } from 'react';
import type { AdminRequest, Page } from '../bannedItemsApi';
import { getCountries, type Country } from '../countries/countries-api';
import { createCategory, deleteCategory, getAllCategories, getCategories, updateCategory, type AdminCategory, type CategoryInput } from './categories-api';
import { AdminCompareShopCategoriesImportExport } from './AdminCompareShopCategoriesImportExport';
import { Button, Card, DataTable, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pager, Pill, RowMenu, SearchField, Select, TableFooter, Toolbar } from '../ui';
import './categories.css';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const emptyPage: Page<AdminCategory> = { items: [], pageNumber: 1, pageSize: 20, totalItems: 0 };
type CategoryFormFields = Omit<CategoryInput, 'countryId'>;
const emptyInput: CategoryFormFields = { slug: '', name: '', isActive: true, parentCategoryId: null };

type EditorState = { category: AdminCategory | null; initial: CategoryFormFields } | null;

export function CategoriesPage({ requestAdmin, permissions }: { requestAdmin: AdminRequest; permissions: string[] }) {
  const [result, setResult] = useState(emptyPage);
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountryId, setSelectedCountryId] = useState<number | null>(null);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countriesError, setCountriesError] = useState<string | null>(null);
  const [countriesReloadKey, setCountriesReloadKey] = useState(0);
  const [listReloadKey, setListReloadKey] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [editorCountryId, setEditorCountryId] = useState<number | null>(null);
  const [editorParentCategoryId, setEditorParentCategoryId] = useState<number | null>(null);
  const [parentChoices, setParentChoices] = useState<AdminCategory[]>([]);
  const [parentChoicesLoading, setParentChoicesLoading] = useState(false);
  const [parentChoicesError, setParentChoicesError] = useState<string | null>(null);
  const [parentChoicesReloadKey, setParentChoicesReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const controller = new AbortController();
    setCountriesLoading(true);
    setCountriesError(null);
    getCountries(requestAdmin, controller.signal)
      .then(items => {
        if (controller.signal.aborted) return;
        setCountries(items);
        setSelectedCountryId(current => current !== null && items.some(country => country.id === current && country.isActive)
          ? current
          : items.find(country => country.isActive)?.id ?? null);
      })
      .catch(reason => {
        if (controller.signal.aborted) return;
        setCountries([]);
        setSelectedCountryId(null);
        setCountriesError(reason instanceof Error ? reason.message : 'Không thể tải countries. Vui lòng thử lại.');
      })
      .finally(() => { if (!controller.signal.aborted) setCountriesLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, countriesReloadKey]);

  useEffect(() => {
    if (selectedCountryId === null) {
      setResult(emptyPage);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setListError(null);
    getCategories(requestAdmin, page, pageSize, selectedCountryId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch(reason => {
        if (!controller.signal.aborted) setListError(reason instanceof Error ? reason.message : 'Không thể tải categories. Vui lòng thử lại.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, selectedCountryId, page, pageSize, listReloadKey]);

  useEffect(() => {
    if (!editor || editorCountryId === null) {
      setParentChoices([]);
      setParentChoicesError(null);
      return;
    }
    const controller = new AbortController();
    setParentChoicesLoading(true);
    setParentChoicesError(null);
    getAllCategories(requestAdmin, editorCountryId, controller.signal)
      .then(items => { if (!controller.signal.aborted) setParentChoices(items); })
      .catch(reason => {
        if (!controller.signal.aborted) {
          setParentChoices([]);
          setParentChoicesError(reason instanceof Error ? reason.message : 'Không thể tải parent categories. Vui lòng thử lại.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setParentChoicesLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, editor, editorCountryId, parentChoicesReloadKey]);
  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.studio-row-menu')) setOpenMenu(null);
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, []);

  const canCreate = permissions.includes('categories.create');
  const canUpdate = permissions.includes('categories.update');
  const canDelete = permissions.includes('categories.delete');
  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));
  const openCreate = () => {
    if (selectedCountryId === null) return;
    setFormError(null);
    setEditorCountryId(selectedCountryId);
    setEditorParentCategoryId(null);
    setEditor({ category: null, initial: emptyInput });
  };
  const openEdit = (category: AdminCategory) => {
    setFormError(null);
    const countryId = category.countryId ?? selectedCountryId;
    setEditorCountryId(countryId ?? null);
    setEditorParentCategoryId(category.parentCategoryId ?? null);
    setEditor({ category, initial: { slug: category.slug, name: category.name, isActive: category.isActive, parentCategoryId: category.parentCategoryId ?? null } });
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget);
    const input: CategoryInput = {
      slug: String(form.get('slug') ?? '').trim(),
      name: String(form.get('name') ?? '').trim(),
      isActive: form.get('isActive') === 'on',
      countryId: Number(form.get('countryId')),
      parentCategoryId: form.get('parentCategoryId') ? Number(form.get('parentCategoryId')) : null,
    };
    if (!input.slug || !input.name || input.slug.length > 160 || input.name.length > 200) {
      setFormError('Nhập slug và name hợp lệ (slug tối đa 160 ký tự, name tối đa 200 ký tự).');
      return;
    }
    const assignedCountry = countries.find(country => country.id === input.countryId);
    const unchangedInactiveCountry = Boolean(editor.category && assignedCountry && !assignedCountry.isActive && editor.category.countryId === input.countryId);
    if (!assignedCountry || (!assignedCountry.isActive && !unchangedInactiveCountry)) {
      setFormError('Chọn một Country đang hoạt động.');
      return;
    }
    if (input.parentCategoryId !== null) {
      const parent = parentChoices.find(category => category.id === input.parentCategoryId);
      const unchangedInactiveParent = Boolean(parent && !parent.isActive && editor.category?.parentCategoryId === parent.id);
      if (!parent || parent.countryId !== input.countryId || parent.parentCategoryId != null || (!parent.isActive && !unchangedInactiveParent) || parent.id === editor.category?.id) {
        setFormError('Chọn một parent category đang hoạt động trong cùng Country.');
        return;
      }
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editor.category) await updateCategory(requestAdmin, editor.category.id, input);
      else await createCategory(requestAdmin, input);
      setEditor(null);
      setEditorCountryId(null);
      setEditorParentCategoryId(null);
      setListReloadKey(value => value + 1);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Không thể lưu category. Giá trị đã nhập được giữ lại; vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(category: AdminCategory) {
    if (!window.confirm(`Xoá category “${category.name}”?`)) return;
    setDeletingId(category.id);
    setListError(null);
    setDeleteError(null);
    try {
      await deleteCategory(requestAdmin, category.id);
      const nextTotal = Math.max(0, result.totalItems - 1);
      const nextPage = page > 1 && (page - 1) * pageSize >= nextTotal ? page - 1 : page;
      if (nextPage !== page) setPage(nextPage);
      else setListReloadKey(value => value + 1);
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Không thể xoá category. Vui lòng thử lại.');
    } finally {
      setDeletingId(null);
    }
  }

  const activeCountries = countries.filter(country => country.isActive);
  const selectedCountry = countries.find(country => country.id === selectedCountryId);
  const countriesById = new Map(countries.map(country => [country.id, country]));
  const categoriesInCountry = result.items.filter(category => category.countryId === selectedCountryId);
  const categoriesById = new Map(categoriesInCountry.map(category => [category.id, category]));
  const matchingCategories = categoriesInCountry.filter(category => `${category.name} ${category.slug}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const visibleIds = new Set(matchingCategories.flatMap(category => category.parentCategoryId == null ? [category.id] : [category.id, category.parentCategoryId]));
  const visibleCategories = categoriesInCountry.filter(category => visibleIds.has(category.id));
  const availableParents = parentChoices.filter(category => category.countryId === editorCountryId && category.parentCategoryId == null && (category.isActive || category.id === editor?.category?.parentCategoryId) && category.id !== editor?.category?.id);
  const orderedCategories = visibleCategories.filter(category => category.parentCategoryId == null).flatMap(parent => [parent, ...visibleCategories.filter(category => category.parentCategoryId === parent.id)]);
  const orphanedChildren = visibleCategories.filter(category => category.parentCategoryId != null && !categoriesById.has(category.parentCategoryId));
  const filteredTotal = matchingCategories.length;
  const displayedTotal = search.trim() ? filteredTotal : result.totalItems;
  const rangeStart = search.trim() ? (filteredTotal ? 1 : 0) : result.totalItems ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = search.trim() ? filteredTotal : Math.min(page * pageSize, result.totalItems);

  return <div className="categories-page">
    <PageHeader eyebrow="SYSTEM" title="Categories" description="Taxonomy sản phẩm — CRUD qua /admin/categories, theo đúng pattern Partner Shops." actions={<>
      <AdminCompareShopCategoriesImportExport requestAdmin={requestAdmin} canImport={canCreate && canUpdate && canDelete} onApplied={() => setListReloadKey(value => value + 1)} />
      {canCreate && <Button tone="primary" disabled={selectedCountryId === null || !selectedCountry?.isActive || countriesLoading || Boolean(countriesError)} onClick={openCreate}>+ Thêm category</Button>}
    </>} />

    {countriesError && <ErrorState title={countriesError}><Button size="sm" onClick={() => setCountriesReloadKey(value => value + 1)}>Thử lại countries</Button></ErrorState>}
    {listError && <ErrorState title={listError}><Button size="sm" onClick={() => setListReloadKey(value => value + 1)}>Thử lại</Button></ErrorState>}
    {deleteError && <ErrorState title={deleteError} />}
    <Card className="categories-card" aria-label="Categories">
      <Toolbar className="categories-toolbar">
        <label className="categories-country-context" htmlFor="categories-country-context"><span>Country</span><Select id="categories-country-context" aria-label="Country context" value={selectedCountryId ?? ''} disabled={countriesLoading || activeCountries.length === 0} onChange={event => { const countryId = Number(event.target.value); setSelectedCountryId(Number.isFinite(countryId) && countryId > 0 ? countryId : null); setResult(emptyPage); setPage(1); setSearch(''); setCollapsedIds(new Set()); }}>
          {activeCountries.map(country => <option key={country.id} value={country.id}>{country.code} · {country.name}</option>)}
          {!activeCountries.length && <option value="">No active countries</option>}
        </Select></label>
        <SearchField label="Search categories" value={search} disabled={selectedCountryId === null || Boolean(countriesError)} onChange={event => setSearch(event.target.value)} placeholder="Tìm theo tên hoặc slug..." />
      </Toolbar>
      {countriesLoading ? <div className="categories-loading" role="status" aria-label="Đang tải countries"><Loading /><span>Đang tải countries…</span></div>
        : !countriesError && activeCountries.length === 0 ? <EmptyState title="Chưa có Country nào đang hoạt động." />
          : loading ? <div className="categories-loading" role="status" aria-label="Đang tải categories"><Loading /><span>Đang tải categories…</span></div>
            : !listError && categoriesInCountry.length === 0 ? <EmptyState title="Chưa có category nào cho Country đã chọn." />
              : !listError && <DataTable className="categories-table-scroll"><thead><tr><th scope="col">Id</th><th scope="col">Name</th><th scope="col">Slug</th><th scope="col">Country</th><th scope="col">Level</th><th scope="col">Parent</th><th scope="col" aria-label="Thao tác" /></tr></thead>
            <tbody>{[...orderedCategories, ...orphanedChildren].map(category => {
              const isChild = category.parentCategoryId != null;
              const parent = !isChild ? null : categoriesById.get(category.parentCategoryId!);
              const country = countriesById.get(category.countryId);
              const countryLabel = category.countryCode && category.countryName ? `${category.countryCode} · ${category.countryName}` : country ? `${country.code} · ${country.name}` : `Country #${category.countryId}`;
              const children = visibleCategories.filter(item => item.parentCategoryId === category.id);
              const expanded = !collapsedIds.has(category.id);
              if (isChild && parent && collapsedIds.has(parent.id)) return null;
              return <tr key={category.id} className={isChild ? 'category-child-row' : 'category-parent-row'}>
                <td>{category.id}</td><td className="category-name-cell">{!isChild && children.length > 0 && <Button tone="ghost" size="sm" className={`category-hierarchy-toggle${expanded ? '' : ' collapsed'}`} aria-label={`${expanded ? 'Thu gọn' : 'Mở rộng'} ${category.name}`} aria-expanded={expanded} onClick={() => setCollapsedIds(current => { const next = new Set(current); if (next.has(category.id)) next.delete(category.id); else next.add(category.id); return next; })}>⌄</Button>}{isChild && <span className="category-indent" aria-hidden="true" />}{category.name}</td><td><code>{category.slug}</code></td><td>{countryLabel}{country && !country.isActive && <small className="categories-inactive-country">Inactive</small>}</td>
                <td><Pill tone="ok" size="sm">Level {isChild ? 2 : 1}</Pill></td><td className="category-parent-cell">{parent?.name ?? '—'}</td>
                <td>{(canUpdate || canDelete) && <RowMenu open={openMenu === category.id} onOpenChange={open => setOpenMenu(open ? category.id : null)} label={`Actions for ${category.name}`}>
                  {canUpdate && <Button tone="ghost" disabled={saving || deletingId !== null} onClick={() => { setOpenMenu(null); openEdit(category); }}>Sửa</Button>}
                  {canDelete && <Button tone="ghost" className="category-delete-action" disabled={deletingId !== null || saving} onClick={() => { setOpenMenu(null); void remove(category); }}>{deletingId === category.id ? 'Đang xoá…' : 'Xoá'}</Button>}
                </RowMenu>}</td>
              </tr>;
            })}</tbody></DataTable>}
      <TableFooter start={rangeStart} end={rangeEnd} total={displayedTotal} center={`Showing ${rangeStart}–${rangeEnd} of ${displayedTotal} categories`} startContent={<label className="categories-page-size">Hiển thị <Select size="sm" aria-label="Số dòng mỗi trang" value={pageSize} disabled={loading} onChange={event => { const size = Number(event.target.value); setPage(1); setPageSize(size); }}>{PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}</Select> dòng/trang <span className="categories-total">Tổng <b>{displayedTotal}</b> category</span></label>}>
        <Pager page={page} pages={totalPages} formatPage={(current, count) => `Page ${current} of ${count}`} onChange={setPage} />
      </TableFooter>
    </Card>

    <Modal className="categories-modal" open={editor !== null} onClose={() => !saving && setEditor(null)} title={editor?.category ? 'Sửa category' : 'Thêm category'} actions={<><Button type="button" tone="ghost" disabled={saving} onClick={() => { setEditor(null); setEditorCountryId(null); setEditorParentCategoryId(null); }}>Huỷ</Button><Button type="submit" form="categories-form" tone="primary" disabled={saving || countriesLoading || parentChoicesLoading || Boolean(parentChoicesError) || editorCountryId === null}>{saving ? 'Đang lưu…' : 'Lưu category'}</Button></>}>
      <form id="categories-form" className="categories-form" onSubmit={event => void submit(event)}>
        <p>Nhập thông tin taxonomy sản phẩm.</p>
        {formError && <ErrorState title={formError} />}
        {parentChoicesError && <ErrorState title={parentChoicesError}><Button size="sm" onClick={() => setParentChoicesReloadKey(value => value + 1)}>Thử lại parent categories</Button></ErrorState>}
        <Field label="Slug" name="slug" required maxLength={160} defaultValue={editor?.initial.slug ?? ''} />
        <Field label="Name" name="name" required maxLength={200} defaultValue={editor?.initial.name ?? ''} />
        <div className="categories-country-field"><label htmlFor="category-country-select">Country</label><Select id="category-country-select" name="countryId" required value={editorCountryId ?? ''} disabled={saving || countriesLoading || Boolean(countriesError)} onChange={event => { const countryId = Number(event.target.value); setEditorCountryId(Number.isFinite(countryId) && countryId > 0 ? countryId : null); setEditorParentCategoryId(null); setFormError(null); }}><option value="" disabled>Select a Country</option>{countries.filter(country => country.isActive || (editor?.category && country.id === editor.category.countryId)).map(country => <option key={country.id} value={country.id}>{country.code} · {country.name}{country.isActive ? '' : ' · Inactive'}</option>)}</Select></div>
        <div className="categories-parent-field"><label htmlFor="parent-category-select">Parent category</label><Select id="parent-category-select" name="parentCategoryId" value={editorParentCategoryId ?? ''} disabled={saving || parentChoicesLoading || Boolean(parentChoicesError) || editorCountryId === null} onChange={event => { const value = event.target.value; setEditorParentCategoryId(value ? Number(value) : null); }}><option value="">— Không có cha (tạo Level 1) —</option>{availableParents.map(parent => <option key={parent.id} value={parent.id}>{parent.name}{parent.isActive ? '' : ' · Inactive'}</option>)}</Select>{parentChoicesLoading ? <small role="status">Đang tải parent categories…</small> : <small>Chỉ chọn category Level 1 trong cùng Country. Để trống = category Level 1 gốc.</small>}</div>
        <label className="categories-active"><input name="isActive" type="checkbox" defaultChecked={editor?.initial.isActive ?? true} /> Active</label>
      </form>
    </Modal>
  </div>;
}
