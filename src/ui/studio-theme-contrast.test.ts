import { describe, expect, it } from 'vitest';
// The test runner is Node-based, but this browser-only app does not install Node type declarations.
// @ts-expect-error Node's built-in fs module is available to Vitest at runtime.
import { readFileSync } from 'node:fs';

const styles = readFileSync('src/styles.css', 'utf8').replace(/\s+/g, ' ');
const sharedUiStyles = readFileSync('src/ui/studio-shell-fixes.css', 'utf8').replace(/\s+/g, ' ');
const componentStyles = readFileSync('src/ui/studio-ui.css', 'utf8').replace(/\s+/g, ' ');
const productsStyles = readFileSync('src/products/products.css', 'utf8').replace(/\s+/g, ' ');
const appSource = readFileSync('src/App.tsx', 'utf8');

function luminance(hex: string) {
  const [red, green, blue] = hex.match(/[0-9a-f]{2}/gi)!.map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function contrast(foreground: string, background: string) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('Studio navigation group label contrast', () => {
  it('hides the closed Studio drawer through the 960px breakpoint and preserves its open state', () => {
    expect(styles).toContain('@media(max-width:960px){.studio-shell .admin-sidebar{transform:translateX(-105%);visibility:hidden;transition:transform .22s ease,visibility .22s ease}.studio-shell .admin-sidebar.mobile-nav-open{transform:translateX(0);visibility:visible;transition:transform .22s ease,visibility 0s}}');
    expect(styles).toContain('@media(max-width:760px)');
  });

  it('keeps the fallback avatar glyph readable against its rendered background in both themes', () => {
    expect(styles).toContain('.studio-shell .user-avatar{color:#17202a}');
    expect(contrast('#17202a', '#f5a27d')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps unchecked shared checkbox boundaries at least 3:1 in both themes', () => {
    expect(componentStyles).toContain('.studio-shell{--studio-control-border:#718096}.studio-shell[data-theme="light"]{--studio-control-border:#7a8794}.studio-checkbox{border-color:var(--studio-control-border)}');

    expect(contrast('#718096', '#101b26')).toBeGreaterThanOrEqual(3);
    expect(contrast('#7a8794', '#ffffff')).toBeGreaterThanOrEqual(3);
  });

  it('keeps group headings on the shared faint token in both themes', () => {
    expect(styles).toContain('.studio-nav-group h2{margin:14px 10px 5px;color:var(--studio-faint)');
    expect(styles).toContain('.studio-shell[data-theme="light"]');
    expect(styles).toContain('--studio-faint:#667785');
    expect(styles).toContain('--studio-faint:#7f909d');

    expect(contrast('#667785', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#7f909d', '#0b131c')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps selected navigation icons at least 3:1 in both themes', () => {
    expect(styles).toContain('.studio-shell .admin-sidebar nav a.active>span{color:var(--studio-brand)}');
    expect(styles).toContain('.studio-shell[data-theme="light"] .admin-sidebar nav a.active>span{color:var(--studio-brand-text)}');
    expect(styles).toContain('--studio-brand-text:#c24100');

    expect(contrast('#c24100', '#ffefe6')).toBeGreaterThanOrEqual(3);
    expect(contrast('#ff5a00', '#3a302d')).toBeGreaterThanOrEqual(3);
  });

  it('binds shared reference table text to the active theme foreground', () => {
    expect(sharedUiStyles).toContain('.studio-shell .studio-table tbody td{color:var(--studio-text)}');
    expect(sharedUiStyles).toContain('.studio-shell .admin-content{color:var(--studio-text)}');
    expect(appSource).toContain("import './ui/studio-shell-fixes.css'");
    expect(contrast('#eef3f7', '#080e15')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps Product specification labels readable in the dark theme', () => {
    expect(productsStyles).toContain('.studio-shell .spec-editor td.spec-label{color:var(--studio-text)}');
    expect(contrast('#eef3f7', '#101b26')).toBeGreaterThanOrEqual(4.5);
  });
});
