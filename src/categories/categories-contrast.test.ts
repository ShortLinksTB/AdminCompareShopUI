import { describe, expect, it } from 'vitest';
// The test runner is Node-based, but this browser-only app does not install Node type declarations.
// @ts-expect-error Node's built-in fs module is available to Vitest at runtime.
import { readFileSync } from 'node:fs';

const globalStyles = readFileSync('src/styles.css', 'utf8').replace(/\s+/g, ' ');
const studioStyles = readFileSync('src/ui/studio-ui.css', 'utf8').replace(/\s+/g, ' ');
const categoryStyles = readFileSync('src/categories/categories.css', 'utf8').replace(/\s+/g, ' ');

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

describe('Categories Studio accessible accent pairings', () => {
  it('caps shared Studio modals at the shell reference width and keeps them viewport-safe', () => {
    expect(studioStyles).toContain('.studio-overlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px');
    expect(studioStyles).toContain('.studio-modal,.studio-drawer{width:min(520px,100%);max-height:calc(100vh - 32px);overflow:auto');
  });

  it('uses shared Studio accent pairings that meet AA in both themes', () => {
    expect(studioStyles).toContain('.studio-button-primary{border-color:transparent;background:linear-gradient(135deg,#ff7a2e,#ff5a00);color:var(--studio-on-brand)}');
    expect(globalStyles).toContain('--studio-brand:#ff5a00');
    expect(globalStyles).toContain('--studio-on-brand:#17202a');
    expect(globalStyles).toContain('--studio-brand-text:#ff8a4d');
    expect(globalStyles).toContain('--studio-brand-text:#c24100');
    expect(categoryStyles).not.toContain('.categories-button-primary');
    expect(categoryStyles).not.toContain('.category-level-pill');

    expect(contrast('#c24100', '#f3f6fa')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ff8a4d', '#080e15')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#17202a', '#ff5a00')).toBeGreaterThanOrEqual(4.5);
  });
});
