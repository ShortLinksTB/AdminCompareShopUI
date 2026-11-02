import { describe, expect, it, vi } from 'vitest';
import { getAdminProducts, ProductsApiError, type AdminProduct } from './products-api';

const product: AdminProduct = {
  id: 42, slug: 'phone-a', name: 'Phone A', brand: 'Brand A', description: null,
  seoTitle: null, seoDescription: null, categoryId: 7, isActive: true,
};

describe('getAdminProducts', () => {
  it('requests the selected one-based page and returns the typed page envelope', async () => {
    const page = { items: [product], pageNumber: 2, pageSize: 20, totalItems: 21 };
    const requestAdmin = vi.fn().mockResolvedValue(Response.json(page));

    await expect(getAdminProducts(requestAdmin, 2, 20)).resolves.toEqual(page);
    expect(requestAdmin).toHaveBeenCalledWith('/admin/products?page=2&pageSize=20', { signal: undefined });
  });

  it.each([401, 403, 500])('surfaces failed status %i without returning data', async status => {
    const requestAdmin = vi.fn().mockResolvedValue(new Response('', { status }));

    await expect(getAdminProducts(requestAdmin, 1, 20)).rejects.toMatchObject({
      name: 'ProductsApiError', status,
    } satisfies Partial<ProductsApiError>);
  });
});
