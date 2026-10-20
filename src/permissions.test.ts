// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { currentAdminRole, hasPermission } from './permissions';

afterEach(() => window.localStorage.clear());

describe('compliance permissions', () => {
  it('uses the current shell role and defaults to its Super Admin identity', () => {
    expect(currentAdminRole()).toBe('Super Admin');
    window.localStorage.setItem('giatot-admin-role', 'Operator');
    expect(currentAdminRole()).toBe('Operator');
    window.localStorage.setItem('giatot-admin-role', 'Unknown');
    expect(currentAdminRole()).toBe('Super Admin');
  });

  it.each(['Super Admin', 'Operator'])('%s receives read and manage permissions', role => {
    expect(hasPermission(role, 'compliance.read')).toBe(true);
    expect(hasPermission(role, 'compliance.manage')).toBe(true);
  });

  it.each(['Editor', 'Viewer'])('%s receives no compliance permissions', role => {
    expect(hasPermission(role, 'compliance.read')).toBe(false);
    expect(hasPermission(role, 'compliance.manage')).toBe(false);
  });

  it('does not grant permissions to an unknown role', () => {
    expect(hasPermission('Unknown', 'compliance.read')).toBe(false);
  });
});
