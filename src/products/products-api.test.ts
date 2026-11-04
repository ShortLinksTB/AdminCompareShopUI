import { describe, expect, it, vi } from 'vitest';
import { deleteAdminProduct, getAdminCategories, getAdminProducts, ProductsApiError, updateAdminProduct, type AdminProduct } from './products-api';

const product: AdminProduct = {
  id: 42, slug: 'phone-a', name: 'Phone A', brand: 'Brand A', description: null,
  seoTitle: null, seoDescription: null, categoryId: 7, isActive: true, imageUrl: null,
};

describe('getAdminProducts', () => {
  it('requests the selected one-based page and returns the typed page envelope', async () => {
    const page = { items: [product], pageNumber: 2, pageSize: 20, totalItems: 21 };
    const requestAdmin = vi.fn().mockResolvedValue(Response.json(page));

    await expect(getAdminProducts(requestAdmin, 2, 20)).resolves.toEqual(page);
    expect(requestAdmin).toHaveBeenCalledWith('/admin/products?page=2&pageSize=20', { signal: undefined });
  });

  it.each([[true, 'true'], [false, 'false']] as const)('sends server-side active filter %s', async (active, query) => {
    const requestAdmin = vi.fn().mockResolvedValue(Response.json({ items: [], pageNumber: 1, pageSize: 10, totalItems: 0 }));
    await getAdminProducts(requestAdmin, 1, 10, undefined, active);
    expect(requestAdmin).toHaveBeenCalledWith(`/admin/products?page=1&pageSize=10&isActive=${query}`, { signal: undefined });
  });

  it.each([401, 403, 500])('surfaces failed status %i without returning data', async status => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response('', { status }));

    await expect(getAdminProducts(requestAdmin, 1, 20)).rejects.toMatchObject({
      name: 'ProductsApiError', status,
    } satisfies Partial<ProductsApiError>);
  });
});

describe('product mutations and categories', () => {
  it('loads category labels from the existing category API', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(Response.json({ items: [{ id: 7, name: 'Phones', slug: 'phones', isActive: true }] }));
    await expect(getAdminCategories(requestAdmin)).resolves.toEqual([{ id: 7, name: 'Phones', slug: 'phones', isActive: true }]);
    expect(requestAdmin).toHaveBeenCalledWith('/admin/categories?page=1&pageSize=100', { signal: undefined });
  });

  it('sends full replacement PUT data, including nullable ImageUrl', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const input = { slug: 'phone-a', name: 'Phone A', brand: null, description: null, seoTitle: null, seoDescription: null, categoryId: 7, isActive: true, imageUrl: null };
    await updateAdminProduct(requestAdmin, 42, input);
    expect(requestAdmin).toHaveBeenCalledWith('/admin/products/42', expect.objectContaining({ method: 'PUT', body: JSON.stringify(input) }));
  });

  it('deletes by product id and reports API failures', async () => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteAdminProduct(requestAdmin, 42)).resolves.toBeUndefined();
    expect(requestAdmin).toHaveBeenCalledWith('/admin/products/42', { method: 'DELETE' });
    requestAdmin.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(deleteAdminProduct(requestAdmin, 42)).rejects.toMatchObject({ status: 403 });
  });
});
