import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { deleteAdminProduct, getAdminCategories, getAdminProductMatchings, getAdminProducts, unlinkAdminProductMatching, updateAdminProduct, type AdminCategory, type AdminProduct, type AdminProductMatching, type AdminRequest, type ProductInput } from './products-api';
import { Button, Card, Checkbox, DataTable, EmptyState, ErrorState, Field, FilterChips, Lightbox, Loading, Modal, PageHeader, Pager, Pill, RowMenu, SearchField, Switch, TableFooter, Toolbar } from '../ui';
import './products.css';

type StatusFilter = 'all' | 'active' | 'inactive' | 'missing-image';
type Editor = { product: AdminProduct; input: ProductInput } | null;
const PAGE_SIZES = [10, 20, 50];
const initialInput = (product: AdminProduct): ProductInput => ({
  name: product.name, slug: product.slug, categoryId: product.categoryId,
  brand: product.brand, description: product.description, seoTitle: product.seoTitle,
  seoDescription: product.seoDescription, isActive: product.isActive,
  imageUrl: product.imageUrl ?? null,
});
const formatAttachedDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN').format(date);
};

export function ProductsPage({ requestAdmin, permissions = [] }: { requestAdmin: AdminRequest; permissions?: string[] }) {
  const [items, setItems] = useState<AdminProduct[]>([]);
  const [catalogItems, setCatalogItems] = useState<AdminProduct[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [categoryError, setCategoryError] = useState('');
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const categoryPickerTrigger = useRef<HTMLButtonElement>(null);
  const categoryPickerOptions = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [filterCounts, setFilterCounts] = useState({ all: 0, active: 0, inactive: 0, missingImage: 0 });
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [matchings, setMatchings] = useState<AdminProductMatching[]>([]);
  const [matchingsLoading, setMatchingsLoading] = useState(false);
  const [matchingsError, setMatchingsError] = useState('');
  const [matchingActionError, setMatchingActionError] = useState('');
  const [matchingMenu, setMatchingMenu] = useState<number | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminProduct | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const loadVersion = useRef(0);
  const editorReturnFocus = useRef<HTMLElement | null>(null);
  const canUpdate = permissions.includes('products.update');
  const canDelete = permissions.includes('products.delete');

  const loadMatchings = useCallback(async (productId: number, signal?: AbortSignal) => {
    setMatchingsLoading(true);
    setMatchingsError('');
    try {
      const result = await getAdminProductMatchings(requestAdmin, productId, signal);
      if (!signal?.aborted) setMatchings(result);
    } catch (reason) {
      if (!signal?.aborted) {
        setMatchings([]);
        setMatchingsError(reason instanceof Error ? reason.message : 'Could not load product matchings.');
      }
    } finally {
      if (!signal?.aborted) setMatchingsLoading(false);
    }
  }, [requestAdmin]);

  useEffect(() => {
    if (!editor) { setMatchings([]); setMatchingsError(''); setMatchingActionError(''); setMatchingsLoading(false); setMatchingMenu(null); return; }
    const controller = new AbortController();
    void loadMatchings(editor.product.id, controller.signal);
    return () => controller.abort();
  }, [editor?.product.id, loadMatchings]);

  useEffect(() => {
    if (editor || !editorReturnFocus.current) return;
    editorReturnFocus.current.focus();
    editorReturnFocus.current = null;
  }, [editor]);

  const load = useCallback(async (signal: AbortSignal) => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError('');
    try {
      const result = await getAdminProducts(requestAdmin, page, pageSize, signal, status === 'all' ? null : status === 'active');
      if (signal.aborted || version !== loadVersion.current) return;
      setItems(result.items);
      setTotalItems(result.totalItems);
      setPage(result.pageNumber);
      setPageSize(result.pageSize);
    } catch (reason) {
      if (signal.aborted || version !== loadVersion.current) return;
      setItems([]);
      setTotalItems(0);
      setError(reason instanceof Error ? reason.message : 'Could not load products. Please try again.');
    } finally {
      if (!signal.aborted && version === loadVersion.current) setLoading(false);
    }
  }, [requestAdmin, page, pageSize, status, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const firstPage = await getAdminProducts(requestAdmin, 1, 10, controller.signal);
        const allProducts = [...firstPage.items];
        const pages = Math.ceil(firstPage.totalItems / firstPage.pageSize);
        for (let nextPage = 2; nextPage <= pages; nextPage += 1) {
          const result = await getAdminProducts(requestAdmin, nextPage, firstPage.pageSize, controller.signal);
          allProducts.push(...result.items);
        }
        if (!controller.signal.aborted) {
          setCatalogItems(allProducts);
          setFilterCounts({ all: firstPage.totalItems, active: allProducts.filter(product => product.isActive).length, inactive: allProducts.filter(product => !product.isActive).length, missingImage: allProducts.filter(product => !product.imageUrl).length });
          setCatalogLoaded(true);
          if (status === 'missing-image') setLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) { setCatalogLoaded(true); if (status === 'missing-image') setLoading(false); }
      }
    })();
    return () => controller.abort();
  }, [requestAdmin]);

  useEffect(() => {
    if (status === 'missing-image') { setLoading(!catalogLoaded); setError(''); return; }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, status]);

  useEffect(() => {
    const controller = new AbortController();
    void getAdminCategories(requestAdmin, controller.signal).then(result => {
      setCategories(result);
      setCategoryError('');
    }).catch(reason => {
      if (!controller.signal.aborted) setCategoryError(reason instanceof Error ? reason.message : 'Could not load categories.');
    });
    return () => controller.abort();
  }, [requestAdmin]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const source = status === 'missing-image' ? catalogItems.filter(product => !product.imageUrl) : items;
    const filtered = query ? source.filter(product => `${product.name} ${product.brand ?? ''} ${product.slug}`.toLocaleLowerCase().includes(query)) : source;
    return status === 'missing-image' ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered;
  }, [items, catalogItems, search, status, page, pageSize]);
  const displayedTotal = status === 'missing-image' ? filterCounts.missingImage : totalItems;
  const categoryNames = useMemo(() => new Map(categories.map(category => [category.id, category.name])), [categories]);
  const leafCategories = useMemo(() => categories.filter(category => category.parentCategoryId != null), [categories]);
  const categoryGroups = useMemo(() => {
    const parents = new Map(categories.filter(category => category.parentCategoryId == null).map(category => [category.id, category.name]));
    return [...new Set(leafCategories.map(category => category.parentCategoryId!))].map(parentId => ({ parentId, name: parents.get(parentId) ?? 'Categories', items: leafCategories.filter(category => category.parentCategoryId === parentId) }));
  }, [categories, leafCategories]);
  const orderedLeafCategories = useMemo(() => categoryGroups.flatMap(group => group.items), [categoryGroups]);
  useEffect(() => {
    if (!categoryPickerOpen) return;
    const activeId = orderedLeafCategories.some(category => category.id === activeCategoryId)
      ? activeCategoryId
      : orderedLeafCategories.find(category => category.id === editor?.input.categoryId)?.id ?? orderedLeafCategories[0]?.id;
    if (activeId == null) return;
    setActiveCategoryId(activeId);
    categoryPickerOptions.current?.querySelector<HTMLButtonElement>(`[data-category-id="${activeId}"]`)?.focus();
  }, [categoryPickerOpen, activeCategoryId, editor?.input.categoryId, orderedLeafCategories]);
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every(product => selectedIds.has(product.id));
  function toggleSelection(id: number, checked: boolean) {
    setSelectedIds(current => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; });
  }

  const closeLightbox = useCallback(() => setLightbox(null), []);
  useEffect(() => {
    if (!lightbox && !editor && !deleteTarget && openMenu === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (lightbox) closeLightbox();
      else if (categoryPickerOpen) {
        event.stopPropagation();
        setCategoryPickerOpen(false);
        categoryPickerTrigger.current?.focus();
      }
      else if (editor) setEditor(null);
      else if (deleteTarget) setDeleteTarget(null);
      else { setOpenMenu(null); setCategoryPickerOpen(false); }
    };
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement;
      // RowMenu uses the shared `.studio-row-menu` class. Closing on pointerdown
      // before the action's click fires unmounts that action and prevents its
      // handler (including opening the edit modal) from running.
      if (!target.closest('.studio-row-menu')) setOpenMenu(null);
      if (!target.closest('.matching-menu-wrap')) setMatchingMenu(null);
      if (!target.closest('.product-category-picker')) setCategoryPickerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('pointerdown', onPointerDown); };
  }, [lightbox, editor, deleteTarget, openMenu, categoryPickerOpen, closeLightbox]);

  function changeStatus(next: StatusFilter) { setStatus(next); setPage(1); setOpenMenu(null); }
  function changePageSize(size: number) { setPageSize(size); setPage(1); }
  function updateCatalog(products: AdminProduct[]) {
    setCatalogItems(products);
    setFilterCounts({ all: products.length, active: products.filter(product => product.isActive).length, inactive: products.filter(product => !product.isActive).length, missingImage: products.filter(product => !product.imageUrl).length });
  }
  function openEditor(product: AdminProduct) { editorReturnFocus.current = document.activeElement?.closest('details')?.querySelector<HTMLElement>('summary') ?? null; setOpenMenu(null); setCategoryPickerOpen(false); setEditor({ product, input: initialInput(product) }); }
  function updateInput<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setEditor(current => current ? { ...current, input: { ...current.input, [key]: value } } : current);
  }
  function openCategoryPicker(startAtEnd = false) {
    const selectedId = orderedLeafCategories.find(category => category.id === editor?.input.categoryId)?.id;
    setActiveCategoryId(selectedId ?? (startAtEnd ? orderedLeafCategories.at(-1)?.id : orderedLeafCategories[0]?.id) ?? null);
    setCategoryPickerOpen(true);
  }
  function selectCategory(categoryId: number) {
    updateInput('categoryId', categoryId);
    setActiveCategoryId(categoryId);
    setCategoryPickerOpen(false);
    categoryPickerTrigger.current?.focus();
  }
  function moveCategoryFocus(currentId: number, key: string) {
    if (orderedLeafCategories.length === 0) return;
    const currentIndex = orderedLeafCategories.findIndex(category => category.id === currentId);
    const nextIndex = key === 'Home'
      ? 0
      : key === 'End'
        ? orderedLeafCategories.length - 1
        : (currentIndex + (key === 'ArrowDown' ? 1 : -1) + orderedLeafCategories.length) % orderedLeafCategories.length;
    const nextId = orderedLeafCategories[nextIndex].id;
    setActiveCategoryId(nextId);
    categoryPickerOptions.current?.querySelector<HTMLButtonElement>(`[data-category-id="${nextId}"]`)?.focus();
  }
  function handleCategoryOptionKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, categoryId: number) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      moveCategoryFocus(categoryId, event.key);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectCategory(categoryId);
    }
  }

  async function unlinkMatching(matchingId: number) {
    setUnlinkingId(matchingId);
    setMatchingActionError('');
    try {
      await unlinkAdminProductMatching(requestAdmin, matchingId);
      setMatchings(current => current.filter(matching => matching.id !== matchingId));
      setMatchingMenu(null);
    } catch (reason) {
      setMatchingActionError(reason instanceof Error ? reason.message : 'Could not remove matching. Please try again.');
    } finally { setUnlinkingId(null); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || !canUpdate) return;
    setSaving(true); setError('');
    try {
      await updateAdminProduct(requestAdmin, editor.product.id, { ...editor.input, imageUrl: editor.input.imageUrl ?? editor.product.imageUrl ?? null });
      const savedProduct = { ...editor.product, ...editor.input, imageUrl: editor.input.imageUrl ?? editor.product.imageUrl ?? null };
      updateCatalog(catalogItems.map(product => product.id === savedProduct.id ? savedProduct : product));
      setEditor(null); setReloadKey(value => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this product. Please try again.');
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!deleteTarget || !canDelete) return;
    const target = deleteTarget;
    setDeletingId(target.id); setError('');
    try {
      await deleteAdminProduct(requestAdmin, target.id);
      updateCatalog(catalogItems.filter(product => product.id !== target.id));
      setDeleteTarget(null);
      if (items.length === 1 && page > 1) setPage(value => value - 1);
      else setReloadKey(value => value + 1);
    } catch (reason) {
      setDeleteTarget(null);
      setError(reason instanceof Error ? reason.message : 'Could not delete this product. Please try again.');
    } finally { setDeletingId(null); }
  }

  return <div className="products-page">
    <PageHeader eyebrow="CATALOG" title="Products" description="Danh mục sản phẩm chuẩn và trạng thái hoạt động." />
    <FilterChips items={[{ value: 'all', label: 'All', count: filterCounts.all }, { value: 'active', label: 'Visible', count: filterCounts.active }, { value: 'inactive', label: 'Hidden', count: filterCounts.inactive }, { value: 'missing-image', label: 'Needs standard image', count: filterCounts.missingImage }]} value={status} onChange={value => changeStatus(value as StatusFilter)} />
    {categoryError && <p className="products-category-note" role="status">Category names could not be loaded. Product records are still available.</p>}
    <Card className="products-card" aria-label="Products list">
      <Toolbar role="search"><SearchField label="Search products" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search product, brand, or slug..." /></Toolbar>
      {loading ? <Loading label="Loading products" />
        : error ? <ErrorState title="Could not load products">{error} <Button size="sm" onClick={() => setReloadKey(value => value + 1)}>Retry</Button></ErrorState>
          : visibleItems.length === 0 ? <EmptyState title="No products found">{items.length === 0 ? 'Products will appear here when available.' : 'Try changing your search.'}</EmptyState>
          : <DataTable className="products-table-scroll"><thead><tr><th className="products-check-col"><Checkbox aria-label="Select all products" checked={allVisibleSelected} indeterminate={selectedIds.size > 0 && !allVisibleSelected} onChange={checked => visibleItems.forEach(product => toggleSelection(product.id, checked))} /></th><th>Image</th><th>Product</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead><tbody>
            {visibleItems.map(product => <tr key={product.id} className={selectedIds.has(product.id) ? 'product-row-selected' : undefined}>
              <td className="products-check-col"><Checkbox aria-label={`Select ${product.name}`} checked={selectedIds.has(product.id)} onChange={checked => toggleSelection(product.id, checked)} /></td>
              <td>{product.imageUrl ? <button className="product-thumbnail" type="button" aria-label={`View image of ${product.name}`} onClick={() => setLightbox({ src: product.imageUrl!, alt: product.name })}><img src={product.imageUrl} alt="" /></button> : <span className="product-thumbnail no-image">No image</span>}</td>
              <td><strong className="product-name">{product.name}</strong><small className="product-slug">{product.slug}</small></td>
              <td>{categoryNames.get(product.categoryId) ?? '—'}</td>
              <td><Pill tone={product.isActive ? 'ok' : 'bad'}>{product.isActive ? 'Active' : 'Inactive'}</Pill></td>
              <td>{(canUpdate || canDelete) && <RowMenu open={openMenu === product.id} onOpenChange={open => setOpenMenu(open ? product.id : null)} label={`Actions for ${product.name}`}>
                {canUpdate && <button type="button" onClick={() => openEditor(product)}>Sửa</button>}{canDelete && <button type="button" disabled={deletingId === product.id} onClick={() => { setOpenMenu(null); setDeleteTarget(product); }}>Xoá</button>}
              </RowMenu>}</td>
            </tr>)}
          </tbody></DataTable>}
      {!loading && !error && <TableFooter start={displayedTotal ? (page - 1) * pageSize + 1 : 0} end={Math.min(page * pageSize, displayedTotal)} total={displayedTotal} center={<label className="products-page-size">Rows <select aria-label="Rows per page" value={pageSize} onChange={event => changePageSize(Number(event.target.value))}>{PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select> / page</label>}><Pager page={page} pages={Math.max(1, Math.ceil(displayedTotal / pageSize))} onChange={setPage} /></TableFooter>}
    </Card>

    {editor && <Modal open title="Sửa sản phẩm" onClose={() => { if (!saving) setEditor(null); }} actions={<><Button disabled={saving} onClick={() => setEditor(null)}>Huỷ</Button><Button tone="primary" type="submit" form="product-edit-form" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</Button></>}>
      <form id="product-edit-form" onSubmit={event => void save(event)}>
      <div className="product-modal-body">
        <div className="product-image-field">{editor.input.imageUrl ? <button className="product-image-preview" type="button" aria-label="View product preview" onClick={() => setLightbox({ src: editor.input.imageUrl!, alt: editor.input.name })}><img key={editor.input.imageUrl} src={editor.input.imageUrl} alt="Product preview" /></button> : <div className="product-image-preview"><span>No image</span></div>}<Field label="Image URL" type="url" value={editor.input.imageUrl ?? ''} onChange={event => updateInput('imageUrl', event.target.value || null)} placeholder="https://..." /></div>
        <Field label="Tên sản phẩm" required value={editor.input.name} onChange={event => updateInput('name', event.target.value)} />
        <div className="product-form-row"><Field label="Slug" required value={editor.input.slug} onChange={event => updateInput('slug', event.target.value)} /><div className="product-category-field"><span id="product-category-label">Category</span><div className={`product-category-picker${categoryPickerOpen ? ' open' : ''}`} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCategoryPickerOpen(false); }}><button ref={categoryPickerTrigger} type="button" className="product-category-button" aria-labelledby="product-category-label product-category-value" aria-haspopup="listbox" aria-expanded={categoryPickerOpen} aria-controls="product-category-options" onClick={() => categoryPickerOpen ? setCategoryPickerOpen(false) : openCategoryPicker()} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openCategoryPicker(event.key === 'ArrowUp'); } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!categoryPickerOpen) openCategoryPicker(); } }}><span id="product-category-value">{categoryNames.get(editor.input.categoryId) ?? 'Select category'}</span><span aria-hidden="true">▾</span></button>{categoryPickerOpen && <div ref={categoryPickerOptions} id="product-category-options" className="product-category-options" role="listbox" aria-label="Choose a Level 2 category">{categoryGroups.length === 0 ? <div className="product-category-empty" role="status">{categoryError ? 'Categories could not be loaded.' : 'No Level 2 categories available.'}</div> : categoryGroups.map(group => <div key={group.parentId} role="group" aria-label={group.name}><div className="product-category-group" aria-hidden="true">{group.name}</div>{group.items.map(category => <button key={category.id} type="button" role="option" data-category-id={category.id} tabIndex={activeCategoryId === category.id ? 0 : -1} aria-selected={editor.input.categoryId === category.id} className={`${editor.input.categoryId === category.id ? 'selected ' : ''}${activeCategoryId === category.id ? 'focused' : ''}`} onFocus={() => setActiveCategoryId(category.id)} onKeyDown={event => handleCategoryOptionKeyDown(event, category.id)} onClick={() => selectCategory(category.id)}>{category.name}<span aria-hidden="true">✓</span></button>)}</div>)}</div>}</div></div></div>
        <Field label="Brand" value={editor.input.brand ?? ''} onChange={event => updateInput('brand', event.target.value || null)} placeholder="Không bắt buộc" />
        <label className="product-textarea-field">Mô tả<textarea value={editor.input.description ?? ''} onChange={event => updateInput('description', event.target.value || null)} placeholder="Không bắt buộc" /></label>
        <label className="product-active-toggle"><span>Trạng thái hoạt động</span><Switch label="Trạng thái hoạt động" checked={editor.input.isActive} onChange={checked => updateInput('isActive', checked)} /></label>
        <section className="matching-section" aria-labelledby="product-matching-title">
          <div className="matching-head"><h3 id="product-matching-title">Product matching</h3>{!matchingsLoading && !matchingsError && <span>{matchings.length} bản ghi</span>}</div>
          {matchingsLoading ? <div className="matching-state" role="status">Đang tải product matching…</div>
            : matchingsError ? <div className="matching-error" role="alert">{matchingsError}<button type="button" onClick={() => void loadMatchings(editor.product.id)}>Thử lại</button></div>
              : <>{matchingActionError && <div className="matching-error" role="alert">{matchingActionError}</div>}{matchings.length === 0 ? <div className="matching-state">Chưa có product matching nào được gắn.</div>
                : <div className="matching-list">{matchings.map(matching => <div className="matching-row" key={matching.id}>
                  <span className="matching-badge">{matching.dataSourceDisplayName || matching.dataSourceId || '—'}</span>
                  <div className="matching-main"><strong>{matching.name}</strong><small>SKU nguồn {matching.externalSku || '—'} · gắn {formatAttachedDate(matching.createdAtUtc)}</small></div>
                  <div className={`matching-menu-wrap${matchingMenu === matching.id ? ' open' : ''}`}>
                    <button className="matching-menu" type="button" aria-label={`Thao tác matching ${matching.name}`} aria-expanded={matchingMenu === matching.id} disabled={unlinkingId === matching.id} onClick={() => setMatchingMenu(matchingMenu === matching.id ? null : matching.id)}>⋮</button>
                    {matchingMenu === matching.id && <div className="matching-menu-pop"><button type="button" disabled={unlinkingId === matching.id} onClick={() => void unlinkMatching(matching.id)}>{unlinkingId === matching.id ? 'Đang xoá…' : 'Xoá'}</button></div>}
                  </div>
                </div>)}</div>}</>}
        </section>
      </div>
      </form>
    </Modal>}

    {deleteTarget && <Modal open title="Xoá sản phẩm?" onClose={() => setDeleteTarget(null)} actions={<><Button onClick={() => setDeleteTarget(null)}>Huỷ</Button><Button tone="danger" disabled={deletingId === deleteTarget.id} onClick={() => void remove()}>{deletingId === deleteTarget.id ? 'Đang xoá…' : 'Xoá sản phẩm'}</Button></>}><p>Bạn có chắc muốn xoá “{deleteTarget.name}” không? Thao tác này không thể hoàn tác.</p></Modal>}

    {lightbox && <Lightbox open onClose={closeLightbox}><img src={lightbox.src} alt={lightbox.alt} draggable="false" /></Lightbox>}
  </div>;
}
