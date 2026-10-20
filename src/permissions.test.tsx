// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { AdminIdentityContext, hasPermission, type AdminIdentity } from './permissions';

afterEach(() => { cleanup(); window.localStorage.clear(); });

describe('authenticated compliance permissions', () => {
  it.each(['Super Admin', 'Operator'] as const)('%s receives read and manage permissions from identity context', role => {
    const identity: AdminIdentity = { role, permissions: ['compliance.read', 'compliance.manage'] };
    expect(hasPermission(identity, 'compliance.read')).toBe(true);
    expect(hasPermission(identity, 'compliance.manage')).toBe(true);
  });

  it.each(['Editor', 'Viewer'] as const)('%s receives no compliance permissions', role => {
    const identity: AdminIdentity = { role, permissions: [] };
    expect(hasPermission(identity, 'compliance.read')).toBe(false);
    expect(hasPermission(identity, 'compliance.manage')).toBe(false);
  });

  it('denies access when the authenticated shell has not supplied an identity', () => {
    expect(hasPermission(null, 'compliance.read')).toBe(false);
    render(<MemoryRouter initialEntries={['/banned-items']}><App /></MemoryRouter>);
    expect(screen.getAllByRole('heading', { name: 'Dashboard' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Banned items')).toBeNull();
  });

  it('does not treat a localStorage role override as identity', () => {
    window.localStorage.setItem('giatot-admin-role', 'Super Admin');
    render(<AdminIdentityContext.Provider value={null}><MemoryRouter initialEntries={['/banned-items']}><App /></MemoryRouter></AdminIdentityContext.Provider>);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.queryByText('Banned items')).toBeNull();
  });
});
