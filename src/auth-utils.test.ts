import { describe, expect, it } from 'vitest';
import { clearPostLogout, consumePostLogout, consumeReturnPath, markPostLogout, safeReturnPath, storeReturnPath } from './auth-utils';

describe('safeReturnPath', () => {
  it('keeps same-origin path, query, and hash', () => {
    expect(safeReturnPath('/products/42?view=offers#history', 'https://admin.example')).toBe('/products/42?view=offers#history');
  });

  it.each([undefined, null, '', 'products', 'https://evil.example', '//evil.example/path', '/\\evil.example/path'])('falls back to the root for unsafe return paths (%s)', value => {
    expect(safeReturnPath(value, 'https://admin.example')).toBe('/');
  });

  it('rejects a path that resolves outside the configured origin', () => {
    expect(safeReturnPath('/\\evil.example', 'https://admin.example')).toBe('/');
  });
});

describe('one-time post-logout marker', () => {
  it('is consumed once and then cleared', () => {
    const storage = window.sessionStorage;
    clearPostLogout(storage);
    markPostLogout(storage);
    expect(consumePostLogout(storage)).toBe(true);
    expect(consumePostLogout(storage)).toBe(false);
  });

  it('does not fail when browser storage is unavailable', () => {
    const brokenStorage = {
      setItem: () => { throw new Error('storage disabled'); },
      getItem: () => { throw new Error('storage disabled'); },
      removeItem: () => { throw new Error('storage disabled'); },
    } as unknown as Storage;
    expect(() => markPostLogout(brokenStorage)).not.toThrow();
    expect(consumePostLogout(brokenStorage)).toBe(false);
    expect(() => clearPostLogout(brokenStorage)).not.toThrow();
  });
});

describe('callback return path handoff', () => {
  it('uses the short-lived same-origin cookie if session storage is cleared during the identity-provider round trip', () => {
    window.sessionStorage.clear();
    storeReturnPath('/products?sort=price');
    window.sessionStorage.clear();

    expect(consumeReturnPath()).toBe('/products?sort=price');
    expect(document.cookie).not.toContain('compareshop-auth-return-to=');
    expect(window.localStorage.length).toBe(0);
  });

  it.each(['//evil.example/admin', 'https://evil.example/admin'])('validates cookie values before navigation: %s', value => {
    document.cookie = `compareshop-auth-return-to=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
    expect(consumeReturnPath()).toBe('/');
  });
});
