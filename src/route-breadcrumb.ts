const routeLabels: Record<string, string> = {
  '/': 'Dashboard',
  '/products': 'Products',
  '/offers': 'Offers & Prices',
  '/matching': 'Product Matching',
  '/shops': 'Partner Shops',
  '/data-sources': 'Data Sources',
  '/sync-jobs': 'Sync Jobs',
  '/affiliate-links': 'Affiliate Links',
  '/price-history': 'Price History',
  '/price-alerts': 'Price Alerts',
  '/categories': 'Categories',
  '/files': 'Files',
  '/banned-items': 'Banned items',
  '/banned-items/new': 'Banned items / Add item',
  '/blog': 'Blog CMS',
  '/analytics': 'Analytics',
  '/seo': 'SEO Management',
  '/users': 'Users & Roles',
  '/audit-logs': 'Audit Logs',
  '/feature-flags': 'Feature Flags',
  '/settings': 'Settings',
  '/studio-components': 'Studio components',
};

export function getRouteBreadcrumb(pathname: string) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (routeLabels[path]) return routeLabels[path];
  if (/^\/products\/[^/]+$/.test(path)) return 'Products / Product details';
  return 'Page unavailable';
}
