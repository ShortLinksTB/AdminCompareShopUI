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
    expect(styles).toContain('.admin-shell[data-theme="dark"] .blog-status.published{background:#163a22;color:#7fe3a0}');
    expect(styles).toContain('.admin-shell[data-theme="dark"] .blog-status.draft{background:#463126;color:#ffb37c}');
    expect(contrast('#7fe3a0', '#163a22')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffb37c', '#463126')).toBeGreaterThanOrEqual(4.5);
  });

  it('renders the published badge with the expected colors in both themes', () => {
    const style = document.createElement('style');
    style.textContent = styles;
    document.head.append(style);
    const shell = document.createElement('div');
    shell.className = 'admin-shell';
    shell.dataset.theme = 'dark';
    shell.innerHTML = '<section class="blog-page"><span class="blog-status published">Published</span><span class="blog-status draft">Draft</span></section>';
    document.body.append(shell);

    const published = shell.querySelector('.published')!;
    const draft = shell.querySelector('.draft')!;
    expect(getComputedStyle(published).backgroundColor).toBe('rgb(22, 58, 34)');
    expect(getComputedStyle(published).color).toBe('rgb(127, 227, 160)');
    expect(getComputedStyle(draft).backgroundColor).toBe('rgb(70, 49, 38)');
    expect(getComputedStyle(draft).color).toBe('rgb(255, 179, 124)');

    shell.dataset.theme = 'light';
    expect(getComputedStyle(published).backgroundColor).not.toBe('rgb(22, 58, 34)');
    expect(getComputedStyle(published).color).toBe('rgb(22, 101, 52)');
    expect(getComputedStyle(draft).color).toBe('rgb(146, 64, 14)');

    shell.remove();
    style.remove();
  });
});
