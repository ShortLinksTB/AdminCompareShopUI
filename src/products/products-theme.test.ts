import { describe, expect, it } from 'vitest';
// The test runner is Node-based, but this browser-only app does not install Node type declarations.
// @ts-expect-error Node's built-in fs module is available to Vitest at runtime.
import { readFileSync } from 'node:fs';

const styles = readFileSync('src/styles.css', 'utf8').replace(/\s+/g, ' ');
const productStyles = readFileSync('src/products/products.css', 'utf8').replace(/\s+/g, ' ');
const studioStyles = readFileSync('src/ui/studio-ui.css', 'utf8').replace(/\s+/g, ' ');

function luminance(hex: string) {
  const channels = hex.match(/[0-9a-f]{2}/gi)!.map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(foreground: string, background: string) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('Products Studio theme styles', () => {
  it('uses the shared light and dark token pairs for selected category options', () => {
    expect(productStyles).toContain('.product-category-options button.selected{background:var(--studio-brand-soft);color:var(--studio-brand-text)}');
    expect(styles).toContain('--studio-bg:#080e15');
    expect(styles).toContain('--studio-brand-text:#ff8a4d');
    expect(styles).toContain('.studio-shell[data-theme="light"]{--studio-bg:#f3f6fa');
    expect(styles).toContain('--studio-brand-text:#c24100');
    expect(contrast('#ff8a4d', '#080e15')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#c24100', '#f3f6fa')).toBeGreaterThanOrEqual(4.5);
  });

  it('uses the shared Studio primitives for table, toolbar, filters, states, and dialogs', () => {
    expect(studioStyles).toContain('.studio-card{');
    expect(studioStyles).toContain('.studio-filter-chips{');
    expect(studioStyles).toContain('.studio-toolbar{');
    expect(studioStyles).toContain('.studio-table{');
    expect(studioStyles).toContain('.studio-table-footer{');
    expect(studioStyles).toContain('.studio-modal,.studio-drawer{');
    expect(studioStyles).toContain('.studio-lightbox{');
  });

  it('keeps Products table overflow inside its card on narrow screens', () => {
    expect(productStyles).toContain('.products-table-scroll .studio-table{min-width:820px}');
    expect(studioStyles).toContain('.studio-table-scroll{width:100%;overflow-x:auto}');
    expect(productStyles).toContain('@media(max-width:680px)');
    expect(productStyles).toContain('.product-form-row{grid-template-columns:1fr}');
  });
});
