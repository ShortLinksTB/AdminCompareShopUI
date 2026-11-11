import { describe, expect, it } from 'vitest';
// The test runner is Node-based, but this browser-only app does not install Node type declarations.
// @ts-expect-error Node's built-in fs module is available to Vitest at runtime.
import { readFileSync } from 'node:fs';

const styles = `${readFileSync('src/styles.css', 'utf8')} ${readFileSync('src/ui/studio-reference.css', 'utf8')}`.replace(/\s+/g, ' ');

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

  it('keeps reference table text readable on the dark Studio background', () => {
    expect(styles).toContain('.studio-shell .studio-table td{padding:14px 16px;border-bottom:1px solid var(--studio-border);color:var(--studio-text)');
    expect(styles).toContain('--studio-text:#eef3f7');
    expect(styles).toContain('--studio-bg:#080e15');
    expect(contrast('#eef3f7', '#080e15')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps sidebar navigation icons above the non-text contrast minimum in both themes', () => {
    expect(styles).toContain('.studio-shell .admin-sidebar nav a>span{width:20px;color:var(--studio-muted)');
    expect(styles).toContain('.studio-shell[data-theme="light"] .admin-sidebar nav a.active>span{color:var(--studio-brand-text)}');
    expect(contrast('#a9b8c4', '#0b131c')).toBeGreaterThanOrEqual(3);
    expect(contrast('#53626f', '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(contrast('#c24100', '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(contrast('#ff5a00', '#0b131c')).toBeGreaterThanOrEqual(3);
  });

  it('retains local font fallback stacks when hosted fonts are unavailable', () => {
    expect(styles).toContain("--studio-display:'Space Grotesk','Inter',system-ui,sans-serif");
    expect(styles).toContain("font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif");
  });
});
