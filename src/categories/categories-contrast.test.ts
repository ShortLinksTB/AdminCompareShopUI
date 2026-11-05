import { describe, expect, it } from 'vitest';
// The test runner is Node-based, but this browser-only app does not install Node type declarations.
// @ts-expect-error Node's built-in fs module is available to Vitest at runtime.
import { readFileSync } from 'node:fs';

const globalStyles = readFileSync('src/styles.css', 'utf8').replace(/\s+/g, ' ');
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

describe('Categories accessible accent pairings', () => {
  it('keeps the orange accent and supplies AA foregrounds in both themes', () => {
    expect(globalStyles).toContain(':root{--accent-readable:#c24100;--on-accent:#17202a}');
    expect(globalStyles).toContain('.dark{--accent-readable:#ff7b38;--on-accent:#17202a}');
    expect(globalStyles).toContain('.eyebrow{color:var(--accent-readable)}');
    expect(globalStyles).toContain('.primary-button{color:var(--on-accent)}');
    expect(categoryStyles).toContain('.categories-button-primary{border-color:var(--categories-primary);background:var(--categories-primary);color:var(--on-accent,#17202a)}');
    expect(categoryStyles).toContain('--categories-primary:#ff5a00');

    expect(contrast('#c24100', '#f7f9fb')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ff7b38', '#101820')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#17202a', '#ff5a00')).toBeGreaterThanOrEqual(4.5);
  });
});
