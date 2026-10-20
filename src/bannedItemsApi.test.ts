// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BanApiError, createBannedItem, getBannedItems, revokeBannedItem } from './bannedItemsApi';

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('banned items REST client', () => {
  it('requests an active paged list and includes target/search filters when selected', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], pageNumber: 2, pageSize: 20, totalItems: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await getBannedItems({ active: false, targetType: 'Brand', search: ' Example ', page: 2, pageSize: 20 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const params = new URL(url, 'http://localhost').searchParams;
    expect(params.get('active')).toBe('false');
    expect(params.get('targetType')).toBe('Brand');
    expect(params.get('search')).toBe('Example');
    expect(params.get('page')).toBe('2');
    expect(params.get('pageSize')).toBe('20');
    expect(init.credentials).toBe('include');
    expect(result.pageNumber).toBe(2);
  });

  it('omits the type and search filters when all types and an empty search are selected', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], pageNumber: 1, pageSize: 20, totalItems: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await getBannedItems({ active: true, targetType: 'all', search: '  ', page: 1, pageSize: 20 });
    const params = new URL(fetchMock.mock.calls[0][0] as string, 'http://localhost').searchParams;
    expect(params.has('targetType')).toBe(false);
    expect(params.has('search')).toBe(false);
    expect(params.get('active')).toBe('true');
  });

  it('posts the brand payload with session credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await createBannedItem({ targetType: 'Brand', brandName: 'Example Brand' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({ targetType: 'Brand', brandName: 'Example Brand' });
  });

  it('posts the product payload and sends an available bearer token', async () => {
    window.localStorage.setItem('adminAccessToken', 'test-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await createBannedItem({ targetType: 'Product', productId: 'p-42', reason: 'Policy' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token');
    expect(JSON.parse(init.body as string)).toEqual({ targetType: 'Product', productId: 'p-42', reason: 'Policy' });
  });

  it('deletes an encoded ban ID and accepts a 204 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await revokeBannedItem('ban/42');
    expect(fetchMock.mock.calls[0][0]).toContain('/admin/compliance/bans/ban%2F42');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });

  it.each([
    [400, 'Invalid target combination'],
    [404, 'Product was not found'],
    [409, 'Active ban already exists'],
  ])('preserves the API error detail for HTTP %i', async (status, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } })));
    await expect(revokeBannedItem('ban-1')).rejects.toMatchObject<Partial<BanApiError>>({ status, message });
  });
});
