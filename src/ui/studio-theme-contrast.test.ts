import { describe, expect, it } from 'vitest';
// The test runner is Node-based, but this browser-only app does not install Node type declarations.
// @ts-expect-error Node's built-in fs module is available to Vitest at runtime.
import { readFileSync } from 'node:fs';

const styles = readFileSync('src/styles.css', 'utf8').replace(/\s+/g, ' ');
const sharedUiStyles = readFileSync('src/ui/studio-shell-fixes.css', 'utf8').replace(/\s+/g, ' ');
const appStyles = readFileSync('src/App.tsx', 'utf8');

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
  it('keeps group headings on the shared faint token in both themes', () => {
    expect(styles).toContain('.studio-nav-group h2{margin:14px 10px 5px;color:var(--studio-faint)');
    expect(styles).toContain('.studio-shell[data-theme="light"]');
    expect(styles).toContain('--studio-faint:#667785');
    expect(styles).toContain('--studio-faint:#7f909d');

    expect(contrast('#667785', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#7f909d', '#0b131c')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps selected navigation icons above the non-text contrast threshold in both themes', () => {
    expect(styles).toContain('.studio-shell .admin-sidebar nav a.active>span{color:var(--studio-brand)}');
    expect(styles).toContain('.studio-shell[data-theme="light"] .admin-sidebar nav a.active>span{color:var(--studio-brand-text)}');

    // The light active surface is the orange brand-soft token composited over the white sidebar.
    expect(contrast('#c24100', '#fff0e7')).toBeGreaterThanOrEqual(3);
    expect(contrast('#ff5a00', '#0b131c')).toBeGreaterThanOrEqual(3);
  });

  it('binds shared reference table text to the active theme foreground', () => {
    expect(sharedUiStyles).toContain('.studio-shell .studio-table td{color:var(--studio-text)}');
    expect(sharedUiStyles).toContain('.studio-shell .admin-content{color:var(--studio-text)}');
    expect(sharedUiStyles).toContain('.studio-shell[data-theme="dark"] .studio-reference .studio-table tbody td{color:var(--studio-text)}');
    expect(appStyles).toContain("import './ui/studio-ui.css';");
    expect(appStyles).toContain("import './ui/studio-reference.css';");
    expect(contrast('#eef3f7', '#080e15')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps product specification labels readable in the dark Studio theme', () => {
    expect(sharedUiStyles).toContain('.studio-shell[data-theme="dark"] .spec-editor td:first-child{color:var(--studio-text)}');
    expect(contrast('#eef3f7', '#101b26')).toBeGreaterThanOrEqual(4.5);
  });
});
