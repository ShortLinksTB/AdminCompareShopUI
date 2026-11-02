import { describe, expect, it, vi } from 'vitest';
import { createPartnerShop, deletePartnerShop, getPartnerShops, ShopApiError, updatePartnerShop } from './shopsApi';
import type { AdminRequest } from './bannedItemsApi';

const shop = { id: 3, slug: 'shop-three', name: 'Shop Three', websiteUrl: null, isActive: true };

describe('partner shops API', () => {
  it('requests a 1-based page with the selected page size', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ items: [shop], pageNumber: 2, pageSize: 10, totalItems: 11 }));
    await expect(getPartnerShops(request, 2, 10)).resolves.toMatchObject({ pageNumber: 2, items: [shop] });
    expect(request).toHaveBeenCalledWith('/admin/shops?page=2&pageSize=10', { signal: undefined });
  });

  it('sends create and update JSON and handles 204 delete success', async () => {
    const request = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(Response.json(shop, { status: 201 }))
      .mockResolvedValueOnce(Response.json(shop))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const input = { slug: 'shop-three', name: 'Shop Three', isActive: true };
    await expect(createPartnerShop(request, input)).resolves.toEqual(shop);
    await expect(updatePartnerShop(request, 3, input)).resolves.toEqual(shop);
    await expect(deletePartnerShop(request, 3)).resolves.toBeUndefined();
    expect(request.mock.calls.map(([path, init]) => [path, init?.method])).toEqual([
      ['/admin/shops', 'POST'], ['/admin/shops/3', 'PUT'], ['/admin/shops/3', 'DELETE'],
    ]);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual(input);
  });

  it('uses validation details and a safe fallback for non-JSON failures', async () => {
    const validation = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ title: 'Invalid shop.' }, { status: 400 }));
    await expect(getPartnerShops(validation, 1, 20)).rejects.toMatchObject<Partial<ShopApiError>>({ status: 400, message: 'Invalid shop.' });
    const serverError = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 500 }));
    await expect(deletePartnerShop(serverError, 3)).rejects.toThrow('Request failed (500)');
  });
});
