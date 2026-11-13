import { describe, expect, it } from 'vitest';
// @ts-expect-error Node's built-in fs module is available to Vitest at runtime.
import { readFileSync } from 'node:fs';

const styles = readFileSync('src/ui/studio-ui.css', 'utf8');
const themes = readFileSync('src/styles.css', 'utf8');

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

describe('Blog status badge theme contrast', () => {
  it('uses the shared Studio theme tokens for status badges', () => {
    expect(styles).toContain('.blog-status.published{background:var(--studio-ok-soft);color:var(--studio-ok)}');
    expect(styles).toContain('.blog-status.draft{background:var(--studio-warn-soft);color:var(--studio-warn)}');
  });

  it('keeps both Studio theme status foregrounds above WCAG text contrast', () => {
    expect(themes).toContain('--studio-ok:#5ee3a1;--studio-ok-soft:#5ee3a122');
    expect(themes).toContain('--studio-warn:#ffc857;--studio-warn-soft:#ffc85722');
    expect(themes).toContain('--studio-ok:#0e6538;--studio-ok-soft:#14804a1a');
    expect(themes).toContain('--studio-warn:#946200;--studio-warn-soft:#e8a30026');
    expect(contrast('#5ee3a1', '#101b26')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffc857', '#101b26')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#0e6538', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#946200', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});
