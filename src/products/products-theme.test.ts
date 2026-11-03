import { describe, expect, it } from 'vitest';
// The test runner is Node-based, but this browser-only app does not install Node type declarations.
// @ts-expect-error Node's built-in fs module is available to Vitest at runtime.
import { readFileSync } from 'node:fs';

const styles = readFileSync('src/styles.css', 'utf8');
const normalizedStyles = styles.replace(/\s+/g, ' ');

describe('Products theme styles', () => {
  it('defines dark surfaces and readable foregrounds within the Products route', () => {
    expect(normalizedStyles).toContain('.admin-shell.products-route.dark{color-scheme:dark;--bg:#0c141b;');
    expect(normalizedStyles).toContain('.admin-shell.products-route.dark .admin-main{background:#0c141b;color:#fff}');
    expect(normalizedStyles).toContain('.admin-shell.products-route.dark .admin-header{background:#131e27;color:#fff;');
    expect(normalizedStyles).toContain('.admin-shell.products-route.dark .products-page .panel,.admin-shell.products-route.dark .products-page .toolbar-search,.admin-shell.products-route.dark .products-page .toolbar select{background:#131e27;');
    expect(normalizedStyles).toContain('.admin-shell.products-route.dark .products-page .table-panel td{color:#e0e7eb;');
    expect(normalizedStyles).toContain('.admin-shell.products-route.dark .products-page .table-panel th{color:#d0d9de;');
    expect(normalizedStyles).toContain('.admin-shell.products-route.dark .admin-breadcrumb{color:#d0d9de}');
    expect(normalizedStyles).toContain('.admin-shell.products-route.dark .products-page input[type="checkbox"]:checked{background:#ff7a38;');
  });

  it('keeps the existing light Products surfaces and foregrounds', () => {
    expect(normalizedStyles).toContain('.products-page .panel,.products-page .toolbar-search,.products-page .toolbar select{background:#fff}');
    expect(normalizedStyles).toContain('.products-page .page-header h1,.products-page .table-panel td strong{color:#17202a}');
  });
});
