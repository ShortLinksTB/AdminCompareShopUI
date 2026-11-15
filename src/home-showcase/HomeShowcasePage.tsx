import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAdminCategories, getAdminProducts, type AdminCategory, type AdminProduct, type AdminRequest } from '../products/products-api';
import { Button, Loading } from '../ui';
import { getHomeShowcase, issueHomeShowcasePreviewToken, publishHomeShowcase, resetHomeShowcaseDraft, saveHomeShowcaseDraft, type HomeShowcaseResponse, type ShowcaseProduct, type ShowcaseSection, type ShowcaseSelection } from './home-showcase-api';
import './home-showcase.css';

const SLOT_COUNT = 15;
const emptySelection = (): ShowcaseSelection => ({ featured: Array(SLOT_COUNT).fill(null), interestedComputers: Array(SLOT_COUNT).fill(null) });
const copySelection = (value: ShowcaseSelection): ShowcaseSelection => ({ featured: [...value.featured], interestedComputers: [...value.interestedComputers] });
const sectionLabel: Record<ShowcaseSection, string> = { featured: 'Sản phẩm nổi bật', interestedComputers: 'Máy tính được quan tâm' };
const productVisible = (product: ShowcaseProduct) => product.isVisible;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.';

function normalizeShowcase(response: HomeShowcaseResponse): { draft: ShowcaseSelection; published: ShowcaseSelection; products: ShowcaseProduct[] } {
  const products = new Map<number, ShowcaseProduct>();
  const normalizeProduct = (product: ShowcaseProduct): ShowcaseProduct => {
    const source = product as ShowcaseProduct & { isActive?: boolean; visible?: boolean; isHidden?: boolean; category?: { name?: string; slug?: string } };
    return { ...product,
      categoryName: product.categoryName || source.category?.name || null,
      categorySlug: product.categorySlug || source.category?.slug || null,
      isVisible: product.isVisible ?? source.isActive ?? source.visible ?? (source.isHidden === undefined ? true : !source.isHidden),
    };
  };
  const selectionFor = (snapshot: HomeShowcaseResponse['draft']) => {
    const selection = emptySelection();
    for (const section of ['featured', 'interestedComputers'] as const) {
      for (const slot of snapshot[section] || []) {
        const index = slot.slotIndex - 1;
        if (index < 0 || index >= SLOT_COUNT) continue;
        if (slot.product) {
          const product = normalizeProduct(slot.product);
          products.set(product.id, product);
          selection[section][index] = product.id;
        }
      }
    }
    return selection;
  };
  const draft = selectionFor(response.draft);
  const published = selectionFor(response.published);
  return { draft, published, products: [...products.values()] };
}

function toShowcaseProduct(product: AdminProduct, categories: AdminCategory[]): ShowcaseProduct {
  const category = categories.find(item => item.id === product.categoryId);
  return { id: product.id, slug: product.slug, name: product.name, imageUrl: product.imageUrl, brand: product.brand,
    categoryName: category?.name ?? null, categorySlug: category?.slug ?? null, isVisible: product.isActive };
}

function changedSlots(from: ShowcaseSelection, to: ShowcaseSelection) {
  return (['featured', 'interestedComputers'] as const).flatMap(section => from[section].flatMap((oldId, index) => {
    const newId = to[section][index];
    return oldId === newId ? [] : [{ section, slot: index + 1, oldId, newId }];
  }));
}

