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

  it('applies theme surface colors immediately on the Products route', () => {
    expect(normalizedStyles).toContain('.admin-shell.products-route,.admin-shell.products-route .admin-header,.admin-shell.products-route .products-page .panel,.admin-shell.products-route .products-page .toolbar-search,.admin-shell.products-route .products-page .toolbar select,.admin-shell.products-route .products-page .table-footer button,.admin-shell.products-route .products-page input[type="checkbox"],.admin-shell.products-route .products-page input[type="checkbox"]::before{transition:none}');
    expect(normalizedStyles).toContain('.admin-shell.products-route .products-page input[type="checkbox"]::before{transition:none}');
  });

  it('renders coordinated dark surfaces and readable text on the Products route', () => {
    const style = document.createElement('style');
    style.textContent = styles;
    document.head.append(style);
    const shell = document.createElement('div');
    shell.className = 'admin-shell products-route dark';
    shell.dataset.theme = 'dark';
    shell.innerHTML = '<header class="admin-header"><div class="admin-breadcrumb">Products</div></header><main class="admin-content"><div class="products-page"><div class="page-header"><h1>Products</h1><p>Helper text</p></div><label class="toolbar-search"><input placeholder="Search"></label><select><option>All status</option></select><section class="panel table-panel"><table><thead><tr><th><input type="checkbox" aria-label="Select all visible products"></th><th>Product</th></tr></thead><tbody><tr><td><input type="checkbox" aria-label="Select product" checked><strong>Product name</strong><small>Helper label</small><span class="status status-active">Active</span></td></tr></tbody></table><div class="table-footer"><span>Showing products</span><span class="products-page-number">Page 1</span></div></section></div></main>';
    document.body.append(shell);

    expect(getComputedStyle(shell.querySelector('.toolbar-search')!).backgroundColor).toBe('rgb(19, 30, 39)');
    expect(getComputedStyle(shell).transition).toBe('none');
    expect(getComputedStyle(shell.querySelector('.toolbar-search')!).transition).toBe('none');
    expect(getComputedStyle(shell.querySelector('.table-panel')!).transition).toBe('none');
    expect(getComputedStyle(shell.querySelector('.table-panel')!).backgroundColor).toBe('rgb(19, 30, 39)');
    expect(getComputedStyle(shell.querySelector('.table-panel td')!).color).toBe('rgb(224, 231, 235)');
    expect(getComputedStyle(shell.querySelector('.table-panel td strong')!).color).toBe('rgb(244, 247, 249)');
    expect(getComputedStyle(shell.querySelector('.table-panel th')!).color).toBe('rgb(208, 217, 222)');
    expect(getComputedStyle(shell.querySelector('.admin-breadcrumb')!).color).toBe('rgb(208, 217, 222)');
    const checkboxes = shell.querySelectorAll<HTMLInputElement>('.products-page input[type="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    checkboxes.forEach(checkbox => expect(getComputedStyle(checkbox).transition).toBe('none'));
    expect(getComputedStyle(checkboxes[0]!).backgroundColor).toBe('rgb(19, 30, 39)');
    expect(getComputedStyle(checkboxes[1]!).backgroundColor).toBe('rgb(255, 122, 56)');
    expect(getComputedStyle(shell.querySelector('.status-active')!).color).toBe('rgb(142, 224, 165)');

    shell.dataset.theme = 'light';
    shell.classList.remove('dark');
    expect(getComputedStyle(shell.querySelector('.toolbar-search')!).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(shell.querySelector('.table-panel')!).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(shell.querySelector('.table-panel td')!).color).toBe('rgb(53, 66, 76)');
    expect(getComputedStyle(shell.querySelector('.table-panel td strong')!).color).toBe('rgb(23, 32, 42)');
    expect(getComputedStyle(shell.querySelector('.admin-breadcrumb')!).color).toBe('rgb(88, 103, 115)');

    const otherRouteShell = document.createElement('div');
    otherRouteShell.className = 'admin-shell dark';
    otherRouteShell.dataset.theme = 'dark';
    otherRouteShell.innerHTML = '<header class="admin-header"><div class="admin-breadcrumb">Dashboard <span>/</span></div></header>';
    document.body.append(otherRouteShell);
    expect(getComputedStyle(otherRouteShell.querySelector('.admin-header')!).backgroundColor).toBe('rgb(23, 35, 45)');
    expect(getComputedStyle(otherRouteShell.querySelector('.admin-breadcrumb')!).color).toBe('rgb(201, 213, 220)');
    expect(getComputedStyle(otherRouteShell.querySelector('.admin-breadcrumb span')!).color).toBe('rgb(193, 203, 210)');

    otherRouteShell.remove();
    shell.remove();
    style.remove();
  });
});
