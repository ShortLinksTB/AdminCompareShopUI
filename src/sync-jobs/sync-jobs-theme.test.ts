import { afterEach, describe, expect, it } from 'vitest';
// The browser-only app does not install Node type declarations; Vitest provides this built-in module.
// @ts-expect-error Node's built-in fs module is available to Vitest at runtime.
import { readFileSync } from 'node:fs';

const baseStyles = readFileSync('src/styles.css', 'utf8');
const syncJobsStyles = readFileSync('src/sync-jobs/sync-jobs.css', 'utf8');

afterEach(() => {
  document.head.querySelectorAll('[data-sync-jobs-theme-test]').forEach(style => style.remove());
  document.body.querySelectorAll('[data-sync-jobs-theme-test]').forEach(shell => shell.remove());
});

describe('Sync Jobs table header themes', () => {
  it('meets normal-text contrast in light theme and preserves readable dark headers', () => {
    for (const css of [baseStyles, syncJobsStyles]) {
      const style = document.createElement('style');
      style.dataset.syncJobsThemeTest = '';
      style.textContent = css;
      document.head.append(style);
    }

    const lightShell = createShell('light');
    const darkShell = createShell('dark');
    document.body.append(lightShell, darkShell);

    const lightHeader = getComputedStyle(lightShell.querySelector('th')!).color;
    const darkHeader = getComputedStyle(darkShell.querySelector('th')!).color;
    expect(lightHeader).toBe('rgb(88, 103, 115)');
    expect(contrastRatio(lightHeader, 'rgb(255, 255, 255)')).toBeGreaterThanOrEqual(4.5);
    expect(darkHeader).toBe('rgb(158, 175, 185)');
    expect(contrastRatio(darkHeader, 'rgb(23, 35, 45)')).toBeGreaterThanOrEqual(4.5);
  });
});

function createShell(theme: 'light' | 'dark') {
  const shell = document.createElement('div');
  shell.dataset.syncJobsThemeTest = '';
  shell.dataset.theme = theme;
  shell.className = `admin-shell${theme === 'dark' ? ' dark' : ''}`;
  shell.innerHTML = '<main class="admin-content"><div class="sync-jobs-page"><section class="panel sync-jobs-panel"><div class="sync-jobs-table-wrap"><table><thead><tr><th>Job</th></tr></thead></table></div></section></div></main>';
  return shell;
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (color: string) => {
    const channels = color.match(/\d+/g)!.slice(0, 3).map(Number).map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