export function HomeShowcasePage({ requestAdmin, permissions }: { requestAdmin: AdminRequest; permissions: string[] }) {
  const [draft, setDraft] = useState<ShowcaseSelection>(emptySelection);
  const [savedDraft, setSavedDraft] = useState<ShowcaseSelection>(emptySelection);
  const [published, setPublished] = useState<ShowcaseSelection>(emptySelection);
  const [products, setProducts] = useState<ShowcaseProduct[]>([]);
  const [catalog, setCatalog] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [catalogPage, setCatalogPage] = useState(0);
  const [catalogHasMore, setCatalogHasMore] = useState(true);
  const [section, setSection] = useState<ShowcaseSection>('featured');
  const [previewSource, setPreviewSource] = useState<'draft' | 'live'>('draft');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [fullDevice, setFullDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [openingPreview, setOpeningPreview] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSlot, setPickerSlot] = useState(0);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [publishOpen, setPublishOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const pickerTrigger = useRef<HTMLElement | null>(null);
  const canRead = permissions.includes('home_showcase.read');
  const canUpdate = permissions.includes('home_showcase.update');
  const canPublish = permissions.includes('home_showcase.publish');
  const editorLocked = saving || publishing || resetting;
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const changes = useMemo(() => changedSlots(published, draft), [published, draft]);
  const productById = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);

  const applyResponse = useCallback((response: HomeShowcaseResponse) => {
    const normalized = normalizeShowcase(response);
    setDraft(normalized.draft);
    setSavedDraft(copySelection(normalized.draft));
    setPublished(normalized.published);
    setProducts(current => [...new Map([...current, ...normalized.products].map(product => [product.id, product])).values()]);
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await getHomeShowcase(requestAdmin, signal);
      if (!signal?.aborted) applyResponse(response);
    } catch (reason) {
      if (!signal?.aborted) setError(errorMessage(reason));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [applyResponse, requestAdmin]);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [canRead, load]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty]);

  const loadCatalog = useCallback(async (page: number) => {
    setCatalogLoading(true);
    setError('');
    try {
      const [result, categoryResult] = await Promise.all([
        getAdminProducts(requestAdmin, page, 100),
        categories.length ? Promise.resolve(categories) : getAdminCategories(requestAdmin),
      ]);
      setCatalog(current => page === 1 ? result.items : [...current, ...result.items]);
      setCatalogPage(result.pageNumber);
      setCatalogHasMore(result.pageNumber * result.pageSize < result.totalItems);
      setCategories(categoryResult);
      const mapped = result.items.map(product => toShowcaseProduct(product, categoryResult));
      setProducts(current => [...new Map([...current, ...mapped].map(product => [product.id, product])).values()]);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setCatalogLoading(false);
    }
  }, [categories, requestAdmin]);

  const openPicker = (slot: number, trigger: HTMLElement) => {
    pickerTrigger.current = trigger;
    setPickerSlot(slot);
    setQuery('');
    setCategoryId(section === 'interestedComputers' ? 'computers' : 'all');
    setPickerOpen(true);
    if (catalogPage === 0) void loadCatalog(1);
  };
  const closePicker = () => {
    setPickerOpen(false);
    requestAnimationFrame(() => pickerTrigger.current?.focus());
  };

  useEffect(() => {
    if (!pickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closePicker(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pickerOpen]);

  useEffect(() => {
    if (!publishOpen && !fullScreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (publishOpen) setPublishOpen(false);
      if (fullScreen) setFullScreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullScreen, publishOpen]);

  const pickerProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return catalog.filter(product => {
      const mapped = productById.get(product.id) || toShowcaseProduct(product, categories);
      const categoryMatches = categoryId === 'all' || (categoryId === 'computers'
        ? mapped.categorySlug?.toLocaleLowerCase() === 'computers'
        : String(product.categoryId) === categoryId);
      const queryMatches = !normalizedQuery || `${product.name} ${product.brand || ''} ${product.slug}`.toLocaleLowerCase().includes(normalizedQuery);
      return categoryMatches && queryMatches && (section !== 'interestedComputers' || mapped.categorySlug?.toLocaleLowerCase() === 'computers');
    });
  }, [catalog, categories, categoryId, productById, query, section]);

  const putProduct = (product: AdminProduct) => {
    setProducts(current => [...new Map([...current, toShowcaseProduct(product, categories)].map(item => [item.id, item])).values()]);
    setDraft(current => ({ ...current, [section]: current[section].map((id, index) => index === pickerSlot ? product.id : id) }));
    setNotice(`Đã đặt sản phẩm vào ô ${pickerSlot + 1}. Nhớ lưu nháp để giữ thay đổi.`);
    closePicker();
  };
  const moveSlot = (from: number, direction: -1 | 1) => {
    const to = from + direction;
    if (to < 0 || to >= SLOT_COUNT) return;
    setDraft(current => {
      const values = [...current[section]];
      [values[from], values[to]] = [values[to], values[from]];
      return { ...current, [section]: values };
    });
  };
  const swapSlots = (from: number, to: number) => setDraft(current => {
    const values = [...current[section]];
    [values[from], values[to]] = [values[to], values[from]];
    return { ...current, [section]: values };
  });

  const saveDraft = async () => {
    setSaving(true); setError(''); setNotice('');
    try { await saveHomeShowcaseDraft(requestAdmin, draft); setSavedDraft(copySelection(draft)); setNotice('Đã lưu nháp. Trang chủ công khai chưa thay đổi cho tới khi publish.'); }
    catch (reason) { setError(`Không lưu được nháp. Các thay đổi trên màn hình vẫn được giữ. ${errorMessage(reason)}`); }
    finally { setSaving(false); }
  };
  const resetDraft = async () => {
    if (!resetConfirm) { setResetConfirm(true); window.setTimeout(() => setResetConfirm(false), 3500); return; }
    setResetConfirm(false); setResetting(true); setError(''); setNotice('');
    try { await resetHomeShowcaseDraft(requestAdmin); setDraft(copySelection(published)); setSavedDraft(copySelection(published)); setNotice('Đã hoàn tác nháp về bản đang chạy.'); }
    catch (reason) { setError(`Không thể hoàn tác. Nội dung đang sửa vẫn được giữ. ${errorMessage(reason)}`); }
    finally { setResetting(false); }
  };
  const publish = async () => {
    setPublishing(true); setError(''); setNotice('');
    try { await publishHomeShowcase(requestAdmin); setPublished(copySelection(draft)); setSavedDraft(copySelection(draft)); setPublishOpen(false); setNotice('Đã publish. Trang chủ công khai sẽ cập nhật sau khi cache được làm mới.'); }
    catch (reason) { setError(`Publish chưa thành công. Bản đang chạy và nội dung đang sửa vẫn được giữ. ${errorMessage(reason)}`); }
    finally { setPublishing(false); }
  };
  const openWebsitePreview = async () => {
    const previewWindow = window.open('about:blank', '_blank');
    if (!previewWindow) { setError('Trình duyệt đã chặn tab xem trước. Hãy cho phép cửa sổ bật lên rồi thử lại.'); return; }
    previewWindow.opener = null;
    setOpeningPreview(true); setError('');
    try {
      const token = await issueHomeShowcasePreviewToken(requestAdmin);
      const baseUrl = import.meta.env.VITE_STOREFRONT_URL || 'https://compareshop-dev.giamha.online';
      const url = new URL(baseUrl);
      url.hash = new URLSearchParams({ homeShowcasePreview: token }).toString();
      previewWindow.location.replace(url.toString());
    } catch (reason) { previewWindow.close(); setError(`Không mở được xem trước bản nháp. ${errorMessage(reason)}`); }
    finally { setOpeningPreview(false); }
  };

  const currentPreview = previewSource === 'draft' ? draft : published;
  const renderSite = (selection: ShowcaseSelection, size: 'desktop' | 'mobile') => {
    const visible = (sectionKey: ShowcaseSection) => selection[sectionKey].flatMap(id => {
      const product = id == null ? undefined : productById.get(id);
      return product && productVisible(product) ? [product] : [];
    });
    const featured = visible('featured');
    const computers = visible('interestedComputers');
    return <div className={`showcase-site showcase-site--${size}`}>
      <div className="showcase-site__nav"><b>G</b><strong>GiaTot</strong>{size === 'desktop' && <span>Danh mục　·　Sản phẩm nổi bật　·　Blog</span>}</div>
      <div className="showcase-site__hero"><div><small>MUA THÔNG MINH HƠN</small><h3>So sánh giá thông minh,<br /><em>tiết kiệm hơn mỗi ngày.</em></h3><div className="showcase-site__search">Tìm sản phẩm, thương hiệu…</div></div>
        <div className="showcase-site__hero-card"><h4>🔥 Sản phẩm nổi bật</h4>{featured.slice(0, 3).map(product => <PreviewProduct key={product.id} product={product} compact />)}{featured.length === 0 && <p>Chưa có sản phẩm nổi bật</p>}</div>
      </div>
      <PreviewSection title="Sản phẩm nổi bật" products={featured} />
      <PreviewSection title="Máy tính được quan tâm" products={computers} />
    </div>;
  };

  if (!canRead) return <div className="home-showcase__state" role="alert">Bạn chưa có quyền xem cấu hình trang chủ.</div>;
  if (loading) return <div className="home-showcase__loading"><Loading label="Đang tải cấu hình trang chủ" /></div>;
  if (error && !products.length && !draft.featured.some(Boolean) && !draft.interestedComputers.some(Boolean)) return <div className="home-showcase__state" role="alert"><b>Không tải được cấu hình trang chủ.</b><p>{error}</p><Button onClick={() => void load()}>Thử lại</Button></div>;

  const activeSlots = draft[section].filter(Boolean).length;
  const previewChanged = JSON.stringify(draft) !== JSON.stringify(published);
  const previewSourceLabel = previewSource === 'draft' ? (previewChanged ? 'Bản nháp · khách chưa thấy' : 'Bản nháp trùng bản đang chạy') : 'Đang chạy';
  const onSlotKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); moveSlot(index, -1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); moveSlot(index, 1); }
  };

  return <main className="home-showcase">
    <header className="home-showcase__header"><div><span className="home-showcase__eyebrow">NỘI DUNG</span><h1>Trang chủ</h1><p>Chọn sản phẩm cho từng ô của hai mục trên trang chủ website. Vị trí là chính ô bạn đặt sản phẩm vào.</p></div></header>
    {error && <div className="home-showcase__alert" role="alert"><span>{error}</span><button type="button" aria-label="Đóng thông báo" onClick={() => setError('')}>×</button></div>}
    {notice && <div className="home-showcase__notice" role="status">{notice}<button type="button" aria-label="Đóng thông báo" onClick={() => setNotice('')}>×</button></div>}
    <div className="home-showcase__layout">
      <section className="home-showcase__panel" aria-label="Chỉnh sửa trang chủ">
        <div className="home-showcase__tabs" role="tablist" aria-label="Mục trang chủ">
          {(['featured', 'interestedComputers'] as const).map(key => <button key={key} role="tab" aria-selected={section === key} onClick={() => setSection(key)}>{sectionLabel[key]}<small>{draft[key].filter(Boolean).length}/15</small></button>)}
        </div>
        <div className="home-showcase__section-heading"><div><h2>{sectionLabel[section]}</h2><p>{section === 'featured' ? 'Ô 1–3 cũng là các thẻ nổi bật trong hero.' : 'Chỉ sản phẩm thuộc danh mục Computers mới được chọn.'}</p></div><Button size="sm" disabled={!canUpdate || activeSlots === 0 || editorLocked} onClick={() => setDraft(current => ({ ...current, [section]: Array(SLOT_COUNT).fill(null) }))}>Xoá hết</Button></div>
        <div className="home-showcase__legend">{section === 'featured' ? <><span><i className="is-hero" />Ô 1–3: thẻ đầu trang</span><span><i />Ô 4–15: lưới sản phẩm</span></> : <span><i />Lưới máy tính</span>}</div>
        <div className="home-showcase__slots" role="list" aria-label={`${sectionLabel[section]}: 15 ô`}>
          {draft[section].map((id, index) => {
            const product = id == null ? undefined : productById.get(id);
            const hero = section === 'featured' && index < 3;
            return <article key={`${section}-${index}`} className={`home-showcase__slot${hero ? ' is-hero' : ''}${product ? '' : ' is-empty'}`} role="listitem" draggable={Boolean(product) && canUpdate && !editorLocked}
              onDragStart={event => { if (editorLocked) return; setDragIndex(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }}
              onDragOver={event => { if (dragIndex !== null && !editorLocked) event.preventDefault(); }}
              onDrop={event => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); if (Number.isInteger(from) && !editorLocked) swapSlots(from, index); setDragIndex(null); }}
              onDragEnd={() => setDragIndex(null)} onKeyDown={event => onSlotKeyDown(event, index)}>
              <span className="home-showcase__slot-number">{index + 1}</span>
              {product ? <>
                {product.imageUrl ? <img className="home-showcase__product-image" src={product.imageUrl} alt="" /> : <span className="home-showcase__product-image is-placeholder" aria-hidden="true">▧</span>}
                <div className="home-showcase__product-info"><strong>{product.name}</strong><small>{[product.brand, product.categoryName].filter(Boolean).join(' · ')}</small>{!productVisible(product) && <span className="home-showcase__hidden">Đang ẩn · không hiện trên trang chủ</span>}</div>
                <div className="home-showcase__slot-actions"><button type="button" aria-label={`Chuyển ô ${index + 1} sang trái`} disabled={!canUpdate || editorLocked || index === 0} onClick={() => moveSlot(index, -1)}>←</button><button type="button" aria-label={`Chuyển ô ${index + 1} sang phải`} disabled={!canUpdate || editorLocked || index === SLOT_COUNT - 1} onClick={() => moveSlot(index, 1)}>→</button><button type="button" disabled={!canUpdate || editorLocked} onClick={event => openPicker(index, event.currentTarget)}>Đổi</button><button type="button" aria-label={`Gỡ sản phẩm khỏi ô ${index + 1}`} disabled={!canUpdate || editorLocked} onClick={() => setDraft(current => ({ ...current, [section]: current[section].map((value, position) => position === index ? null : value) }))}>Gỡ</button></div>
              </> : <button type="button" className="home-showcase__empty-action" disabled={!canUpdate || editorLocked} onClick={event => openPicker(index, event.currentTarget)}><b>＋</b>Chọn sản phẩm</button>}
            </article>;
          })}
        </div>
        <p className="home-showcase__fallback">{activeSlots ? `Trang chủ hiển thị ${draft[section].filter(id => id != null && productById.get(id) && productVisible(productById.get(id)!)).length} sản phẩm đã chọn; ô trống được dồn lên và sản phẩm đang ẩn bị bỏ qua.` : <>Chưa chọn ô nào: trang chủ sẽ dùng 15 sản phẩm đầu làm fallback.</>}</p>
      </section>
      <section className="home-showcase__panel home-showcase__preview" aria-label="Xem trước trang chủ">
        <div className="home-showcase__preview-heading"><h2>Xem trước trang chủ</h2><div className="home-showcase__controls">
          <div className="home-showcase__toggle" role="group" aria-label="Nguồn xem trước">{(['draft', 'live'] as const).map(source => <button key={source} aria-pressed={previewSource === source} onClick={() => setPreviewSource(source)}>{source === 'draft' ? 'Bản nháp' : 'Đang chạy'}</button>)}</div><span className="home-showcase__preview-note">{previewSourceLabel}</span>
          <div className="home-showcase__toggle" role="group" aria-label="Kích thước xem trước">{(['desktop', 'mobile'] as const).map(value => <button key={value} aria-pressed={device === value} onClick={() => setDevice(value)}>{value === 'desktop' ? 'Máy tính' : 'Điện thoại'}</button>)}</div>
          <Button size="sm" onClick={() => { setFullDevice(device); setFullScreen(true); }}>⤢ Toàn màn hình</Button><Button size="sm" disabled={openingPreview} onClick={() => void openWebsitePreview()}>{openingPreview ? 'Đang mở…' : '↗ Mở tab mới'}</Button>
        </div></div>
        <div className="home-showcase__preview-canvas">{renderSite(currentPreview, device)}</div>
      </section>
    </div>
    <div className="home-showcase__notes"><b>Quy tắc hiển thị</b><span>Ô 1–3 của Sản phẩm nổi bật cũng xuất hiện trong hero. Sản phẩm đã ở ô khác trong cùng mục sẽ bị vô hiệu trong bộ chọn.</span><span>Sản phẩm ẩn vẫn có thể được chọn nhưng không hiển thị trên website. Khi mục không còn sản phẩm hợp lệ, website tự dùng dữ liệu fallback.</span><span>Lưu nháp không đổi trang chủ khách truy cập; chỉ Publish mới cập nhật bản đang chạy.</span></div>
    <footer className="home-showcase__savebar"><div className="home-showcase__save-status" role="status"><b className={dirty ? 'is-unsaved' : previewChanged ? 'is-draft' : 'is-live'}>{dirty ? 'Chưa lưu nháp' : previewChanged ? 'Nháp chưa publish' : 'Đang chạy'}</b><span>{dirty ? `${changes.length} ô thay đổi so với bản đang chạy. Trang chủ vẫn giữ bản đang chạy.` : previewChanged ? `${changes.length} thay đổi đã lưu nháp; chưa publish.` : 'Bản nháp trùng với trang chủ hiện tại.'}</span></div><Button disabled={!canUpdate || (!dirty && !previewChanged) || saving || publishing || resetting} onClick={() => void resetDraft()}>{resetting ? 'Đang hoàn tác…' : resetConfirm ? 'Bấm lại để xác nhận' : 'Hoàn tác về bản đang chạy'}</Button><Button disabled={!canUpdate || !dirty || saving || publishing} onClick={() => void saveDraft()}>{saving ? 'Đang lưu…' : 'Lưu nháp'}</Button><Button tone="primary" disabled={!canPublish || (changes.length === 0) || saving || publishing || resetting} onClick={() => setPublishOpen(true)}>Publish lên trang chủ</Button></footer>

    {pickerOpen && <div className="home-showcase__backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closePicker(); }}><section className="home-showcase__dialog" role="dialog" aria-modal="true" aria-labelledby="home-picker-title"><header><div><small>{sectionLabel[section]} · Ô {pickerSlot + 1}</small><h2 id="home-picker-title">Chọn sản phẩm</h2></div><button type="button" aria-label="Đóng" onClick={closePicker}>×</button></header><div className="home-showcase__picker-tools"><input type="search" aria-label="Tìm sản phẩm" placeholder="Tìm theo tên hoặc thương hiệu…" value={query} onChange={event => setQuery(event.target.value)} /><select aria-label="Lọc danh mục" value={categoryId} onChange={event => setCategoryId(event.target.value)} disabled={section === 'interestedComputers'}><option value="all">Tất cả danh mục</option>{section === 'interestedComputers' ? <option value="computers">Computers</option> : categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></div><div className="home-showcase__picker-list">{pickerProducts.map(product => {
      const assignedAt = draft[section].indexOf(product.id);
      const isTaken = assignedAt >= 0 && assignedAt !== pickerSlot;
      const mapped = productById.get(product.id) || toShowcaseProduct(product, categories);
      return <button type="button" className="home-showcase__picker-item" key={product.id} disabled={isTaken || !canUpdate || editorLocked} onClick={() => putProduct(product)}><span className="home-showcase__picker-thumb">{product.imageUrl && <img src={product.imageUrl} alt="" />}</span><span><strong>{product.name}</strong><small>{[product.brand, mapped.categoryName].filter(Boolean).join(' · ')}</small></span><em>{isTaken ? `Đã ở ô ${assignedAt + 1}` : !mapped.isVisible ? 'Đang ẩn' : ''}</em></button>;
    })}{catalogLoading && <Loading label="Đang tải sản phẩm" />}{!catalogLoading && pickerProducts.length === 0 && <p className="home-showcase__picker-empty">Không có sản phẩm khớp bộ lọc.</p>}{catalogHasMore && <Button disabled={catalogLoading} onClick={() => void loadCatalog(catalogPage + 1)}>Tải thêm sản phẩm</Button>}</div></section></div>}

    {publishOpen && <div className="home-showcase__backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPublishOpen(false); }}><section className="home-showcase__dialog home-showcase__publish-dialog" role="dialog" aria-modal="true" aria-labelledby="home-publish-title"><header><div><small>Xác nhận</small><h2 id="home-publish-title">Publish lên trang chủ?</h2></div><button type="button" aria-label="Đóng" onClick={() => setPublishOpen(false)}>×</button></header><div className="home-showcase__publish-summary"><p>{changes.length} thay đổi sẽ được đưa lên trang chủ:</p><ul>{changes.map(change => <li key={`${change.section}-${change.slot}`}><b>{sectionLabel[change.section]} · Ô {change.slot}{change.section === 'featured' && change.slot <= 3 ? ' (thẻ hero)' : ''}</b><span><s>{change.oldId == null ? '(trống)' : productById.get(change.oldId)?.name || `Sản phẩm #${change.oldId}`}</s><i> → </i>{change.newId == null ? '(trống)' : productById.get(change.newId)?.name || `Sản phẩm #${change.newId}`}</span></li>)}</ul><p>Sau khi publish, khách truy cập mới thấy thay đổi. Nếu có lỗi, bản đang chạy và nội dung đang sửa được giữ nguyên.</p></div><footer><Button onClick={() => setPublishOpen(false)}>Huỷ</Button><Button tone="primary" disabled={publishing} onClick={() => void publish()}>{publishing ? 'Đang publish…' : 'Publish ngay'}</Button></footer></section></div>}

    {fullScreen && <div className="home-showcase__fullscreen" role="dialog" aria-modal="true" aria-label="Xem trước toàn trang chủ"><header><h2>Xem trước trang chủ <small>· {previewSourceLabel}</small></h2><div className="home-showcase__controls"><div className="home-showcase__toggle">{(['desktop', 'mobile'] as const).map(value => <button key={value} aria-pressed={fullDevice === value} onClick={() => setFullDevice(value)}>{value === 'desktop' ? 'Máy tính' : 'Điện thoại'}</button>)}</div><Button onClick={() => setFullScreen(false)}>Đóng (Esc)</Button></div></header><div className="home-showcase__fullscreen-content">{renderSite(currentPreview, fullDevice)}</div></div>}
  </main>;
}

function PreviewProduct({ product, compact = false }: { product: ShowcaseProduct; compact?: boolean }) {
  return <div className={`showcase-site__product${compact ? ' is-compact' : ''}`}>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span className="showcase-site__placeholder" aria-hidden="true">▧</span>}<b>{product.name}</b>{product.brand && <small>{product.brand}</small>}</div>;
}
function PreviewSection({ title, products }: { title: string; products: ShowcaseProduct[] }) {
  return <section className="showcase-site__section"><h4>{title}</h4>{products.length ? <div className="showcase-site__products">{products.map(product => <PreviewProduct key={product.id} product={product} />)}</div> : <p>Chưa có sản phẩm</p>}</section>;
}
