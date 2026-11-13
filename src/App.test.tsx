import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BrowserRouter, MemoryRouter, useLocation } from 'react-router-dom';
import { App } from './App';

const auth = vi.hoisted(() => ({
  status: 'authenticated' as 'authenticated' | 'anonymous' | 'logging-out',
  permissionState: 'ready' as 'ready' | 'loading',
  permissions: [] as string[],
  requestAdmin: vi.fn(),
  logout: vi.fn(),
  userName: 'Test Admin',
}));

vi.mock('./auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    status: auth.status, permissionState: auth.permissionState, permissions: auth.permissions,
    userName: auth.userName, logout: auth.logout, requestAdmin: auth.requestAdmin,
  }),
  AuthLoadingScreen: ({ message }: { message?: string }) => <div>{message}</div>,
  CallbackPage: () => null,
  ForbiddenPage: () => null,
  LoginPage: ({ returnTo }: { returnTo?: string }) => <div>Login page: {returnTo}</div>,
  PermissionFailure: () => null,
}));

vi.mock('./BannedItems', () => ({
  BannedItemsRoute: () => {
    const location = useLocation();
    return <div>Banned items page: {location.pathname}</div>;
  },
}));

function renderApp(initialEntry = '/') {
  return render(<MemoryRouter initialEntries={[initialEntry]}><App /></MemoryRouter>);
}

function RouteProbe() {
  const location = useLocation();
  return <output data-testid="current-route">{location.pathname}{location.search}</output>;
}

afterEach(() => {
  cleanup();
  auth.permissions = [];
  auth.status = 'authenticated';
  auth.permissionState = 'ready';
  auth.requestAdmin.mockReset();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
  window.localStorage.removeItem('admin-studio-theme');
});

