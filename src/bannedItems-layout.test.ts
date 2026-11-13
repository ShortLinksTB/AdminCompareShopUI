import { describe, expect, it } from 'vitest';
// The test runner is Node-based, but this browser-only app does not install Node type declarations.
// @ts-expect-error Node's built-in fs module is available to Vitest at runtime.
import { readFileSync } from 'node:fs';

const bannedItemsStyles = readFileSync('src/bannedItems.css', 'utf8').replace(/\s+/g, ' ');

describe('Banned items mobile form layout', () => {
  it('keeps the full-screen action row out of sticky positioning so it cannot cover the reason field', () => {
    const actionsRule = bannedItemsStyles.match(/\.banned-form-page\s+\.banned-form-actions\s*\{([^}]+)\}/);
    expect(actionsRule?.[1]).toMatch(/position:\s*static/);
    expect(actionsRule?.[1]).not.toMatch(/position:\s*sticky/);
  });
});
