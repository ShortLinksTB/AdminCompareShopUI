import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminRequest, Page } from '../bannedItemsApi';
import { createCategory, deleteCategory, getCategories, updateCategory, type AdminCategory, type CategoryInput } from './categories-api';
import './categories.css';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const emptyPage: Page<AdminCategory> = { items: [], pageNumber: 1, pageSize: 20, totalItems: 0 };
const emptyInput: CategoryInput = { slug: '', name: '', isActive: true, parentCategoryId: null };

type EditorState = { category: AdminCategory | null; initial: CategoryInput } | null;

export function CategoriesPage({ requestAdmin, permissions }: { requestAdmin: AdminRequest; permissions: string[] }) {
  const [result, setResult] = useState(emptyPage);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const load = useCallback(async (requestedPage = page, requestedSize = pageSize) => {
    setLoading(true);
    setListError(null);
    try {
      const data = await getCategories(requestAdmin, requestedPage, requestedSize);
      setResult(data);
      setPage(data.pageNumber);
      setPageSize(data.pageSize);
    } catch (reason) {
      setListError(reason instanceof Error ? reason.message : 'Không thể tải categories. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [requestAdmin, page, pageSize]);

  useEffect(() => { void load(1, 20); }, [requestAdmin]);
  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.category-row-menu')) setOpenMenu(null);
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, []);

  const canCreate = permissions.includes('categories.create');
  const canUpdate = permissions.includes('categories.update');
  const canDelete = permissions.includes('categories.delete');
  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));
  const openCreate = () => {
    setFormError(null);
    setEditor({ category: null, initial: emptyInput });
  };
  const openEdit = (category: AdminCategory) => {
    setFormError(null);
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
      parentCategoryId: form.get('parentCategoryId') ? Number(form.get('parentCategoryId')) : null,
    };
    if (!input.slug || !input.name || input.slug.length > 160 || input.name.length > 200) {
      setFormError('Nhập slug và name hợp lệ (slug tối đa 160 ký tự, name tối đa 200 ký tự).');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editor.category) await updateCategory(requestAdmin, editor.category.id, input);
      else await createCategory(requestAdmin, input);
      setEditor(null);
      await load(page, pageSize);
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
      await load(nextPage, pageSize);
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Không thể xoá category. Vui lòng thử lại.');
    } finally {
      setDeletingId(null);
    }
  }

  const activeParents = result.items.filter(category => category.parentCategoryId == null && category.isActive);
  const categoryById = new Map(result.items.map(category => [category.id, category]));
  const matchingCategories = result.items.filter(category => `${category.name} ${category.slug}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const matchingIds = new Set(matchingCategories.map(category => category.id));
  const visibleCategories = result.items.filter(category => {
    const parentId = category.parentCategoryId;
    if (parentId == null) return matchingIds.has(category.id) || result.items.some(child => child.parentCategoryId === category.id && matchingIds.has(child.id));
    return (matchingIds.has(category.id) || matchingIds.has(parentId)) && !collapsed.has(parentId);
  });
  const roots = visibleCategories.filter(category => category.parentCategoryId == null);
  const groupedCategories = [...roots.flatMap(parent => [parent, ...visibleCategories.filter(category => category.parentCategoryId === parent.id)]), ...visibleCategories.filter(category => category.parentCategoryId != null && !categoryById.has(category.parentCategoryId))];
  const filteredTotal = matchingCategories.length;

  return <div className="categories-page">
    <header className="categories-header">
      <div><span className="eyebrow">SYSTEM</span><h1>Categories</h1></div>
      {canCreate && <button className="categories-button categories-button-primary" onClick={openCreate}>+ Thêm category</button>}
    </header>

    <label className="categories-toolbar-search"><span aria-hidden="true">⌕</span><input aria-label="Search categories" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm theo tên hoặc slug..." /></label>

    {listError && <div className="categories-alert" role="alert"><span>{listError}</span><button className="categories-button" onClick={() => void load()}>Thử lại</button></div>}
    {deleteError && <div className="categories-alert" role="alert">{deleteError}</div>}
    <section className="categories-card" aria-label="Categories">
      {loading ? <div className="categories-state" role="status" aria-label="Đang tải categories">Đang tải categories…</div>
        : !listError && result.items.length === 0 ? <div className="categories-state">Chưa có category nào.</div>
          : !listError && <div className="categories-table-wrap"><table>
            <thead><tr><th scope="col">Id</th><th scope="col">Name</th><th scope="col">Slug</th><th scope="col">Level</th><th scope="col">Parent</th><th scope="col" aria-label="Thao tác" /></tr></thead>
            <tbody>{groupedCategories.map(category => {
              const parent = category.parentCategoryId == null;
              const children = result.items.some(item => item.parentCategoryId === category.id);
              return <tr key={category.id} className={`${parent ? 'category-parent-row' : 'category-child-row'}${!parent && !categoryById.has(category.parentCategoryId!) ? ' orphan' : ''}`}>
              <td>{category.id}</td><td>{parent && children && <button className={`category-tree-toggle${collapsed.has(category.id) ? ' collapsed' : ''}`} type="button" aria-label={`${collapsed.has(category.id) ? 'Mở rộng' : 'Thu gọn'} ${category.name}`} aria-expanded={!collapsed.has(category.id)} onClick={() => setCollapsed(current => { const next = new Set(current); if (next.has(category.id)) next.delete(category.id); else next.add(category.id); return next; })}>⌄</button>}{!parent && <span className="category-tree-indent" aria-hidden="true" />}{category.name}</td><td><code>{category.slug}</code></td>
              <td><span className="category-level-pill">Level {parent ? 1 : 2}</span></td><td className="category-parent-cell">{parent ? '—' : categoryById.get(category.parentCategoryId!)?.name ?? '—'}</td>
              <td>{(canUpdate || canDelete) && <div className={`category-row-menu${openMenu === category.id ? ' open' : ''}`}>
                <button className="category-row-menu-button" type="button" aria-label={`Actions for ${category.name}`} aria-expanded={openMenu === category.id} onClick={() => setOpenMenu(openMenu === category.id ? null : category.id)}>⋮</button>
                {openMenu === category.id && <div className="category-row-menu-pop">
                  {canUpdate && <button type="button" disabled={saving || deletingId !== null} onClick={() => { setOpenMenu(null); openEdit(category); }}>Sửa</button>}
                  {canDelete && <button className="danger" type="button" disabled={deletingId !== null || saving} onClick={() => { setOpenMenu(null); void remove(category); }}>{deletingId === category.id ? 'Đang xoá…' : 'Xoá'}</button>}
                </div>}
              </div>}</td>
            </tr>})}</tbody>
          </table></div>}
      <footer className="categories-footer">
        <div className="categories-page-size"><label>Hiển thị <select aria-label="Số dòng mỗi trang" value={pageSize} disabled={loading} onChange={event => { const size = Number(event.target.value); setPage(1); setPageSize(size); void load(1, size); }}>{PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}</select> dòng/trang</label><span className="categories-total">Tổng <b>{search.trim() ? filteredTotal : result.totalItems}</b> category</span></div>
        <span className="categories-range">Showing {search.trim() ? (filteredTotal ? 1 : 0) : result.totalItems ? (page - 1) * pageSize + 1 : 0}–{search.trim() ? filteredTotal : Math.min(page * pageSize, result.totalItems)} of {search.trim() ? filteredTotal : result.totalItems} categories</span>
        <div className="categories-pagination"><button aria-label="Trang trước" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>‹</button><span>Page {page} of {totalPages}</span><button aria-label="Trang sau" disabled={page >= totalPages || loading} onClick={() => void load(page + 1)}>›</button></div>
      </footer>
    </section>
    {editor && <div className="categories-backdrop"><section className="categories-dialog" role="dialog" aria-modal="true" aria-labelledby="categories-form-title"><form onSubmit={event => void submit(event)}>
      <div className="categories-dialog-heading"><div><h2 id="categories-form-title">{editor.category ? 'Sửa category' : 'Thêm category'}</h2><p>Nhập thông tin taxonomy sản phẩm.</p></div><button type="button" className="categories-close" aria-label="Đóng" disabled={saving} onClick={() => setEditor(null)}>×</button></div>
      {formError && <div className="categories-alert" role="alert">{formError}</div>}
      <label>Slug<input name="slug" required maxLength={160} defaultValue={editor.initial.slug} /></label>
      <label>Name<input name="name" required maxLength={200} defaultValue={editor.initial.name} /></label>
      <label>Parent category<select name="parentCategoryId" defaultValue={editor.initial.parentCategoryId ?? ''}><option value="">— Không có cha (tạo Level 1) —</option>{activeParents.filter(parent => parent.id !== editor.category?.id).map(parent => <option key={parent.id} value={parent.id}>{parent.name}</option>)}</select><span className="categories-field-hint">Chọn category Level 1 làm cha để tạo Level 2. Để trống sẽ tạo category gốc.</span></label>
      <label className="categories-active"><input name="isActive" type="checkbox" defaultChecked={editor.initial.isActive} /> Active</label>
      <div className="categories-dialog-actions"><button type="button" className="categories-button" disabled={saving} onClick={() => setEditor(null)}>Huỷ</button><button type="submit" className="categories-button categories-button-primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu category'}</button></div>
    </form></section></div>}
  </div>;
}
