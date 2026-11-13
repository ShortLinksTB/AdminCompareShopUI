import { useMemo, useState } from 'react';
import { Button, Card, DataTable, EmptyState, ErrorState, Loading, PageHeader, Pill, SearchField, TableFooter, Toolbar } from '../ui';
import './seo.css';

export type SeoRoute = { route: string; title: string; index: 'Indexed' | 'Noindex'; canonical: string; checked: string };

const seoRoutes: SeoRoute[] = [
  { route: '/product/iphone-15-128gb', title: 'iPhone 15 128GB - Giá tốt nhất', index: 'Indexed', canonical: 'Self canonical', checked: 'Hôm nay' },
  { route: '/category/laptop', title: 'Laptop giá tốt', index: 'Indexed', canonical: 'Self canonical', checked: 'Hôm nay' },
  { route: '/blog', title: 'Blog - Kinh nghiệm mua sắm', index: 'Noindex', canonical: 'Missing', checked: 'Hôm qua' },
];

export function SEOPage({ routes = seoRoutes, loading = false, error = '', onRetry }: { routes?: SeoRoute[]; loading?: boolean; error?: string; onRetry?: () => void }) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return normalizedQuery
      ? routes.filter(row => `${row.route} ${row.title} ${row.canonical} ${row.index}`.toLocaleLowerCase().includes(normalizedQuery))
      : routes;
  }, [query, routes]);

  return <div className="seo-page">
    <PageHeader eyebrow="CONTENT" title="SEO Management" description="Metadata, canonical and index status cho các route public." actions={<Button tone="primary" type="button">＋ Add rule</Button>} />
    <Toolbar role="search" aria-label="Search SEO routes">
      <SearchField label="Search route or keyword" type="search" placeholder="Search route or keyword..." value={query} onChange={event => setQuery(event.target.value)} />
    </Toolbar>
    <Card aria-label="SEO rules" className="seo-rules-card">
      <DataTable role="region" tabIndex={0} aria-label="SEO rules, scroll horizontally"><thead><tr>
        <th scope="col">Route</th><th scope="col">Title</th><th scope="col">Index</th><th scope="col">Canonical</th><th scope="col">Last checked</th><th scope="col"><span className="sr-only">Actions</span></th>
      </tr></thead><tbody>
        {loading ? <tr><td colSpan={6}><Loading label="Loading SEO routes" /></td></tr> : error ? <tr><td colSpan={6}><ErrorState title={error} />{onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}</td></tr> : rows.length === 0 ? <tr><td colSpan={6}><EmptyState title="No routes match the search." /></td></tr> : rows.map(row => <tr key={row.route}>
          <td><code className="seo-route">{row.route}</code></td><td>{row.title}</td><td><Pill tone={row.index === 'Indexed' ? 'ok' : 'warn'}>{row.index === 'Indexed' ? '● ' : '◆ '}{row.index}</Pill></td><td>{row.canonical}</td><td>{row.checked}</td><td><Button size="sm" type="button">Edit</Button></td>
        </tr>)}
      </tbody></DataTable>
      <TableFooter start={rows.length ? 1 : 0} end={rows.length} total={rows.length} summary={loading ? 'Loading routes...' : error ? 'Routes could not be loaded' : `Showing ${rows.length} ${rows.length === 1 ? 'route' : 'routes'}`} />
    </Card>
    <details className="seo-state-references"><summary>Layout state references</summary><div>
      <section><b>Loading</b><span>Table skeleton rows while routes are loading.</span></section>
      <section><b>Empty</b><span>No routes match the search. Keep the search available.</span></section>
      <section className="seo-error-reference"><b>Error</b><span>Could not load SEO routes. Retry control follows the shared Button pattern.</span></section>
    </div></details>
  </div>;
}
