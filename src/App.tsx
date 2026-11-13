import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { offers, products, type Status } from './mockData';
import { fetchMatchings } from './matching/matching-api';
import { AuthLoadingScreen, AuthProvider, CallbackPage, ForbiddenPage, LoginPage, PermissionFailure, useAuth } from './auth';
import { safeReturnPath } from './auth-utils';
import { MatchingPage } from './matching/MatchingPage';
import { BannedItemsRoute } from './BannedItems';
import { PartnerShops } from './PartnerShops';
import { ProductsPage } from './products/ProductsPage';
import { OffersPage } from './offers/OffersPage';
import { Dashboard } from './dashboard/Dashboard';
import { AnalyticsPage } from './analytics/AnalyticsPage';
import { SyncJobsPage } from './sync-jobs/SyncJobsPage';
import { CategoriesPage } from './categories/CategoriesPage';
import { UsersPage } from './users/UsersPage';
import { AuditLogsPage as AuditLogsApiPage } from './auditLogs/AuditLogsPage';
import { FilesPage } from './files/FilesPage';
import { AdminCompareShopBlog } from './blog/AdminCompareShopBlog';
import { StudioReferencePage } from './ui/StudioReferencePage';
import { DataSourcesPage } from './data-sources/DataSourcesPage';
import './ui/studio-shell-fixes.css';

const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
// `permission` must match a key the backend actually grants (see
// /admin/me/permissions) — items without one are always shown to any
// authenticated admin once their feature flag is on, so every entry here
// needs one. Affiliate Links has no backend permission yet, so it's
// deliberately left out of this list (route still exists for direct nav)
// until that permission exists.
const nav = [{ to: '/', label: 'Tổng quan', icon: '▦', end: true, permission: 'dashboard.read' }, { to: '/products', label: 'Products', icon: '□', flag: 'products', permission: 'products.read' }, { to: '/offers', label: 'Offers & Prices', icon: '₫', flag: 'offers', permission: 'offers.read' }, { to: '/matching', label: 'Product Matching', icon: '⇄', flag: 'matching', permission: 'matching.read' }, { to: '/shops', label: 'Partner Shops', icon: '⌂', flag: 'shops', permission: 'shops.read' }, { to: '/data-sources', label: 'Data Sources', icon: '◫', flag: 'dataSources', permission: 'sync_jobs.read' }, { to: '/sync-jobs', label: 'Sync Jobs', icon: '↻', flag: 'syncJobs', permission: 'sync_jobs.read' }, { to: '/price-history', label: 'Price History', icon: '⌁', flag: 'priceHistory', permission: 'offers.read' }, { to: '/price-alerts', label: 'Price Alerts', icon: '◉', flag: 'priceAlerts', permission: 'price_alerts.read_all' }, { to: '/categories', label: 'Categories', icon: '◇', flag: 'categories', permission: 'categories.read' }, { to: '/files', label: 'Files', icon: '▧', permission: 'files.read' }, { to: '/banned-items', label: 'Banned items', icon: '⊘', permission: 'compliance.read' }, { to: '/blog', label: 'Blog CMS', icon: '▤', flag: 'blog', permission: 'articles.read' }, { to: '/analytics', label: 'Analytics', icon: '⌁', flag: 'analytics', permission: 'analytics.read' }, { to: '/seo', label: 'SEO', icon: '◎', flag: 'seo', permission: 'seo.read' }, { to: '/users', label: 'Users & Roles', icon: '♙', flag: 'users', permission: 'users.manage' }, { to: '/audit-logs', label: 'Audit Logs', icon: '≡', flag: 'auditLogs', permission: 'audit_logs.read' }, { to: '/feature-flags', label: 'Feature Flags', icon: '⚑', permission: 'feature_flags.read' }, { to: '/settings', label: 'Settings', icon: '⚙', permission: 'settings.manage' }];
const navGroups: { label: string; routes: string[] }[] = [
  { label: 'Tổng quan', routes: ['/'] },
  { label: 'Catalog', routes: ['/products', '/matching', '/shops', '/categories'] },
  { label: 'Dữ liệu', routes: ['/offers', '/data-sources', '/sync-jobs', '/price-history', '/price-alerts'] },
  { label: 'Nội dung', routes: ['/files', '/banned-items', '/blog', '/seo'] },
  { label: 'Hệ thống', routes: ['/analytics', '/users', '/audit-logs', '/feature-flags', '/settings', '/studio-components'] },
];
const studioNavItem = { to: '/studio-components', label: 'Studio components', icon: '◈', permission: 'settings.manage', end: false };
const breadcrumbRoutes: { path: string; label: string }[] = [
  ...nav.map(({ to, label }) => ({ path: to, label })),
  { path: studioNavItem.to, label: studioNavItem.label },
  { path: '/affiliate-links', label: 'Affiliate Links' },
  { path: '/seo', label: 'SEO' },
];
function breadcrumbLabel(pathname: string) {
  if (pathname === '/banned-items/new') return 'Banned items / Add item';
  if (/^\/products\/[^/]+\/?$/.test(pathname)) return 'Products / Product details';
  const match = breadcrumbRoutes
    .filter(route => route.path !== '/')
    .sort((left, right) => right.path.length - left.path.length)
    .find(route => pathname === route.path || pathname.startsWith(`${route.path}/`));
  return match?.label ?? (pathname === '/' ? 'Tổng quan' : 'Dashboard');
}

