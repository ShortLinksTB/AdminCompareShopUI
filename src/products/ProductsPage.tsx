import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from 'react';
import { deleteAdminProduct, getAdminCategories, getAdminProductMatchings, getAdminProducts, unlinkAdminProductMatching, updateAdminProduct, type AdminCategory, type AdminProduct, type AdminProductMatching, type AdminRequest, type ProductInput } from './products-api';
import './products.css';

type StatusFilter = 'all' | 'active' | 'inactive';
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
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [categoryError, setCategoryError] = useState('');
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const categoryPickerTrigger = useRef<HTMLButtonElement>(null);
  const categoryPickerOptions = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const loadVersion = useRef(0);
  const lightboxBox = useRef<HTMLDivElement>(null);
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
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

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
    if (!query) return items;
    return items.filter(product => `${product.name} ${product.brand ?? ''} ${product.slug}`.toLocaleLowerCase().includes(query));
  }, [items, search]);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
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

  const closeLightbox = useCallback(() => { setLightbox(null); setZoom(1); setPan({ x: 0, y: 0 }); setDrag(null); }, []);
  useEffect(() => {
    const box = lightboxBox.current;
    if (!lightbox || !box) return;

    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const bounds = box.getBoundingClientRect();
      const px = event.clientX - bounds.left - bounds.width / 2;
      const py = event.clientY - bounds.top - bounds.height / 2;
      const nextZoom = Math.min(4, Math.max(1, zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
      setPan(nextZoom === 1 ? { x: 0, y: 0 } : ({
        x: px - (px - pan.x) * nextZoom / zoom,
        y: py - (py - pan.y) * nextZoom / zoom,
      }));
      setZoom(nextZoom);
    };

    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [lightbox, zoom, pan]);
  useEffect(() => {
    if (!lightbox && !editor && !deleteTarget && openMenu === null && !statusOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (lightbox) closeLightbox();
      else if (categoryPickerOpen) {
        setCategoryPickerOpen(false);
        categoryPickerTrigger.current?.focus();
      }
      else if (editor) setEditor(null);
      else if (deleteTarget) setDeleteTarget(null);
      else { setOpenMenu(null); setStatusOpen(false); setCategoryPickerOpen(false); }
    };
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.product-row-menu')) setOpenMenu(null);
      if (!target.closest('.matching-menu-wrap')) setMatchingMenu(null);
      if (!target.closest('.product-status-filter')) setStatusOpen(false);
      if (!target.closest('.product-category-picker')) setCategoryPickerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('pointerdown', onPointerDown); };
  }, [lightbox, editor, deleteTarget, openMenu, statusOpen, categoryPickerOpen, closeLightbox]);

  function changeStatus(next: StatusFilter) { setStatus(next); setPage(1); setOpenMenu(null); setStatusOpen(false); }
  function changePageSize(size: number) { setPageSize(size); setPage(1); }
  function openEditor(product: AdminProduct) { setOpenMenu(null); setCategoryPickerOpen(false); setEditor({ product, input: initialInput(product) }); }
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
      setDeleteTarget(null);
      if (items.length === 1 && page > 1) setPage(value => value - 1);
      else setReloadKey(value => value + 1);
    } catch (reason) {
      setDeleteTarget(null);
      setError(reason instanceof Error ? reason.message : 'Could not delete this product. Please try again.');
    } finally { setDeletingId(null); }
  }

  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (zoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
  }

  return <div className="products-page">
    <div className="page-header"><div><span className="eyebrow">CATALOG</span><h1>Products</h1><p>Danh mục sản phẩm chuẩn và trạng thái hoạt động.</p></div></div>
    <div className="toolbar" role="search">
      <label className="toolbar-search"><span aria-hidden="true">⌕</span><input aria-label="Search products" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search product, brand, or slug..." /></label>
      <div className={`product-status-filter${statusOpen ? ' open' : ''}`}>
        <button className="product-status-button" type="button" aria-haspopup="listbox" aria-expanded={statusOpen} onClick={() => setStatusOpen(value => !value)}><span>{status === 'all' ? 'All status' : status === 'active' ? 'Active' : 'Inactive'}</span><span aria-hidden="true">▾</span></button>
        {statusOpen && <div className="product-status-options" role="listbox" aria-label="Filter by status">
          {(['all', 'active', 'inactive'] as StatusFilter[]).map(value => <button key={value} type="button" role="option" aria-selected={status === value} className={status === value ? 'selected' : ''} onClick={() => changeStatus(value)}><i className={`status-dot ${value}`} />{value === 'all' ? 'All status' : value === 'active' ? 'Active' : 'Inactive'}<span className="status-check">✓</span></button>)}
        </div>}
      </div>
    </div>

    {error && <div className="products-alert" role="alert">{error}<button type="button" onClick={() => setReloadKey(value => value + 1)}>Retry</button></div>}
    {categoryError && <div className="products-alert" role="status">Category names could not be loaded. Product records are still available.</div>}
    <section className="panel table-panel" aria-label="Products list">
      {loading ? <div className="products-state" role="status">Loading products…</div>
        : !error && visibleItems.length === 0 ? <div className="products-state" role="status"><strong>No products found</strong><span>{items.length === 0 ? 'Products will appear here when available.' : 'Try changing your search.'}</span></div>
          : !error && <div className="products-table-scroll"><table><thead><tr><th className="products-check-col"><input type="checkbox" aria-label="Select all products" checked={allVisibleSelected} onChange={event => visibleItems.forEach(product => toggleSelection(product.id, event.target.checked))} /></th><th>Image</th><th>Product</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead><tbody>
            {visibleItems.map(product => <tr key={product.id} className={selectedIds.has(product.id) ? 'product-row-selected' : undefined}>
              <td className="products-check-col"><input type="checkbox" aria-label={`Select ${product.name}`} checked={selectedIds.has(product.id)} onChange={event => toggleSelection(product.id, event.target.checked)} /></td>
              <td>{product.imageUrl ? <button className="product-thumbnail" type="button" aria-label={`View image of ${product.name}`} onClick={() => { setLightbox({ src: product.imageUrl!, alt: product.name }); setZoom(1); setPan({ x: 0, y: 0 }); }}><img src={product.imageUrl} alt="" /></button> : <span className="product-thumbnail no-image">No image</span>}</td>
              <td><strong className="product-name">{product.name}</strong><small className="product-slug">{product.slug}</small></td>
              <td>{categoryNames.get(product.categoryId) ?? '—'}</td>
              <td><span className={`product-status-pill ${product.isActive ? 'active' : 'inactive'}`}><i />{product.isActive ? 'Active' : 'Inactive'}</span></td>
              <td>{(canUpdate || canDelete) && <div className={`product-row-menu${openMenu === product.id ? ' open' : ''}`}>
                <button className="product-row-menu-button" type="button" aria-label={`Actions for ${product.name}`} aria-expanded={openMenu === product.id} onClick={() => setOpenMenu(openMenu === product.id ? null : product.id)}>⋮</button>
                {openMenu === product.id && <div className="product-row-menu-pop">{canUpdate && <button type="button" onClick={() => openEditor(product)}>Sửa</button>}{canDelete && <button className="danger" type="button" disabled={deletingId === product.id} onClick={() => { setOpenMenu(null); setDeleteTarget(product); }}>Xoá</button>}</div>}
              </div>}</td>
            </tr>)}
          </tbody></table></div>}
      {!loading && !error && <div className="products-footer">
        <div className="products-page-size"><label>Hiển thị <select aria-label="Rows per page" value={pageSize} onChange={event => changePageSize(Number(event.target.value))}>{PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select> dòng/trang</label><span className="products-total">Tổng <b>{totalItems}</b> sản phẩm</span></div>
        <span className="products-range">Showing {totalItems ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, totalItems)} of {totalItems} products</span>
        <div className="products-pager"><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>‹</button><span>Page {page} of {totalPages}</span><button type="button" aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>›</button></div>
      </div>}
    </section>

    {editor && <div className="product-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setEditor(null); }}><section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="edit-product-title"><form onSubmit={event => void save(event)}>
      <header><h2 id="edit-product-title">Sửa sản phẩm</h2><button type="button" aria-label="Đóng" disabled={saving} onClick={() => setEditor(null)}>✕</button></header>
      <div className="product-modal-body">
        <div className="product-image-field">{editor.input.imageUrl ? <button className="product-image-preview" type="button" aria-label="View product preview" onClick={() => { setLightbox({ src: editor.input.imageUrl!, alt: editor.input.name }); setZoom(1); setPan({ x: 0, y: 0 }); }}><img key={editor.input.imageUrl} src={editor.input.imageUrl} alt="Product preview" /></button> : <div className="product-image-preview"><span>No image</span></div>}<label>Image URL<input type="url" value={editor.input.imageUrl ?? ''} onChange={event => updateInput('imageUrl', event.target.value || null)} placeholder="https://..." /></label></div>
        <label>Tên sản phẩm<input required value={editor.input.name} onChange={event => updateInput('name', event.target.value)} /></label>
        <div className="product-form-row"><label>Slug<input required value={editor.input.slug} onChange={event => updateInput('slug', event.target.value)} /></label><div className="product-category-field"><span>Category</span><div className={`product-category-picker${categoryPickerOpen ? ' open' : ''}`} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCategoryPickerOpen(false); }}><button ref={categoryPickerTrigger} type="button" className="product-category-button" aria-haspopup="listbox" aria-expanded={categoryPickerOpen} aria-controls="product-category-options" onClick={() => categoryPickerOpen ? setCategoryPickerOpen(false) : openCategoryPicker()} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openCategoryPicker(event.key === 'ArrowUp'); } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!categoryPickerOpen) openCategoryPicker(); } }}>{categoryNames.get(editor.input.categoryId) ?? 'Select category'}<span aria-hidden="true">▾</span></button>{categoryPickerOpen && <div ref={categoryPickerOptions} id="product-category-options" className="product-category-options" role="listbox" aria-label="Choose a Level 2 category">{categoryGroups.length === 0 ? <div className="product-category-empty" role="status">{categoryError ? 'Categories could not be loaded.' : 'No Level 2 categories available.'}</div> : categoryGroups.map(group => <div key={group.parentId}><div className="product-category-group" aria-hidden="true">{group.name}</div>{group.items.map(category => <button key={category.id} type="button" role="option" data-category-id={category.id} tabIndex={activeCategoryId === category.id ? 0 : -1} aria-selected={editor.input.categoryId === category.id} className={`${editor.input.categoryId === category.id ? 'selected ' : ''}${activeCategoryId === category.id ? 'focused' : ''}`} onFocus={() => setActiveCategoryId(category.id)} onKeyDown={event => handleCategoryOptionKeyDown(event, category.id)} onClick={() => selectCategory(category.id)}>{category.name}<span aria-hidden="true">✓</span></button>)}</div>)}</div>}</div></div></div>
        <label>Brand<input value={editor.input.brand ?? ''} onChange={event => updateInput('brand', event.target.value || null)} placeholder="Không bắt buộc" /></label>
        <label>Mô tả<textarea value={editor.input.description ?? ''} onChange={event => updateInput('description', event.target.value || null)} placeholder="Không bắt buộc" /></label>
        <label className="product-active-toggle"><span>Trạng thái hoạt động</span><input type="checkbox" checked={editor.input.isActive} onChange={event => updateInput('isActive', event.target.checked)} /><i /></label>
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
      <footer><button type="button" disabled={saving} onClick={() => setEditor(null)}>Huỷ</button><button className="primary" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button></footer>
    </form></section></div>}

    {deleteTarget && <div className="product-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setDeleteTarget(null); }}><section className="product-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-product-title"><h2 id="delete-product-title">Xoá sản phẩm?</h2><p>Bạn có chắc muốn xoá “{deleteTarget.name}” không? Thao tác này không thể hoàn tác.</p><footer><button type="button" onClick={() => setDeleteTarget(null)}>Huỷ</button><button className="danger" type="button" disabled={deletingId === deleteTarget.id} onClick={() => void remove()}>{deletingId === deleteTarget.id ? 'Đang xoá…' : 'Xoá sản phẩm'}</button></footer></section></div>}

    {lightbox && <div className="product-lightbox" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeLightbox(); }}><div ref={lightboxBox} className={`product-lightbox-box${zoom > 1 ? ' zoomed' : ''}`} onPointerDown={startPan} onPointerMove={event => { if (drag?.pointerId === event.pointerId) setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y }); }} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
      <button className="product-lightbox-close" type="button" aria-label="Đóng ảnh" onClick={closeLightbox}>✕</button><img src={lightbox.src} alt={lightbox.alt} draggable="false" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} /><span className="product-lightbox-hint">Scroll để zoom · kéo để di chuyển</span><span className="product-lightbox-zoom">{Math.round(zoom * 100)}%</span>
    </div></div>}
  </div>;
}
