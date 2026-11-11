import { describe, expect, it } from 'vitest';
// @ts-expect-error Node's built-in fs module is available to Vitest at runtime.
import { readFileSync } from 'node:fs';

const matchingStyles = readFileSync('src/matching/matching.css', 'utf8').replace(/\s+/g, ' ');

describe('Matching shared control styles', () => {
  it('uses Studio Button and Card primitives without page-level control or Pill overrides', () => {
    expect(matchingStyles).not.toMatch(/\.matching-file-grid\s+button/);
    expect(matchingStyles).not.toMatch(/\.matching-candidate-card\s*\{[^}]*border:/);
    expect(matchingStyles).not.toMatch(/\.matching-candidate-card\.selected/);
    expect(matchingStyles).not.toMatch(/\.studio-pill/);
    expect(matchingStyles).not.toMatch(/\.studio-button/);
    expect(matchingStyles).toContain('.matching-file-option{display:grid');
    expect(matchingStyles).toContain('.matching-candidate-card{overflow:hidden;padding:0}');
  });

  it('retains the responsive file picker grid', () => {
    expect(matchingStyles).toContain('.matching-file-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))');
    expect(matchingStyles).toContain('.matching-file-grid{grid-template-columns:repeat(3,minmax(0,1fr))}');
  });
});