type FeatureKey = 'products' | 'offers' | 'matching' | 'shops' | 'dataSources' | 'syncJobs' | 'affiliateLinks' | 'priceHistory' | 'priceAlerts' | 'categories' | 'blog' | 'analytics' | 'seo' | 'users' | 'auditLogs';
type FeatureFlags = Record<FeatureKey, boolean>;
const featureDefaults: FeatureFlags = { products: true, offers: true, matching: true, shops: true, dataSources: true, syncJobs: true, affiliateLinks: true, priceHistory: true, priceAlerts: true, categories: true, blog: true, analytics: true, seo: true, users: true, auditLogs: true };
const flagLabels: Record<FeatureKey, { label: string; description: string }> = { products: { label: 'Products', description: 'Quản lý product chuẩn và catalog.' }, offers: { label: 'Offers & Prices', description: 'Giá, tồn kho và chất lượng offer.' }, matching: { label: 'Product Matching', description: 'Review listing và ghép sản phẩm.' }, shops: { label: 'Partner Shops', description: 'Đối tác và coverage dữ liệu.' }, dataSources: { label: 'Data Sources', description: 'API, feed và CSV data source.' }, syncJobs: { label: 'Sync Jobs', description: 'Theo dõi lịch đồng bộ dữ liệu.' }, affiliateLinks: { label: 'Affiliate Links', description: 'Tracking và affiliate performance.' }, priceHistory: { label: 'Price History', description: 'Lịch sử biến động giá.' }, priceAlerts: { label: 'Price Alerts', description: 'Cảnh báo giá cho người dùng.' }, categories: { label: 'Categories', description: 'Taxonomy và SEO category.' }, blog: { label: 'Blog CMS', description: 'Quản lý bài viết và nội dung.' }, analytics: { label: 'Analytics', description: 'Traffic, conversion và revenue.' }, seo: { label: 'SEO', description: 'Metadata và index status.' }, users: { label: 'Users & Roles', description: 'Tài khoản admin và quyền truy cập.' }, auditLogs: { label: 'Audit Logs', description: 'Lịch sử thao tác trong admin.' } };
const FeatureFlagsContext = createContext<{ flags: FeatureFlags; setFlag: (key: FeatureKey, enabled: boolean) => void }>({ flags: featureDefaults, setFlag: () => undefined });
function FeatureFlagsProvider({ children }: { children: React.ReactNode }) { const [flags, setFlags] = useState<FeatureFlags>(() => { try { return { ...featureDefaults, ...JSON.parse(window.localStorage.getItem('giatot-admin-feature-flags') || '{}') }; } catch { return featureDefaults; } }); const setFlag = (key: FeatureKey, enabled: boolean) => setFlags(current => { const next = { ...current, [key]: enabled }; window.localStorage.setItem('giatot-admin-feature-flags', JSON.stringify(next)); return next; }); return <FeatureFlagsContext.Provider value={{ flags, setFlag }}>{children}</FeatureFlagsContext.Provider>; }

