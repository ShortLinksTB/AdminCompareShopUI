import { describe, expect, it } from 'vitest';
// The test runner is Node-based, but this browser-only app does not install Node type declarations.
// @ts-expect-error Node's built-in fs module is available to Vitest at runtime.
import { readFileSync } from 'node:fs';

const bannedItemsStyles = readFileSync('src/bannedItems.css', 'utf8').replace(/\s+/g, ' ');

describe('Banned items mobile form layout', () => {
  it('keeps the full-screen action bar in document flow so it cannot cover the reason field', () => {
    expect(bannedItemsStyles).toContain('.banned-form-page .banned-form-actions{margin:18px 0 0;padding:16px 0 calc(12px + env(safe-area-inset-bottom));background:transparent;box-shadow:none}');
    expect(bannedItemsStyles).not.toContain('.banned-form-page .banned-form-actions{position:sticky');
  });
});
