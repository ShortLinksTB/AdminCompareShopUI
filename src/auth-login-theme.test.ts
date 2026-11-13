// @ts-expect-error Node's built-in fs module is available to Vitest at runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/auth-login.css', 'utf8').replace(/\s+/g, ' ');

function luminance(hex: string): number {
  const channels = hex.match(/[0-9a-f]{2}/gi)!.map(channel => parseInt(channel, 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('Login focus ring theme tokens', () => {
  it('uses the approved light and dark theme colors on the keyboard focus ring', () => {
    expect(styles).toMatch(/\.auth-canvas\.studio-login\s*\{[^}]*--studio-focus:\s*#2563eb;/);
    expect(styles).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*\.auth-canvas\.studio-login\s*\{[^}]*--studio-focus:\s*#93c5fd;/);
    expect(styles).toMatch(/\.studio-login-action:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--studio-focus\);/);
  });

  it('keeps each focus ring at least 3:1 against the page background', () => {
    expect(contrastRatio('#2563eb', '#f7f9fb')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio('#93c5fd', '#101820')).toBeGreaterThanOrEqual(3);
  });
});
