import { describe, expect, it, vi } from 'vitest';
import { createShop, deleteShop, getShops, ShopApiError, updateShop, type AdminRequest, type ShopInput } from './shopsApi';

const shop = { id: 7, slug: 'example', name: 'Example Shop', websiteUrl: 'https://example.com', isActive: true };
const input: ShopInput = { slug: 'example', name: 'Example Shop', websiteUrl: 'https://example.com', isActive: true };

describe('partner shops REST client', () => {
  it('requests the paged list with one-based page and page size and passes abort signal', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ items: [shop], pageNumber: 2, pageSize: 20, totalItems: 21 }));
    const controller = new AbortController();
    await expect(getShops(requestAdmin, 2, 20, controller.signal)).resolves.toMatchObject({ pageNumber: 2, totalItems: 21 });
    const [path, init] = requestAdmin.mock.calls[0];
    const params = new URL(path, 'http://localhost').searchParams;
    expect(path).toContain('/admin/shops?');
    expect(params.get('page')).toBe('2');
    expect(params.get('pageSize')).toBe('20');
    expect(init?.signal).toBe(controller.signal);
  });

  it('creates a shop with the approved payload and parses the returned item', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(Response.json(shop, { status: 201 }));
    await expect(createShop(requestAdmin, input)).resolves.toEqual(shop);
    expect(requestAdmin.mock.calls[0]).toMatchObject(['/admin/shops', { method: 'POST' }]);
    expect(JSON.parse(requestAdmin.mock.calls[0][1]?.body as string)).toEqual(input);
  });

  it('updates the selected ID with a PUT and parses the response', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(Response.json(shop));
    await expect(updateShop(requestAdmin, 7, input)).resolves.toEqual(shop);
    expect(requestAdmin.mock.calls[0][0]).toBe('/admin/shops/7');
    expect(requestAdmin.mock.calls[0][1]?.method).toBe('PUT');
  });

  it('accepts an empty 204 delete response', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteShop(requestAdmin, 7)).resolves.toBeUndefined();
    expect(requestAdmin.mock.calls[0]).toMatchObject(['/admin/shops/7', { method: 'DELETE' }]);
  });

  it('keeps problem details and falls back for empty or malformed failures', async () => {
    const detailed = vi.fn<AdminRequest>().mockResolvedValue(new Response(JSON.stringify({ title: 'Invalid shop.', detail: 'Name is required.' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    await expect(createShop(detailed, input)).rejects.toMatchObject<Partial<ShopApiError>>({ status: 400, message: 'Name is required.' });
    const validation = vi.fn<AdminRequest>().mockResolvedValue(new Response(JSON.stringify({ errors: { request: ['Invalid shop.'] } }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    await expect(createShop(validation, input)).rejects.toMatchObject<Partial<ShopApiError>>({ status: 400, message: 'Invalid shop.' });
    const empty = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(deleteShop(empty, 7)).rejects.toMatchObject<Partial<ShopApiError>>({ status: 403, message: 'Request failed (403). Please try again.' });
    const malformed = vi.fn<AdminRequest>().mockResolvedValue(new Response('not json', { status: 500 }));
    await expect(updateShop(malformed, 7, input)).rejects.toMatchObject<Partial<ShopApiError>>({ status: 500, message: 'Request failed (500). Please try again.' });
  });

  it('uses the available problem title or generic fallback when details are absent', async () => {
    const message = vi.fn<AdminRequest>().mockResolvedValue(new Response(JSON.stringify({ message: 'Duplicate slug.' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
    await expect(createShop(message, input)).rejects.toMatchObject<Partial<ShopApiError>>({ status: 500, message: 'Duplicate slug.' });
    const title = vi.fn<AdminRequest>().mockResolvedValue(new Response(JSON.stringify({ title: 'Shop is missing.' }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    await expect(deleteShop(title, 7)).rejects.toMatchObject<Partial<ShopApiError>>({ status: 404, message: 'Shop is missing.' });
    const generic = vi.fn<AdminRequest>().mockResolvedValue(new Response(JSON.stringify({}), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    await expect(deleteShop(generic, 7)).rejects.toMatchObject<Partial<ShopApiError>>({ status: 400, message: 'Request failed (400). Please try again.' });
  });
});
