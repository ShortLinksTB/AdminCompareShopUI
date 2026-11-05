import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminRequest, Page } from '../bannedItemsApi';
import { createCategory, deleteCategory, getCategories, updateCategory, type AdminCategory, type CategoryInput } from './categories-api';
import './categories.css';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const emptyPage: Page<AdminCategory> = { items: [], pageNumber: 1, pageSize: 20, totalItems: 0 };
const emptyInput: CategoryInput = { slug: '', name: '', isActive: true };

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
    setEditor({ category, initial: { slug: category.slug, name: category.name, isActive: category.isActive } });
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget);
    const input: CategoryInput = {
      slug: String(form.get('slug') ?? '').trim(),
      name: String(form.get('name') ?? '').trim(),
      isActive: form.get('isActive') === 'on',
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

  const visibleCategories = result.items.filter(category => `${category.name} ${category.slug}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return <div className="categories-page">
    <header className="categories-header">
      <div><span className="eyebrow">SYSTEM</span><h1>Categories</h1><p>Taxonomy sản phẩm — CRUD qua /admin/categories, theo đúng pattern Partner Shops.</p></div>
      {canCreate && <button className="categories-button categories-button-primary" onClick={openCreate}>+ Thêm category</button>}
    </header>

    <label className="categories-toolbar-search"><span aria-hidden="true">⌕</span><input aria-label="Search categories" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm theo tên hoặc slug..." /></label>

    {listError && <div className="categories-alert" role="alert"><span>{listError}</span><button className="categories-button" onClick={() => void load()}>Thử lại</button></div>}
    {deleteError && <div className="categories-alert" role="alert">{deleteError}</div>}
    <section className="categories-card" aria-label="Categories">
      {loading ? <div className="categories-state" role="status" aria-label="Đang tải categories">Đang tải categories…</div>
        : !listError && result.items.length === 0 ? <div className="categories-state">Chưa có category nào.</div>
          : !listError && <div className="categories-table-wrap"><table>
            <thead><tr><th scope="col">Id</th><th scope="col">Name</th><th scope="col">Slug</th><th scope="col" aria-label="Thao tác" /></tr></thead>
            <tbody>{visibleCategories.map(category => <tr key={category.id}>
              <td>{category.id}</td><td>{category.name}</td><td><code>{category.slug}</code></td>
              <td>{(canUpdate || canDelete) && <div className={`category-row-menu${openMenu === category.id ? ' open' : ''}`}>
                <button className="category-row-menu-button" type="button" aria-label={`Actions for ${category.name}`} aria-expanded={openMenu === category.id} onClick={() => setOpenMenu(openMenu === category.id ? null : category.id)}>⋮</button>
                {openMenu === category.id && <div className="category-row-menu-pop">
                  {canUpdate && <button type="button" disabled={saving || deletingId !== null} onClick={() => { setOpenMenu(null); openEdit(category); }}>Sửa</button>}
                  {canDelete && <button className="danger" type="button" disabled={deletingId !== null || saving} onClick={() => { setOpenMenu(null); void remove(category); }}>{deletingId === category.id ? 'Đang xoá…' : 'Xoá'}</button>}
                </div>}
              </div>}</td>
            </tr>)}</tbody>
          </table></div>}
      <footer className="categories-footer">
        <div className="categories-page-size"><label>Hiển thị <select aria-label="Số dòng mỗi trang" value={pageSize} disabled={loading} onChange={event => { const size = Number(event.target.value); setPage(1); setPageSize(size); void load(1, size); }}>{PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}</select> dòng/trang</label><span className="categories-total">Tổng <b>{result.totalItems}</b> category</span></div>
        <span className="categories-range">Showing {result.totalItems ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, result.totalItems)} of {result.totalItems} categories</span>
        <div className="categories-pagination"><button aria-label="Trang trước" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>‹</button><span>Page {page} of {totalPages}</span><button aria-label="Trang sau" disabled={page >= totalPages || loading} onClick={() => void load(page + 1)}>›</button></div>
      </footer>
    </section>
    <p className="categories-permission-hint">categories.create/update/delete yêu cầu Operator trở lên — Viewer chỉ thấy bảng, không thấy nút thao tác</p>

    {editor && <div className="categories-backdrop"><section className="categories-dialog" role="dialog" aria-modal="true" aria-labelledby="categories-form-title"><form onSubmit={event => void submit(event)}>
      <div className="categories-dialog-heading"><div><h2 id="categories-form-title">{editor.category ? 'Sửa category' : 'Thêm category'}</h2><p>Nhập thông tin taxonomy sản phẩm.</p></div><button type="button" className="categories-close" aria-label="Đóng" disabled={saving} onClick={() => setEditor(null)}>×</button></div>
      {formError && <div className="categories-alert" role="alert">{formError}</div>}
      <label>Slug<input name="slug" required maxLength={160} defaultValue={editor.initial.slug} /></label>
      <label>Name<input name="name" required maxLength={200} defaultValue={editor.initial.name} /></label>
      <label className="categories-active"><input name="isActive" type="checkbox" defaultChecked={editor.initial.isActive} /> Active</label>
      <div className="categories-dialog-actions"><button type="button" className="categories-button" disabled={saving} onClick={() => setEditor(null)}>Huỷ</button><button type="submit" className="categories-button categories-button-primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu category'}</button></div>
    </form></section></div>}
  </div>;
}
