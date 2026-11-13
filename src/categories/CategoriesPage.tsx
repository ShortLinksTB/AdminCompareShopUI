import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminRequest, Page } from '../bannedItemsApi';
import { createCategory, deleteCategory, getCategories, updateCategory, type AdminCategory, type CategoryInput } from './categories-api';
import { Button, Card, DataTable, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pager, Pill, RowMenu, SearchField, Select, TableFooter, Toolbar } from '../ui';
import './categories.css';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const emptyPage: Page<AdminCategory> = { items: [], pageNumber: 1, pageSize: 100, totalItems: 0 };
const emptyInput: CategoryInput = { slug: '', name: '', isActive: true, parentCategoryId: null };

type EditorState = { category: AdminCategory | null; initial: CategoryInput } | null;

export function CategoriesPage({ requestAdmin, permissions }: { requestAdmin: AdminRequest; permissions: string[] }) {
  const [result, setResult] = useState(emptyPage);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(() => new Set());

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

  useEffect(() => { void load(1, 100); }, [requestAdmin]);
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

  const matchingCategories = result.items.filter(category => `${category.name} ${category.slug}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const categoriesById = new Map(result.items.map(category => [category.id, category]));
  const visibleIds = new Set(matchingCategories.flatMap(category => category.parentCategoryId == null ? [category.id] : [category.id, category.parentCategoryId]));
  const visibleCategories = result.items.filter(category => visibleIds.has(category.id));
  const parentCategories = result.items.filter(category => category.parentCategoryId == null && category.isActive && category.id !== editor?.category?.id);
  const orderedCategories = visibleCategories.filter(category => category.parentCategoryId == null).flatMap(parent => [parent, ...visibleCategories.filter(category => category.parentCategoryId === parent.id)]);
  const orphanedChildren = visibleCategories.filter(category => category.parentCategoryId != null && !categoriesById.has(category.parentCategoryId));
  const filteredTotal = matchingCategories.length;
  const displayedTotal = search.trim() ? filteredTotal : result.totalItems;
  const rangeStart = search.trim() ? (filteredTotal ? 1 : 0) : result.totalItems ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = search.trim() ? filteredTotal : Math.min(page * pageSize, result.totalItems);

  return <div className="categories-page">
    <PageHeader eyebrow="SYSTEM" title="Categories" description="Taxonomy sản phẩm — CRUD qua /admin/categories, theo đúng pattern Partner Shops." actions={canCreate && <Button tone="primary" onClick={openCreate}>+ Thêm category</Button>} />

    {listError && <ErrorState title={listError}><Button size="sm" onClick={() => void load()}>Thử lại</Button></ErrorState>}
    {deleteError && <ErrorState title={deleteError} />}
    <Card className="categories-card" aria-label="Categories">
      <Toolbar><SearchField label="Search categories" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm theo tên hoặc slug..." /></Toolbar>
      {loading ? <div className="categories-loading" role="status" aria-label="Đang tải categories"><Loading /><span>Đang tải categories…</span></div>
        : !listError && result.items.length === 0 ? <EmptyState title="Chưa có category nào." />
          : !listError && <DataTable className="categories-table-scroll"><thead><tr><th scope="col">Id</th><th scope="col">Name</th><th scope="col">Slug</th><th scope="col">Level</th><th scope="col">Parent</th><th scope="col" aria-label="Thao tác" /></tr></thead>
            <tbody>{[...orderedCategories, ...orphanedChildren].map(category => {
              const isChild = category.parentCategoryId != null;
              const parent = !isChild ? null : categoriesById.get(category.parentCategoryId!);
              const children = visibleCategories.filter(item => item.parentCategoryId === category.id);
              const expanded = !collapsedIds.has(category.id);
              if (isChild && parent && collapsedIds.has(parent.id)) return null;
              return <tr key={category.id} className={isChild ? 'category-child-row' : 'category-parent-row'}>
                <td>{category.id}</td><td className="category-name-cell">{!isChild && children.length > 0 && <Button tone="ghost" size="sm" className={`category-hierarchy-toggle${expanded ? '' : ' collapsed'}`} aria-label={`${expanded ? 'Thu gọn' : 'Mở rộng'} ${category.name}`} aria-expanded={expanded} onClick={() => setCollapsedIds(current => { const next = new Set(current); if (next.has(category.id)) next.delete(category.id); else next.add(category.id); return next; })}>⌄</Button>}{isChild && <span className="category-indent" aria-hidden="true" />}{category.name}</td><td><code>{category.slug}</code></td>
                <td><Pill tone="ok" size="sm">Level {isChild ? 2 : 1}</Pill></td><td className="category-parent-cell">{parent?.name ?? '—'}</td>
                <td>{(canUpdate || canDelete) && <RowMenu open={openMenu === category.id} onOpenChange={open => setOpenMenu(open ? category.id : null)} label={`Actions for ${category.name}`}>
                  {canUpdate && <Button tone="ghost" disabled={saving || deletingId !== null} onClick={() => { setOpenMenu(null); openEdit(category); }}>Sửa</Button>}
                  {canDelete && <Button tone="ghost" className="category-delete-action" disabled={deletingId !== null || saving} onClick={() => { setOpenMenu(null); void remove(category); }}>{deletingId === category.id ? 'Đang xoá…' : 'Xoá'}</Button>}
                </RowMenu>}</td>
              </tr>;
            })}</tbody></DataTable>}
      <TableFooter start={rangeStart} end={rangeEnd} total={displayedTotal} center={`Showing ${rangeStart}–${rangeEnd} of ${displayedTotal} categories`} startContent={<label className="categories-page-size">Hiển thị <Select size="sm" aria-label="Số dòng mỗi trang" value={pageSize} disabled={loading} onChange={event => { const size = Number(event.target.value); setPage(1); setPageSize(size); void load(1, size); }}>{PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}</Select> dòng/trang <span className="categories-total">Tổng <b>{displayedTotal}</b> category</span></label>}>
        <Pager page={page} pages={totalPages} formatPage={(current, count) => `Page ${current} of ${count}`} onChange={next => void load(next)} />
      </TableFooter>
    </Card>

    <Modal open={editor !== null} onClose={() => !saving && setEditor(null)} title={editor?.category ? 'Sửa category' : 'Thêm category'} actions={<><Button type="button" tone="ghost" disabled={saving} onClick={() => setEditor(null)}>Huỷ</Button><Button type="submit" form="categories-form" tone="primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu category'}</Button></>}>
      <form id="categories-form" className="categories-form" onSubmit={event => void submit(event)}>
        <p>Nhập thông tin taxonomy sản phẩm.</p>
        {formError && <ErrorState title={formError} />}
        <Field label="Slug" name="slug" required maxLength={160} defaultValue={editor?.initial.slug ?? ''} />
        <Field label="Name" name="name" required maxLength={200} defaultValue={editor?.initial.name ?? ''} />
        <div className="categories-parent-field"><label htmlFor="parent-category-select">Parent category</label><Select id="parent-category-select" name="parentCategoryId" defaultValue={editor?.initial.parentCategoryId ?? ''}><option value="">— Không có cha (tạo Level 1) —</option>{parentCategories.map(parent => <option key={parent.id} value={parent.id}>{parent.name}</option>)}</Select><small>Chọn một category Level 1 làm cha → category này trở thành Level 2. Để trống = category Level 1 gốc (giống hành vi cũ).</small></div>
        <label className="categories-active"><input name="isActive" type="checkbox" defaultChecked={editor?.initial.isActive ?? true} /> Active</label>
      </form>
    </Modal>
  </div>;
}
