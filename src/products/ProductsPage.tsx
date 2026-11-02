import { useCallback, useEffect, useState } from 'react';
import { getAdminProducts, type AdminProduct, type AdminRequest } from './products-api';

const PAGE_SIZE = 20;

export function ProductsPage({ requestAdmin }: { requestAdmin: AdminRequest }) {
  const [items, setItems] = useState<AdminProduct[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const loadProducts = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const result = await getAdminProducts(requestAdmin, pageNumber, pageSize, signal);
      setItems(result.items);
      setPageNumber(result.pageNumber);
      setPageSize(result.pageSize);
      setTotalItems(result.totalItems);
    } catch (reason) {
      if (signal.aborted) return;
      setItems([]);
      setTotalItems(0);
      setError(reason instanceof Error ? reason.message : 'Could not load products. Please try again.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [requestAdmin, pageNumber, pageSize, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    void loadProducts(controller.signal);
    return () => controller.abort();
  }, [loadProducts]);

  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleItems = items.filter(product => {
    const matchesSearch = !normalizedSearch || `${product.name} ${product.brand ?? ''} ${product.slug} ${product.id}`.toLocaleLowerCase().includes(normalizedSearch);
    const matchesStatus = activeFilter === 'all' || (activeFilter === 'active' ? product.isActive : !product.isActive);
    return matchesSearch && matchesStatus;
  });
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every(product => selectedIds.has(product.id));
  const selectedCount = selectedIds.size;

  const toggleProduct = (productId: number, selected: boolean) => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (selected) next.add(productId);
      else next.delete(productId);
      return next;
    });
  };

  const toggleVisibleProducts = (selected: boolean) => {
    setSelectedIds(current => {
      const next = new Set(current);
      visibleItems.forEach(product => selected ? next.add(product.id) : next.delete(product.id));
      return next;
    });
  };

  return <div className="products-page">
    <div className="page-header">
      <div><span className="eyebrow">CATALOG</span><h1>Products</h1><p>Danh mục sản phẩm chuẩn và trạng thái hoạt động.</p></div>
    </div>
    <div className="toolbar" role="search">
      <label className="toolbar-search">⌕<input aria-label="Search products" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search product, brand, or slug..." /></label>
      <label><span className="sr-only">Filter by status</span><select aria-label="Filter by status" value={activeFilter} onChange={event => setActiveFilter(event.target.value as typeof activeFilter)}><option value="all">All status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
    </div>

    {error && <div className="banned-alert" role="alert">{error}<button className="outline-button small" type="button" onClick={() => setReloadKey(value => value + 1)}>Retry</button></div>}
    <section className="panel table-panel" aria-label="Products list">
      {loading ? <div className="products-loading" role="status">Loading products…</div>
        : !error && visibleItems.length === 0 ? <div className="products-empty" role="status"><strong>No products found</strong><span>{items.length === 0 ? 'Products will appear here when available.' : 'Try changing your search or status filter.'}</span></div>
          : !error && <>
            {selectedCount > 0 && <p className="products-selection-status" role="status">{selectedCount} selected</p>}
            <div className="products-table-scroll"><table><thead><tr><th className="products-selection-column"><input type="checkbox" aria-label="Select all visible products" checked={allVisibleSelected} onChange={event => toggleVisibleProducts(event.target.checked)} /></th><th>Product</th><th>Category ID</th><th>Status</th></tr></thead><tbody>
              {visibleItems.map(product => <tr key={product.id} className={selectedIds.has(product.id) ? 'products-row-selected' : undefined}>
                <td className="products-selection-column"><input type="checkbox" aria-label={`Select ${product.name}`} checked={selectedIds.has(product.id)} onChange={event => toggleProduct(product.id, event.target.checked)} /></td>
                <td><strong>{product.name}</strong><small>{product.brand || product.slug} · ID {product.id}</small></td>
                <td>{product.categoryId}</td>
                <td><span className={`status status-${product.isActive ? 'active' : 'disabled'}`}>{product.isActive ? 'Active' : 'Inactive'}</span></td>
              </tr>)}
            </tbody></table></div>
            <div className="table-footer"><span>Showing {totalItems === 0 ? 0 : (pageNumber - 1) * pageSize + 1}–{Math.min(pageNumber * pageSize, totalItems)} of {totalItems} products</span><div><button type="button" aria-label="Previous page" disabled={pageNumber <= 1} onClick={() => setPageNumber(value => value - 1)}>‹</button><span className="products-page-number">Page {pageNumber} of {pageCount}</span><button type="button" aria-label="Next page" disabled={pageNumber >= pageCount} onClick={() => setPageNumber(value => value + 1)}>›</button></div></div>
          </>}
    </section>
  </div>;
}
