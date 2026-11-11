import { describe, expect, it } from 'vitest';
import { getRouteBreadcrumb } from './route-breadcrumb';

describe('active route breadcrumb', () => {
  it('uses the current route label, including the Studio reference route', () => {
    expect(getRouteBreadcrumb('/')).toBe('Dashboard');
    expect(getRouteBreadcrumb('/studio-components')).toBe('Studio components');
    expect(getRouteBreadcrumb('/products')).toBe('Products');
    expect(getRouteBreadcrumb('/offers')).toBe('Offers & Prices');
  });

  it('keeps nested routes specific and normalizes trailing slashes', () => {
    expect(getRouteBreadcrumb('/products/example-id')).toBe('Products / Product details');
    expect(getRouteBreadcrumb('/banned-items/new/')).toBe('Banned items / Add item');
    expect(getRouteBreadcrumb('/unknown')).toBe('Page unavailable');
  });
});
