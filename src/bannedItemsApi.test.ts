import { describe, expect, it, vi } from 'vitest';
import { BanApiError, createBannedItem, getBannedItems, getProductTargets, revokeBannedItem, type AdminRequest } from './bannedItemsApi';

describe('banned items REST client', () => {
  it('requests an active paged list and includes target/search filters when selected', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ items: [], pageNumber: 2, pageSize: 20, totalItems: 0 }));
    const result = await getBannedItems(requestAdmin, { active: false, targetType: 'Brand', search: ' Example ', page: 2, pageSize: 20 });
    const [path] = requestAdmin.mock.calls[0];
    const params = new URL(path, 'http://localhost').searchParams;
    expect(params.get('active')).toBe('false');
    expect(params.get('targetType')).toBe('Brand');
    expect(params.get('search')).toBe('Example');
    expect(params.get('page')).toBe('2');
    expect(params.get('pageSize')).toBe('20');
    expect(result.pageNumber).toBe(2);
  });

  it('omits the type and search filters when all types and an empty search are selected', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ items: [], pageNumber: 1, pageSize: 20, totalItems: 0 }));
    await getBannedItems(requestAdmin, { active: true, targetType: 'all', search: '  ', page: 1, pageSize: 20 });
    const params = new URL(requestAdmin.mock.calls[0][0], 'http://localhost').searchParams;
    expect(params.has('targetType')).toBe(false);
    expect(params.has('search')).toBe(false);
    expect(params.get('active')).toBe('true');
  });

  it('loads all catalog pages for searchable targets', async () => {
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(Response.json({ items: [{ id: 1, name: 'One', isActive: true }], pageNumber: 1, pageSize: 1, totalItems: 2 }))
      .mockResolvedValueOnce(Response.json({ items: [{ id: 2, name: 'Two', isActive: true }], pageNumber: 2, pageSize: 1, totalItems: 2 }));
    await expect(getProductTargets(requestAdmin)).resolves.toEqual([{ id: 1, name: 'One', isActive: true }, { id: 2, name: 'Two', isActive: true }]);
    expect(requestAdmin).toHaveBeenCalledTimes(2);
    expect(requestAdmin.mock.calls.map(([path]) => new URL(path, 'http://localhost').searchParams.get('page'))).toEqual(['1', '2']);
  });

  it('does not fetch a second page when the first page covers every item', async () => {
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(Response.json({ items: [{ id: 1, name: 'One', isActive: true }], pageNumber: 1, pageSize: 100, totalItems: 1 }));
    await expect(getProductTargets(requestAdmin)).resolves.toEqual([{ id: 1, name: 'One', isActive: true }]);
    expect(requestAdmin).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic message for an unmapped status with no JSON body', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(new Response('not json', { status: 500 }));
    await expect(revokeBannedItem(requestAdmin, 'ban-1')).rejects.toMatchObject<Partial<BanApiError>>({ status: 500, message: 'Request failed (500). Please try again.' });
  });

  it('maps 401 and 403 to a permission message', async () => {
    const forbidden = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(revokeBannedItem(forbidden, 'ban-1')).rejects.toMatchObject<Partial<BanApiError>>({ status: 403, message: 'You do not have permission to manage banned items.' });
    const unauthorized = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 401 }));
    await expect(revokeBannedItem(unauthorized, 'ban-1')).rejects.toMatchObject<Partial<BanApiError>>({ status: 401, message: 'You do not have permission to manage banned items.' });
  });

  it('posts the brand payload through the authenticated admin request', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 201 }));
    await createBannedItem(requestAdmin, { targetType: 'Brand', brandName: 'Example Brand', reason: 'Policy violation' });
    const [path, init] = requestAdmin.mock.calls[0];
    expect(path).toBe('/admin/compliance/bans');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ targetType: 'Brand', brandName: 'Example Brand', reason: 'Policy violation' });
  });

  it('posts the product payload through the authenticated admin request', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 201 }));
    await createBannedItem(requestAdmin, { targetType: 'Product', productId: 42, reason: 'Policy' });
    const [, init] = requestAdmin.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ targetType: 'Product', productId: 42, reason: 'Policy' });
  });

  it('deletes an encoded ban ID and accepts a 204 response', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 204 }));
    await revokeBannedItem(requestAdmin, 'ban/42');
    expect(requestAdmin.mock.calls[0][0]).toContain('/admin/compliance/bans/ban%2F42');
    expect(requestAdmin.mock.calls[0][1]?.method).toBe('DELETE');
  });

  it.each([
    [400, 'Invalid target combination'],
    [404, 'Product was not found'],
    [409, 'Active ban already exists'],
  ])('preserves the API error detail for HTTP %i', async (status, message) => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } }));
    await expect(revokeBannedItem(requestAdmin, 'ban-1')).rejects.toMatchObject<Partial<BanApiError>>({ status, message });
  });
});