describe('mobile application navigation', () => {
  it('opens a permission-filtered command palette with Ctrl+K and navigates to selected page', () => {
    auth.permissions = ['dashboard.read', 'products.read', 'matching.read'];
    renderApp('/');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const palette = screen.getByRole('dialog', { name: 'Thanh lệnh' });
    expect(within(palette).getByRole('link', { name: /Products/ })).toBeInTheDocument();
    expect(within(palette).getByRole('link', { name: /Product Matching/ })).toBeInTheDocument();
    expect(within(palette).queryByRole('link', { name: /Users & Roles/ })).not.toBeInTheDocument();
    fireEvent.click(within(palette).getByRole('link', { name: /Products/ }));
    expect(screen.getByRole('heading', { name: 'Products' })).toBeInTheDocument();
  });

  it('persists a theme choice and handles unavailable local storage', () => {
    auth.permissions = ['dashboard.read'];
    renderApp('/');
    const toggle = screen.getByRole('button', { name: /Chuyển sang giao diện/i });
    fireEvent.click(toggle);
    expect(document.querySelector('.studio-shell')).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem('admin-studio-theme')).toBe('dark');
  });

  it('keeps theme changes working when local storage reads and writes throw', () => {
    auth.permissions = ['dashboard.read'];
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage blocked'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked'); });
    const mounted = renderApp('/');
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang giao diện tối' }));
    expect(document.querySelector('.studio-shell')).toHaveAttribute('data-theme', 'dark');
    expect(setItem).toHaveBeenCalled();
    mounted.unmount();
    renderApp('/');
    // Without persistence, the selected theme lasts for this session; reload uses the system default.
    expect(document.querySelector('.studio-shell')).toHaveAttribute('data-theme', 'light');
    getItem.mockRestore(); setItem.mockRestore();
  });

  it('shows the pending matching count and notice only to users with matching permission', () => {
    auth.permissions = ['dashboard.read', 'matching.read'];
    auth.requestAdmin.mockResolvedValue(Response.json([{ id: 1 }, { id: 2 }, { id: 3 }]));
    renderApp('/');
    return screen.findByRole('link', { name: /Product Matching/ }).then(link => {
      expect(link).toHaveTextContent('3');
      fireEvent.click(screen.getByRole('button', { name: /Thông báo/ }));
      expect(screen.getByText(/3 mục đang chờ ghép/)).toBeInTheDocument();
    });
  });

  it('renders the shared component reference on its actual route for settings managers', () => {
    auth.permissions = ['settings.manage'];
    renderApp('/studio-components');
    expect(screen.getByRole('heading', { name: 'Studio components' })).toBeInTheDocument();
    expect(screen.getByText(/Component reference/)).toBeInTheDocument();
    expect(document.querySelector('.admin-breadcrumb')).toHaveTextContent('GiaTot Admin / Studio components');
  });

  it('loads Files on the existing /files route for users with files.read', async () => {
    auth.permissions = ['files.read'];
    auth.requestAdmin.mockResolvedValue(Response.json({ items: [], pageNumber: 1, pageSize: 10, totalItems: 0 }));
    renderApp('/files');

    expect(screen.getByRole('heading', { name: 'Files' })).toBeInTheDocument();
    expect(document.querySelector('.admin-breadcrumb')).toHaveTextContent('GiaTot Admin / Files');
    expect(await screen.findByText(/No files found/)).toBeInTheDocument();
    expect(auth.requestAdmin).toHaveBeenCalledWith('/admin/files?page=1&pageSize=10', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('shows the product details breadcrumb for a nested product route', () => {
    auth.permissions = ['products.read'];
    renderApp('/products/42');

    expect(document.querySelector('.admin-breadcrumb')).toHaveTextContent('GiaTot Admin / Products / Product details');
  });

  it('denies the /files route without files.read and makes no Files API request', () => {
    render(<MemoryRouter initialEntries={['/files']}><App /><RouteProbe /></MemoryRouter>);

    expect(screen.getByTestId('current-route')).toHaveTextContent('/forbidden');
    expect(screen.queryByRole('heading', { name: 'Files' })).not.toBeInTheDocument();
    expect(auth.requestAdmin).not.toHaveBeenCalled();
  });

  it('loads Audit Logs at the real /audit-logs route using the authenticated API request', async () => {
    auth.permissions = ['audit_logs.read'];
    auth.requestAdmin.mockResolvedValue(new Response(JSON.stringify({ items: [], pageNumber: 1, pageSize: 50, totalItems: 0 }), { status: 200 }));
    renderApp('/audit-logs');

    expect(screen.getByRole('heading', { name: 'Audit Logs' })).toBeInTheDocument();
    expect(await screen.findByText('No audit logs found.')).toBeInTheDocument();
    expect(auth.requestAdmin).toHaveBeenCalledWith('/admin/audit-logs?page=1&pageSize=50', expect.any(Object));
  });

  it('loads Analytics at the existing /analytics route for admins with analytics.read', () => {
    auth.permissions = ['analytics.read'];
    renderApp('/analytics');

    expect(screen.getByRole('heading', { name: 'Analytics & Revenue' })).toBeInTheDocument();
    expect(document.querySelector('.admin-breadcrumb')).toHaveTextContent('GiaTot Admin / Analytics');
    expect(auth.requestAdmin).not.toHaveBeenCalled();
  });

  it('loads the existing Offers route for admins with offers.read', async () => {
    auth.permissions = ['offers.read'];
    auth.requestAdmin.mockResolvedValue(new Response('', { status: 500 }));
    renderApp('/offers');

    expect(screen.getByRole('heading', { name: 'Offers & Prices' })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load offers');
  });

  it('loads Sync Jobs only for admins with sync_jobs.read', async () => {
    auth.permissions = ['sync_jobs.read'];
    auth.requestAdmin.mockResolvedValue(Response.json([]));
    renderApp('/sync-jobs');

    expect(screen.getByRole('heading', { name: 'Sync Jobs' })).toBeInTheDocument();
    expect(await screen.findByText('No Sync Jobs yet')).toBeInTheDocument();
    expect(auth.requestAdmin).toHaveBeenCalledWith('/admin/sync-jobs', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('loads Categories on its real route only for admins with categories.read', async () => {
    auth.permissions = ['categories.read'];
    auth.requestAdmin.mockResolvedValue(Response.json({ items: [{ id: 7, slug: 'audio', name: 'Audio', isActive: true }], pageNumber: 1, pageSize: 20, totalItems: 1 }));
    renderApp('/categories');

    expect(screen.getByRole('heading', { name: 'Categories' })).toBeInTheDocument();
    expect(await screen.findByText('Audio')).toBeInTheDocument();
    expect(auth.requestAdmin).toHaveBeenCalledWith('/admin/categories?page=1&pageSize=100', { signal: undefined });
  });

  it('does not load Categories when categories.read is absent', () => {
    renderApp('/categories');

    expect(auth.requestAdmin).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Categories' })).not.toBeInTheDocument();
  });

  it('does not request Sync Jobs when sync_jobs.read is absent', () => {
    renderApp('/sync-jobs');

    expect(auth.requestAdmin).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Sync Jobs' })).not.toBeInTheDocument();
  });

  it('restores the requested safe route when the login URL is opened with an authenticated session', () => {
    auth.permissions = ['products.read'];
    renderApp('/login?returnTo=%2Fproducts');

    expect(screen.getByRole('heading', { name: 'Products' })).toBeInTheDocument();
  });

  it('navigates an authenticated BrowserRouter login to returnTo before permissions finish loading', () => {
    auth.status = 'authenticated';
    auth.permissionState = 'loading';
    window.history.replaceState({}, '', '/login?returnTo=%2Fproducts');

    render(<BrowserRouter><App /><RouteProbe /></BrowserRouter>);

    expect(screen.getByTestId('current-route')).toHaveTextContent('/products');
    expect(screen.getByText('Đang tải quyền truy cập')).toBeInTheDocument();
  });

  it('keeps protocol-relative login return targets on the app root', () => {
    renderApp('/login?returnTo=%2F%2Fevil.example%2Fadmin');

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByText(/evil\.example/)).not.toBeInTheDocument();
  });

  it('limits the Products theme scope class to the Products route', () => {
    auth.permissions = ['products.read', 'matching.read'];
    renderApp('/products');

    const adminShell = document.querySelector('.admin-shell');
    expect(adminShell).toHaveClass('products-route');
    expect(adminShell).toHaveAttribute('data-theme', 'light');

    fireEvent.click(screen.getByRole('link', { name: /Product Matching/ }));

    expect(adminShell).not.toHaveClass('products-route');
    expect(screen.getByRole('heading', { name: 'Product Matching' })).toBeInTheDocument();
  });

  it('keeps the login page visible while the user is anonymous', () => {
    auth.status = 'anonymous';
    renderApp('/login?returnTo=%2Fproducts');

    expect(screen.getByText('Login page: /products')).toBeInTheDocument();
  });

  it('passes only the safe fallback from LoginRoute into the login action', () => {
    auth.status = 'anonymous';
    renderApp('/login?returnTo=%2F%2Fevil.example%2Fadmin');

    expect(screen.getByText('Login page: /')).toBeInTheDocument();
  });

  it('shows the logout progress screen instead of navigating to a return target', () => {
    auth.status = 'logging-out';
    renderApp('/login?returnTo=%2Fproducts');

    expect(screen.getByText('Đang đăng xuất')).toBeInTheDocument();
  });

  it('opens an accessible drawer with Banned items for compliance readers and returns focus on Escape', () => {
    auth.permissions = ['compliance.read'];
    renderApp();

    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(toggle);

    expect(screen.getByRole('dialog', { name: 'Application navigation' })).toHaveAttribute('aria-modal', 'true');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /Banned items/ })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog', { name: 'Application navigation' })).getByRole('button', { name: 'Close navigation' })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Application navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus();
  });

  it('keeps Banned items out of navigation when the user lacks compliance.read', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(screen.queryByRole('link', { name: /Banned items/ })).not.toBeInTheDocument();
  });

  it('hides every permission-gated nav item when the account has no permissions', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    for (const label of [/Products/, /Offers & Prices/, /Product Matching/, /Partner Shops/, /Users & Roles/, /Settings/]) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
  });

  it('shows only the nav items matching the account\'s granted permissions', () => {
    auth.permissions = ['products.read', 'dashboard.read'];
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(screen.getByRole('link', { name: /Products/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Offers & Prices/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Users & Roles/ })).not.toBeInTheDocument();
  });

  it('wraps keyboard focus at both ends of the open drawer', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    const close = within(screen.getByRole('dialog', { name: 'Application navigation' })).getByRole('button', { name: 'Close navigation' });
    const logout = screen.getByRole('button', { name: 'Đăng xuất' });
    close.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(logout).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(close).toHaveFocus();
  });

  it('closes from the drawer close control and restores focus to the hamburger', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const dialog = screen.getByRole('dialog', { name: 'Application navigation' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close navigation' }));

    expect(screen.queryByRole('dialog', { name: 'Application navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus();
  });

  it('closes from the backdrop', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss navigation overlay' }));

    expect(screen.queryByRole('dialog', { name: 'Application navigation' })).not.toBeInTheDocument();
  });

  it('closes the drawer after selecting a route', () => {
    auth.permissions = ['compliance.read'];
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('link', { name: /Banned items/ }));

    expect(screen.getByText('Banned items page: /banned-items')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Application navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus();
  });

  it('exposes Light and Dark controls in the mobile header and preserves both theme states', () => {
    renderApp();
    const themeControls = screen.getByRole('group', { name: 'Color theme' });
    const light = within(themeControls).getByRole('button', { name: 'Light' });
    const dark = within(themeControls).getByRole('button', { name: 'Dark' });

    expect(light).toHaveAttribute('aria-pressed', 'true');
    expect(dark).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(dark);
    expect(dark).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.admin-shell')).toHaveClass('dark');
    expect(document.querySelector('.admin-shell')).toHaveAttribute('data-theme', 'dark');
    fireEvent.click(light);
    expect(light).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.admin-shell')).not.toHaveClass('dark');
    expect(document.querySelector('.admin-shell')).toHaveAttribute('data-theme', 'light');

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(auth.logout).toHaveBeenCalledOnce();
  });
});

describe('dashboard API integration', () => {
  const productPage = (totalItems: number) => Response.json({
    items: [{ id: 7, slug: 'catalog-phone', name: 'Catalog Phone', brand: null, description: null, seoTitle: null, seoDescription: null, categoryId: 3, isActive: true }],
    pageNumber: 1, pageSize: 20, totalItems,
  });
  const offer = (id: number, isActive: boolean, isOutlier: boolean) => ({
    id, productId: 7, partnerShopId: 12, priceVnd: 320000, url: null, isActive, isOutlier, updatedAtUtc: '2026-11-03T08:00:00Z',
    productName: 'Catalog Phone', productImageUrl: null, partnerShopName: 'Shop 12', externalSku: null, imageUrl: null,
    originalPriceVnd: null, stockStatus: 'in_stock' as const, lowestPriceVnd: 320000, deltaVnd: 0, deltaPercent: 0, outlierReason: null,
  });
  const offersPage = (items: ReturnType<typeof offer>[], totalItems = items.length) => Response.json({
    items, pageNumber: 1, pageSize: 100, totalItems,
    counts: { all: totalItems, outlier: items.filter(item => item.isOutlier).length, stale: 0, outOfStock: 0, inactive: items.filter(item => !item.isActive).length },
  });

  it('uses the dedicated API sources and renders only contract-backed product and offer values', async () => {
    auth.permissions = ['products.read', 'offers.read'];
    auth.requestAdmin.mockImplementation(async path => path.startsWith('/admin/products')
      ? productPage(5)
      : offersPage([offer(101, true, true), offer(102, false, false), offer(103, true, true)]));

    renderApp('/');

    expect(await screen.findByText('All catalog products')).toBeInTheDocument();
    const productsCard = screen.getByText('Products total').closest('article')!;
    const offersCard = screen.getByText('Offers active').closest('article')!;
    expect(within(productsCard).getByText('5')).toBeInTheDocument();
    expect(within(offersCard).getByText('2')).toBeInTheDocument();
    expect(within(offersCard).getByText('of 3 offers')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Offers flagged as outlier' })).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('103')).toBeInTheDocument();
    expect(screen.queryByText('Laptop Zenbook Pro')).not.toBeInTheDocument();
    expect(auth.requestAdmin).toHaveBeenCalledWith('/admin/products?page=1&pageSize=20', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(auth.requestAdmin).toHaveBeenCalledWith('/admin/offers?page=1&pageSize=100&sort=attention&staleHours=72', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('keeps each dataset loading until its own request resolves', async () => {
    auth.permissions = ['products.read', 'offers.read'];
    let resolveProducts!: (response: Response) => void;
    let resolveOffers!: (response: Response) => void;
    auth.requestAdmin.mockImplementation(path => new Promise(resolve => {
      if (path.startsWith('/admin/products')) resolveProducts = resolve;
      else resolveOffers = resolve;
    }));

    renderApp('/');

    expect(screen.getAllByText('Loading…')).toHaveLength(2);
    expect(screen.getByText('Loading offers…')).toBeInTheDocument();
    resolveProducts(productPage(4));
    expect(await screen.findByText('All catalog products')).toBeInTheDocument();
    expect(within(screen.getByText('Products total').closest('article')!).getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Loading offers…')).toBeInTheDocument();
    resolveOffers(offersPage([offer(201, true, false)]));
    expect(await screen.findByText('of 1 offers')).toBeInTheDocument();
  });

  it('shows empty states and zero counts from successful empty API responses', async () => {
    auth.permissions = ['products.read', 'offers.read'];
    auth.requestAdmin.mockImplementation(path => path.startsWith('/admin/products')
      ? Promise.resolve(Response.json({ items: [], pageNumber: 1, pageSize: 20, totalItems: 0 }))
      : Promise.resolve(offersPage([])));

    renderApp('/');

    expect(await screen.findByText('No products found')).toBeInTheDocument();
    expect(screen.getByText('No offers found')).toBeInTheDocument();
    expect(within(screen.getByText('Products total').closest('article')!).getByText('0')).toBeInTheDocument();
    expect(within(screen.getByText('Offers active').closest('article')!).getByText('0')).toBeInTheDocument();
  });

  it('keeps authorization and request failures out of successful mock states and supports independent retries', async () => {
    auth.permissions = ['products.read', 'offers.read'];
    auth.requestAdmin.mockImplementation(async path => {
      const productRequest = path.startsWith('/admin/products');
      const calls = auth.requestAdmin.mock.calls.filter(([calledPath]) => calledPath.startsWith('/admin/products') === productRequest).length;
      if (calls === 1) return new Response('', { status: productRequest ? 403 : 500 });
      return productRequest ? productPage(2) : offersPage([offer(301, true, false)]);
    });

    renderApp('/');

    expect(await screen.findByText('You do not have permission to view products.')).toBeInTheDocument();
    expect(screen.getByText(/Could not load offers/)).toBeInTheDocument();
    expect(screen.queryByText('Laptop Zenbook Pro')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry products' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('of 1 offers')).toBeInTheDocument();
    expect(await screen.findByText('All catalog products')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows denied states without requesting datasets when their read permissions are absent', async () => {
    auth.permissions = ['dashboard.read'];
    renderApp('/');

    expect(await screen.findByText('You do not have permission to view products.')).toBeInTheDocument();
    expect(screen.getByText('You do not have permission to view offers.')).toBeInTheDocument();
    expect(auth.requestAdmin).not.toHaveBeenCalled();
  });

  it('aborts both in-flight reads on unmount and ignores late responses', async () => {
    auth.permissions = ['products.read', 'offers.read'];
    const signals: AbortSignal[] = [];
    const resolvers: Array<(response: Response) => void> = [];
    auth.requestAdmin.mockImplementation((_path, init) => {
      signals.push(init?.signal as AbortSignal);
      return new Promise(resolve => resolvers.push(resolve));
    });

    const view = renderApp('/');
    expect(signals).toHaveLength(2);
    view.unmount();
    expect(signals.every(signal => signal.aborted)).toBe(true);
    resolvers[0](productPage(8));
    resolvers[1](Response.json([offer(401, true, true)]));
    await Promise.resolve();
  });
});
