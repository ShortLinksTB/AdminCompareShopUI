import { describe, expect, it } from 'vitest';
// @ts-expect-error Node's built-in fs module is available to Vitest at runtime.
import { readFileSync } from 'node:fs';

const styles = readFileSync('src/blog/blog.css', 'utf8');

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
  it('keeps the existing light theme badge colors', () => {
    expect(styles).toContain('.blog-status.published{background:var(--green-soft);color:#166534}');
    expect(styles).toContain('.blog-status.draft{background:var(--yellow-soft);color:#92400e}');
  });

  it('gives Published and Draft readable dark theme foreground/background pairs', () => {
    expect(styles).toContain('.dark .blog-status.published,.admin-shell[data-theme="dark"] .blog-status.published{background:#183b29;color:#8ee0a5}');
    expect(styles).toContain('.dark .blog-status.draft,.admin-shell[data-theme="dark"] .blog-status.draft{background:#3a2a12;color:#ffcf8a}');
    expect(contrast('#8ee0a5', '#183b29')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffcf8a', '#3a2a12')).toBeGreaterThanOrEqual(4.5);
  });

  it('renders the published badge with the expected colors in both themes', () => {
    const style = document.createElement('style');
    style.textContent = styles;
    document.head.append(style);
    const shell = document.createElement('div');
    shell.className = 'admin-shell dark';
    shell.dataset.theme = 'dark';
    shell.innerHTML = '<section class="blog-page"><span class="blog-status published">Published</span><span class="blog-status draft">Draft</span></section>';
    document.body.append(shell);

    const published = shell.querySelector('.published')!;
    const draft = shell.querySelector('.draft')!;
    expect(getComputedStyle(published).backgroundColor).toBe('rgb(24, 59, 41)');
    expect(getComputedStyle(published).color).toBe('rgb(142, 224, 165)');
    expect(getComputedStyle(draft).backgroundColor).toBe('rgb(58, 42, 18)');
    expect(getComputedStyle(draft).color).toBe('rgb(255, 207, 138)');

    shell.dataset.theme = 'light';
    shell.classList.remove('dark');
    expect(getComputedStyle(published).backgroundColor).not.toBe('rgb(24, 59, 41)');
    expect(getComputedStyle(published).color).toBe('rgb(22, 101, 52)');
    expect(getComputedStyle(draft).color).toBe('rgb(146, 64, 14)');

    shell.remove();
    style.remove();
  });
});