function StatusBadge({ status }: { status: Status }) { return <span className={`status status-${status.toLowerCase()}`}>{status}</span>; }
function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { flags } = useContext(FeatureFlagsContext);
  const { userName, logout, permissions, requestAdmin } = useAuth();
  const [dark, setDark] = useState(() => { const systemDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches; try { const saved = window.localStorage.getItem('admin-studio-theme'); return saved ? saved === 'dark' : systemDark; } catch { return systemDark; } });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [matchingCount, setMatchingCount] = useState<number | null>(null);
  const paletteInput = useRef<HTMLInputElement>(null);
  const paletteReturnFocus = useRef<HTMLElement | null>(null);
  const mobileNavToggleRef = useRef<HTMLButtonElement>(null);
  const mobileNavCloseRef = useRef<HTMLButtonElement>(null);
  const visibleNav = [...nav.filter(item => (!item.flag || flags[item.flag as FeatureKey]) && (!item.permission || permissions.includes(item.permission))), ...(permissions.includes(studioNavItem.permission) ? [studioNavItem] : [])];
  const initials = userName.slice(0, 1).toUpperCase();
  useEffect(() => {
    if (!permissions.includes('matching.read')) { setMatchingCount(null); return; }
    let active = true;
    fetchMatchings(requestAdmin, { status: 'pending', verdict: 'all', q: '', page: 1, pageSize: 1 }).then(result => { if (active) setMatchingCount(result.counts.pending); }).catch(() => { if (active) setMatchingCount(null); });
    return () => { active = false; };
  }, [permissions, requestAdmin]);

  const changeTheme = (value: boolean) => { setDark(value); try { window.localStorage.setItem('admin-studio-theme', value ? 'dark' : 'light'); } catch { /* Session theme remains active when storage is blocked. */ } };
  useEffect(() => { if (paletteOpen) paletteInput.current?.focus(); else paletteReturnFocus.current?.focus(); }, [paletteOpen]);
  const openPalette = () => { paletteReturnFocus.current = document.activeElement as HTMLElement; setPaletteOpen(true); };

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    mobileNavCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
        mobileNavToggleRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = document.querySelectorAll<HTMLElement>(
        '#admin-navigation button:not([disabled]), #admin-navigation a[href]'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileNavOpen]);

  useEffect(() => { const shortcut = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!paletteOpen) openPalette(); else setPaletteOpen(false); } if (event.key === 'Escape') { setPaletteOpen(false); setNoticeOpen(false); } if (event.key === 'Tab' && paletteOpen) { const controls = [...(document.querySelectorAll<HTMLElement>('.studio-palette input,.studio-palette a[href]'))]; if (controls.length && event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); } else if (controls.length && !event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); } } }; window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut); }, [paletteOpen]);

  const paletteRoutes = visibleNav.filter(item => `${item.label} ${item.to}`.toLowerCase().includes(paletteQuery.toLowerCase()));

  return <div className={`admin-shell studio-shell${dark ? ' dark' : ''}${location.pathname === '/products' ? ' products-route' : ''}`} data-theme={dark ? 'dark' : 'light'}>
    <aside id="admin-navigation" className={`admin-sidebar${mobileNavOpen ? ' mobile-nav-open' : ''}`} role={mobileNavOpen ? 'dialog' : undefined} aria-modal={mobileNavOpen || undefined} aria-label={mobileNavOpen ? 'Application navigation' : undefined}>
      <div className="admin-brand">
        <span className="admin-brand-mark">G</span>
        <span>GiaTot<small>Admin console</small></span>
        <button ref={mobileNavCloseRef} className="mobile-nav-close" aria-label="Close navigation" onClick={() => { setMobileNavOpen(false); mobileNavToggleRef.current?.focus(); }}>×</button>
      </div>
      <nav aria-label="Application navigation" className="studio-nav">
        {navGroups.map(group => { const items = visibleNav.filter(item => group.routes.includes(item.to)); return items.length ? <section className="studio-nav-group" key={group.label}><h2>{group.label}</h2>{items.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => { setMobileNavOpen(false); mobileNavToggleRef.current?.focus(); }}><span>{item.icon}</span>{item.label}{item.to === '/matching' && matchingCount !== null && matchingCount > 0 && <i className="studio-nav-count">{matchingCount}</i>}</NavLink>)}</section> : null; })}
      </nav>
      <div className="sidebar-bottom">
        <button className="theme-button" onClick={() => changeTheme(!dark)} aria-label="Đổi giao diện sáng tối">{dark ? '☼' : '◐'} {dark ? 'Giao diện sáng' : 'Giao diện tối'}</button>
        <div className="admin-user"><span className="user-avatar">{initials}</span><span><strong>{userName}</strong><small>Admin</small></span><button className="logout-button" aria-label="Đăng xuất" title="Đăng xuất" onClick={() => void logout()}>↪</button></div>
      </div>
    </aside>
    {mobileNavOpen && <button className="mobile-nav-backdrop" aria-label="Dismiss navigation overlay" onClick={() => { setMobileNavOpen(false); mobileNavToggleRef.current?.focus(); }} />}
    <main className="admin-main">
      <header className="admin-header">
        <div className="mobile-brand">
          <button ref={mobileNavToggleRef} className="mobile-nav-toggle" aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'} aria-controls="admin-navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(value => !value)}>☰</button>
          <span className="admin-brand-mark">G</span> GiaTot Admin
        </div>
        <div className="admin-breadcrumb">GiaTot Admin <span>/</span> {breadcrumbLabel(location.pathname)}</div>
        <div className="admin-header-actions">
          <div className="mobile-theme-controls" role="group" aria-label="Color theme"><button type="button" aria-pressed={!dark} onClick={() => changeTheme(false)}>Light</button><button type="button" aria-pressed={dark} onClick={() => changeTheme(true)}>Dark</button></div>
          <button className="studio-command-trigger" aria-label="Mở thanh lệnh" onClick={openPalette}><span>⌕ Tìm trang...</span><kbd>{navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K'}</kbd></button>
          <button className="studio-theme-toggle" type="button" aria-label={dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} onClick={() => changeTheme(!dark)}>{dark ? '☼' : '◐'}</button>
          {permissions.includes('matching.read') && <div className="studio-notice-wrap"><button className="studio-theme-toggle studio-bell" aria-label={`Thông báo${matchingCount !== null ? `, ${matchingCount} mục Product Matching đang chờ` : ''}`} aria-expanded={noticeOpen} onClick={() => setNoticeOpen(value => !value)}>♢{matchingCount !== null && matchingCount > 0 && <i>{matchingCount}</i>}</button>{noticeOpen && <div className="studio-notice-pop" role="status">{matchingCount === null ? 'Không tải được hàng chờ. Mở Product Matching để kiểm tra.' : matchingCount ? <><b>{matchingCount} mục đang chờ ghép</b><NavLink to="/matching" onClick={() => setNoticeOpen(false)}>Mở Product Matching →</NavLink></> : 'Không có mục đang chờ.'}</div>}</div>}
          <button className="admin-profile" onClick={() => void logout()}>{initials} <span>{userName}</span> · Đăng xuất</button>
        </div>
      </header>
      <div className="admin-content"><Outlet /></div>
    </main>
    {paletteOpen && <div className="studio-palette-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPaletteOpen(false); }}><section className="studio-palette" role="dialog" aria-modal="true" aria-label="Thanh lệnh"><input ref={paletteInput} value={paletteQuery} onChange={event => setPaletteQuery(event.target.value)} placeholder="Tìm trang được phép truy cập..." onKeyDown={event => { if (event.key === 'Enter' && paletteRoutes[0]) { navigate(paletteRoutes[0].to); setPaletteOpen(false); } }} />{paletteRoutes.length ? <ul>{paletteRoutes.map(item => <li key={item.to}><NavLink to={item.to} onClick={() => { setPaletteOpen(false); setPaletteQuery(''); }}><span>{item.icon}</span>{item.label}<kbd>↵</kbd></NavLink></li>)}</ul> : <p>Không tìm thấy trang phù hợp.</p>}</section></div>}
  </div>;
}
function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) { return <div className="page-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>; }
function Kpi({ label, value, change, tone }: { label: string; value: string; change: string; tone: string }) { return <article className="kpi-card"><div className={`kpi-icon ${tone}`}>{tone === 'orange' ? '▦' : tone === 'green' ? '↗' : tone === 'blue' ? '⌂' : '◷'}</div><span>{label}</span><strong>{value}</strong><small className={change.startsWith('+') ? 'positive' : change.startsWith('-') ? 'negative' : ''}>{change}</small></article>; }
function DashboardRoute() { const { requestAdmin, permissions } = useAuth(); return <Dashboard requestAdmin={requestAdmin} permissions={permissions} />; }
function Toolbar({ placeholder = 'Tìm kiếm...' }: { placeholder?: string }) { return <div className="toolbar"><label className="toolbar-search">⌕<input placeholder={placeholder} /></label><select><option>All status</option><option>Active</option><option>Stale</option><option>Outlier</option></select><button className="outline-button">☷ Filters</button><button className="outline-button">⇩ Export</button></div>; }
function OfferTable({ rows = offers, compact = false }: { rows?: typeof offers; compact?: boolean }) { return <div className="offer-table-wrap"><table><thead><tr><th>Product / shop</th><th>Price</th><th>Availability</th><th>Status</th><th>Updated</th>{!compact && <th>Source</th>}</tr></thead><tbody>{rows.map(offer => <tr key={offer.id}><td><strong>{offer.product}</strong><small>{offer.shop}</small></td><td><strong className="money">{money(offer.finalPrice)}</strong><small><del>{money(offer.price)}</del></small></td><td><span className="availability">● {offer.availability}</span></td><td><StatusBadge status={offer.status} /></td><td>{offer.updated}</td>{!compact && <td><code>{offer.source}</code></td>}</tr>)}</tbody></table></div>; }
function MatchingRoute() { const { requestAdmin, permissions } = useAuth(); return <MatchingPage requestAdmin={requestAdmin} permissions={permissions} />; }
function ProductsRoute() { const { requestAdmin, permissions } = useAuth(); return permissions.includes('products.read') ? <ProductsPage requestAdmin={requestAdmin} permissions={permissions} /> : <Navigate to="/forbidden" replace />; }
function OffersRoute() { const { requestAdmin, permissions } = useAuth(); return permissions.includes('offers.read') ? <OffersPage requestAdmin={requestAdmin} permissions={permissions} /> : <Navigate to="/forbidden" replace />; }
function ShopsPage() { const { requestAdmin, permissions } = useAuth(); return permissions.includes('shops.read') ? <PartnerShops requestAdmin={requestAdmin} permissions={permissions} /> : <Navigate to="/" replace />; }
function CategoriesRoute() { const { requestAdmin, permissions } = useAuth(); return permissions.includes('categories.read') ? <CategoriesPage requestAdmin={requestAdmin} permissions={permissions} /> : <Navigate to="/forbidden" replace />; }
function UsersRoute() { const { requestAdmin, permissions } = useAuth(); return <UsersPage requestAdmin={requestAdmin} canManage={permissions.includes('users.manage')} />; }
function SyncJobsRoute() { const { requestAdmin, permissions } = useAuth(); return permissions.includes('sync_jobs.read') ? <SyncJobsPage requestAdmin={requestAdmin} permissions={permissions} /> : <Navigate to="/forbidden" replace />; }
function ProductDetailPage() { const product = products[0]; return <><PageHeader eyebrow="PRODUCT DETAIL" title={product.name} description={`${product.id} · ${product.brand} · ${product.category}`} action={<><button className="outline-button">Archive</button><button className="primary-button">Save changes</button></>} /><div className="detail-admin-grid"><section className="panel editor-panel"><div className="form-grid"><label>Product name<input defaultValue={product.name} /></label><label>Brand<select defaultValue={product.brand}><option>Apple</option><option>Samsung</option><option>Lenovo</option></select></label><label>Category<select defaultValue={product.category}><option>Điện thoại</option><option>Laptop</option><option>Âm thanh</option></select></label><label>Status<select defaultValue={product.status}><option>Active</option><option>Draft</option><option>Archived</option></select></label></div><label className="full-field">Description<textarea defaultValue="Product chuẩn được gom từ nhiều partner shop và dùng làm entity so sánh giá." /></label><div className="editor-section"><div className="panel-heading"><div><h2>Specifications</h2><p>Thông số dùng cho matching và compare.</p></div><button className="outline-button small">+ Add field</button></div><table className="spec-editor"><tbody>{[['Màn hình', '6.1 inch Super Retina XDR'], ['Chip', 'Apple A16 Bionic'], ['RAM', '6GB'], ['Bộ nhớ', '128GB']].map(row => <tr key={row[0]}><td className="spec-label">{row[0]}</td><td><input defaultValue={row[1]} /></td><td><button className="row-menu">×</button></td></tr>)}</tbody></table></div></section><aside className="panel detail-side"><h2>Product health</h2><div className="detail-score"><strong>92</strong><span>/ 100</span></div><div className="health-list"><span><i className="dot green"></i>Matching quality <b>Good</b></span><span><i className="dot green"></i>Offer coverage <b>8 shops</b></span><span><i className="dot orange"></i>Price freshness <b>Review</b></span></div><h3>Audit activity</h3><div className="timeline"><span><b>Updated product specs</b><small>Trần Minh Quân · 12 phút trước</small></span><span><b>Approved product match</b><small>Nguyễn An · Hôm qua</small></span></div></aside></div><section className="panel detail-offers"><div className="panel-heading"><div><h2>Offers ({product.offers})</h2><p>Offer đang gắn với Product này.</p></div><NavLink to="/offers">Manage offers →</NavLink></div><OfferTable rows={offers.slice(0, 3)} compact /></section></>; }
function PriceHistoryPage() { return <><PageHeader eyebrow="CATALOG & PRICING" title="Price History" description="Theo dõi biến động giá và phát hiện bất thường." action={<button className="outline-button">Export report</button>} /><Toolbar placeholder="Search product..." /><section className="panel"><div className="panel-heading price-history-head"><div><h2>iPhone 15 128GB</h2><p>Lowest price trend · 6 tháng gần nhất</p></div><strong className="money">₫18.490.000</strong></div><div className="large-history"><svg viewBox="0 0 800 230" preserveAspectRatio="none"><path d="M0 170 C80 150 100 180 160 125 S260 160 320 95 S400 140 480 70 S560 110 650 52 S730 80 800 35" /></svg></div></section><section className="panel table-panel history-table"><table><thead><tr><th>Date</th><th>Shop</th><th>Price</th><th>Change</th><th>Event</th></tr></thead><tbody>{[['16/10/2026','Tiki','₫18.490.000','-₫500.000','Voucher'],['12/10/2026','Shopee Mall','₫18.990.000','+₫300.000','Price update'],['05/10/2026','CellphoneS','₫18.690.000','-₫200.000','Promotion']].map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={index} className={index === 3 ? 'money' : ''}>{cell}</td>)}</tr>)}</tbody></table></section></>; }
function PriceAlertsPage() { return <><PageHeader eyebrow="CUSTOMER" title="Price Alerts" description="Theo dõi các alert và trạng thái thông báo đến người dùng." /><section className="kpi-grid three"><Kpi label="Active alerts" value="8,420" change="+8.6%" tone="orange" /><Kpi label="Triggered today" value="186" change="+24 alerts" tone="green" /><Kpi label="Delivery rate" value="99.1%" change="Email & push" tone="blue" /></section><section className="panel table-panel"><table><thead><tr><th>Product</th><th>Target price</th><th>Current price</th><th>Subscribers</th><th>Last notified</th><th>Status</th></tr></thead><tbody>{products.slice(0, 5).map((product, index) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.brand}</small></td><td className="money">{money(product.minPrice - (index + 1) * 300000)}</td><td className="money">{money(product.minPrice)}</td><td>{124 - index * 17}</td><td>{index ? `${index + 1} giờ trước` : 'Hôm nay, 09:20'}</td><td><StatusBadge status={index === 2 ? 'Pending' : 'Active'} /></td></tr>)}</tbody></table></section></>; }
function ContentPage({ kind }: { kind: 'blog' | 'seo' }) { const blog = kind === 'blog'; return <><PageHeader eyebrow="CONTENT" title={blog ? 'Blog CMS' : 'SEO Management'} description={blog ? 'Quản lý bài viết, review và nội dung hướng dẫn mua sắm.' : 'Metadata, canonical và index status cho các route public.'} action={<button className="primary-button">+ {blog ? 'New article' : 'Add rule'}</button>} /><Toolbar placeholder={blog ? 'Search article title...' : 'Search route or keyword...'} /><section className="panel table-panel"><table><thead><tr>{(blog ? ['Article','Author','Status','Updated','SEO score',''] : ['Route','Title','Index','Canonical','Last checked','']).map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{(blog ? [['Top 10 laptop tốt nhất cho sinh viên','Trần Minh Quân','Published','Hôm nay','92/100'],['So sánh iPhone 15 và iPhone 14','Nguyễn An','Review','Hôm qua','88/100'],['Kinh nghiệm mua tai nghe không dây','Trần Minh Quân','Draft','3 ngày trước','—']] : [['/product/iphone-15-128gb','iPhone 15 128GB - Giá tốt nhất','Indexed','Self canonical','Hôm nay'],['/category/laptop','Laptop giá tốt','Indexed','Self canonical','Hôm nay'],['/blog','Blog - Kinh nghiệm mua sắm','Noindex','Missing','Hôm qua']]).map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cellIndex === 2 && !blog ? <StatusBadge status={cell === 'Indexed' ? 'Success' : 'Pending'} /> : cell}</td>)}<td><button className="outline-button small">Edit</button></td></tr>)}</tbody></table></section></>; }
function SettingsPage() { return <><PageHeader eyebrow="SYSTEM" title="Settings" description="Cấu hình hiển thị, dữ liệu và hành vi hệ thống." action={<button className="primary-button">Save settings</button>} /><div className="settings-grid"><section className="panel settings-card"><h2>General</h2><label>Product display currency<select defaultValue="VND"><option>VND — Vietnamese đồng</option><option>USD — US dollar</option></select></label><label>Default timezone<select defaultValue="Asia/Ho_Chi_Minh"><option>Asia/Ho_Chi_Minh</option><option>UTC</option></select></label><label>Stale offer threshold<select defaultValue="24"><option value="12">12 hours</option><option value="24">24 hours</option><option value="48">48 hours</option></select></label></section><section className="panel settings-card"><h2>Data quality</h2><label className="toggle-row"><span><b>Outlier detection</b><small>Flag offer có giá lệch khỏi median.</small></span><input type="checkbox" defaultChecked /></label><label className="toggle-row"><span><b>Auto matching suggestions</b><small>Tạo đề xuất match tự động.</small></span><input type="checkbox" defaultChecked /></label><label className="toggle-row"><span><b>Notify failed sync</b><small>Gửi cảnh báo cho Super Admin.</small></span><input type="checkbox" defaultChecked /></label></section></div></>; }
function SimplePage({ title, description }: { title: string; description: string }) { return <><PageHeader eyebrow="SYSTEM" title={title} description={description} /><div className="empty-state panel">Module mock đã sẵn sàng cho bước nối API.</div></>; }
function LoginRoute() { const { status } = useAuth(); const location = useLocation(); if (status === 'logging-out') return <AuthLoadingScreen message="Đang đăng xuất" />; const returnTo = safeReturnPath(new URLSearchParams(location.search).get('returnTo')); return status === 'authenticated' ? <Navigate to={returnTo} replace /> : <LoginPage returnTo={returnTo} />; }
function ProtectedLayout() { const { status, permissionState } = useAuth(); const location = useLocation(); if (status === 'loading') return <AuthLoadingScreen />; if (status === 'logging-out') return <AuthLoadingScreen message="Đang đăng xuất" />; if (status === 'authenticated' && permissionState === 'loading') return <AuthLoadingScreen message="Đang tải quyền truy cập" />; if (status === 'authenticated' && permissionState === 'error') return <PermissionFailure />; if (status !== 'authenticated') { const returnTo = `${location.pathname}${location.search}${location.hash}`; return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />; } return <Outlet />; }
function BannedItemsAdminRoute() { const { permissions, requestAdmin } = useAuth(); return <BannedItemsRoute permissions={permissions} requestAdmin={requestAdmin} />; }
function AuditLogsAdminRoute() { const { requestAdmin } = useAuth(); return <AuditLogsApiPage requestAdmin={requestAdmin} />; }
function FilesRoute() { const { requestAdmin, permissions } = useAuth(); return permissions.includes('files.read') ? <FilesPage requestAdmin={requestAdmin} permissions={permissions} /> : <Navigate to="/forbidden" replace />; }
function BlogRoute() { const { requestAdmin, permissions, userName } = useAuth(); return permissions.includes('articles.read') ? <AdminCompareShopBlog requestAdmin={requestAdmin} permissions={permissions} authorName={userName} /> : <Navigate to="/forbidden" replace />; }
export function App() { return <AuthProvider><FeatureFlagsProvider><Routes><Route path="login" element={<LoginRoute />} /><Route path="auth/callback" element={<CallbackPage />} /><Route path="forbidden" element={<ForbiddenPage />} /><Route element={<ProtectedLayout />}><Route element={<Shell />}><Route index element={<DashboardRoute />} /><Route path="products" element={<ProductsRoute />} /><Route path="products/:id" element={<ProductDetailPage />} /><Route path="offers" element={<OffersRoute />} /><Route path="matching" element={<MatchingRoute />} /><Route path="shops" element={<ShopsPage />} /><Route path="data-sources" element={<DataSourcesPage />} /><Route path="sync-jobs" element={<SyncJobsRoute />} /><Route path="affiliate-links" element={<SimplePage title="Affiliate Links" description="Tracking, redirect status và affiliate performance." />} /><Route path="price-history" element={<PriceHistoryPage />} /><Route path="price-alerts" element={<PriceAlertsPage />} /><Route path="categories" element={<CategoriesRoute />} /><Route path="files" element={<FilesRoute />} /><Route path="banned-items" element={<BannedItemsAdminRoute />} /><Route path="banned-items/new" element={<BannedItemsAdminRoute />} /><Route path="blog" element={<BlogRoute />} /><Route path="analytics" element={<AnalyticsPage />} /><Route path="seo" element={<ContentPage kind="seo" />} /><Route path="users" element={<UsersRoute />} /><Route path="audit-logs" element={<AuditLogsAdminRoute />} /><Route path="feature-flags" element={<FeatureFlagsPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="studio-components" element={<StudioReferencePage />} /><Route path="*" element={<Navigate to="/" replace />} /></Route></Route></Routes></FeatureFlagsProvider></AuthProvider>; }
function FeatureFlagsPage() { const { flags, setFlag } = useContext(FeatureFlagsContext); return <><PageHeader eyebrow="SYSTEM" title="Feature Flags" description="Bật hoặc tắt module admin theo nhu cầu vận hành." action={<button className="outline-button" onClick={() => Object.keys(featureDefaults).forEach(key => setFlag(key as FeatureKey, true))}>Enable all</button>} /><section className="panel feature-flags-panel"><div className="feature-flags-intro"><strong>{Object.values(flags).filter(Boolean).length}/{Object.keys(flags).length} features enabled</strong><span>Thay đổi được lưu ở trình duyệt hiện tại.</span></div><div className="feature-flag-list">{(Object.keys(featureDefaults) as FeatureKey[]).map(key => <label className="feature-flag-row" key={key}><span className="feature-flag-icon">{flags[key] ? '✓' : '—'}</span><span><b>{flagLabels[key].label}</b><small>{flagLabels[key].description}</small></span><input type="checkbox" checked={flags[key]} onChange={event => setFlag(key, event.target.checked)} /></label>)}</div></section></>; }
