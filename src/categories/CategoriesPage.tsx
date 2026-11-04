import { useEffect, useState, type FormEvent } from 'react';
import type { AdminRequest, Page } from '../bannedItemsApi';
import { createCategory, deleteCategory, getCategories, updateCategory, type AdminCategory, type CategoryInput } from './categories-api';
import './categories.css';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const emptyPage: Page<AdminCategory> = { items: [], pageNumber: 1, pageSize: 20, totalItems: 0 };
type CategoryEditor = AdminCategory | null;

export function CategoriesPage({ requestAdmin, permissions }: { requestAdmin: AdminRequest; permissions: string[] }) {
  const [result, setResult] = useState(emptyPage);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [editor, setEditor] = useState<CategoryEditor | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setListError(null);
    void getCategories(requestAdmin, page, pageSize, controller.signal)
      .then(data => {
        setResult(data);
        if (data.pageNumber !== page) setPage(data.pageNumber);
        if (data.pageSize !== pageSize) setPageSize(data.pageSize);
      })
      .catch(reason => {
        if (!controller.signal.aborted) setListError(reason instanceof Error ? reason.message : 'Could not load categories. Please try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [requestAdmin, page, pageSize, reloadKey]);

  const can = (permission: string) => permissions.includes(permission);
  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));
  const mutationPending = saving || deletingId !== null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editor === undefined) return;
    const values = new FormData(event.currentTarget);
    const input: CategoryInput = {
      slug: String(values.get('slug') ?? '').trim(),
      name: String(values.get('name') ?? '').trim(),
      isActive: values.get('isActive') === 'on',
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editor) await updateCategory(requestAdmin, editor.id, input);
      else await createCategory(requestAdmin, input);
      setEditor(undefined);
      setReloadKey(value => value + 1);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Could not save this category. Your values are still here; please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(category: AdminCategory) {
    if (!window.confirm(`Xoá category “${category.name}”?`)) return;
    setDeletingId(category.id);
    setOperationError(null);
    try {
      await deleteCategory(requestAdmin, category.id);
      if (page > 1 && result.items.length === 1) setPage(current => current - 1);
      else setReloadKey(value => value + 1);
    } catch (reason) {
      setOperationError(reason instanceof Error ? reason.message : 'Could not delete this category. Please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  const firstItem = result.totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, result.totalItems);

  return <main className="categories-page">
    <span className="eyebrow">SYSTEM</span>
    <header className="page-header categories-page-header">
      <div><h1>Categories</h1><p>Taxonomy sản phẩm — CRUD qua /admin/categories, theo đúng pattern Partner Shops.</p></div>
      {can('categories.create') && <button type="button" className="primary-button categories-create" disabled={mutationPending} onClick={() => { setFormError(null); setEditor(null); }}>+ Thêm category</button>}
    </header>

    {(listError || operationError) && <div className="categories-alert" role="alert"><span>{listError || operationError}</span>{listError && <button type="button" className="outline-button small" onClick={() => setReloadKey(value => value + 1)}>Thử lại</button>}</div>}

    <section className="panel table-panel categories-table-panel" aria-label="Categories">
      {loading ? <div className="categories-loading" role="status" aria-label="Đang tải categories"><span className="categories-spinner" />Đang tải categories…</div>
        : listError ? <div className="categories-empty">Không thể tải dữ liệu categories.</div>
          : result.items.length === 0 ? <div className="categories-empty"><strong>Chưa có category nào</strong><span>Danh sách sẽ xuất hiện tại đây sau khi được tạo.</span></div>
            : <div className="categories-table-scroll"><table>
              <thead><tr><th scope="col">Id</th><th scope="col">Name</th><th scope="col">Slug</th><th scope="col"><span className="visually-hidden">Thao tác</span></th></tr></thead>
              <tbody>{result.items.map(category => <tr key={category.id}>
                <td>{category.id}</td><td>{category.name}</td><td><code className="category-slug">{category.slug}</code></td>
                <td><div className="categories-actions">
                  {can('categories.update') && <button type="button" className="outline-button small" disabled={mutationPending} onClick={() => { setFormError(null); setEditor(category); }}>Sửa</button>}
                  {can('categories.delete') && <button type="button" className="outline-button small categories-delete" disabled={mutationPending} onClick={() => void remove(category)}>{deletingId === category.id ? 'Đang xoá…' : 'Xoá'}</button>}
                </div></td>
              </tr>)}</tbody>
            </table></div>}

      <footer className="categories-footer">
        <span>{firstItem}–{lastItem} / {result.totalItems} category · trang {page}/{totalPages}</span>
        <label className="categories-page-size">Số dòng<select aria-label="Số dòng mỗi trang" value={pageSize} disabled={loading} onChange={event => { setPage(1); setPageSize(Number(event.target.value)); }}>
          {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
        </select></label>
        <div className="categories-pagination"><button type="button" aria-label="Trang trước" disabled={page <= 1 || loading || mutationPending} onClick={() => setPage(current => current - 1)}>‹</button><span>Trang {page}/{totalPages}</span><button type="button" aria-label="Trang sau" disabled={page >= totalPages || loading || mutationPending} onClick={() => setPage(current => current + 1)}>›</button></div>
        <small>categories.create/update/delete yêu cầu Operator trở lên — Viewer chỉ thấy bảng, không thấy nút thao tác</small>
      </footer>
    </section>

    {editor !== undefined && <div className="categories-dialog-backdrop">
      <section className="panel categories-dialog" role="dialog" aria-modal="true" aria-labelledby="categories-form-title">
        <form onSubmit={event => void submit(event)}>
          <div className="panel-heading"><div><h2 id="categories-form-title">{editor ? 'Sửa category' : 'Thêm category'}</h2><p>Nhập thông tin taxonomy sản phẩm.</p></div><button type="button" className="row-menu" aria-label="Đóng" disabled={saving} onClick={() => setEditor(undefined)}>×</button></div>
          {formError && <div className="categories-form-error" role="alert">{formError}</div>}
          <label>Slug<input name="slug" required maxLength={160} defaultValue={editor?.slug ?? ''} autoFocus /></label>
          <label>Name<input name="name" required maxLength={200} defaultValue={editor?.name ?? ''} /></label>
          <label className="categories-active"><input name="isActive" type="checkbox" defaultChecked={editor?.isActive ?? true} /> Đang hoạt động</label>
          <div className="categories-dialog-actions"><button type="button" className="outline-button" disabled={saving} onClick={() => setEditor(undefined)}>Huỷ</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu category'}</button></div>
        </form>
      </section>
    </div>}
  </main>;
}
