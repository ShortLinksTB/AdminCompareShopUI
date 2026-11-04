import { describe, expect, it, vi } from 'vitest';
import { createCategory, deleteCategory, getCategories, CategoriesApiError, updateCategory } from './categories-api';
import type { AdminRequest } from '../bannedItemsApi';

const category = { id: 3, slug: 'phones', name: 'Phones', isActive: true };

describe('categories API adapter', () => {
  it('requests the documented paginated endpoint', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ items: [category], pageNumber: 2, pageSize: 10, totalItems: 11 }));
    await expect(getCategories(request, 2, 10)).resolves.toMatchObject({ items: [category], pageNumber: 2, totalItems: 11 });
    expect(request).toHaveBeenCalledWith('/admin/categories?page=2&pageSize=10', { signal: undefined });
  });

  it('sends contract fields for create/update and accepts 204 delete', async () => {
    const request = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(Response.json(category, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ ...category, isActive: false }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const input = { slug: 'phones', name: 'Phones', isActive: false };
    await expect(createCategory(request, input)).resolves.toEqual(category);
    await expect(updateCategory(request, 3, input)).resolves.toMatchObject({ isActive: false });
    await expect(deleteCategory(request, 3)).resolves.toBeUndefined();
    expect(request.mock.calls.map(([path, init]) => [path, init?.method])).toEqual([
      ['/admin/categories', 'POST'], ['/admin/categories/3', 'PUT'], ['/admin/categories/3', 'DELETE'],
    ]);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual(input);
  });

  it('surfaces API validation details and provides status fallbacks', async () => {
    const validation = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ errors: { Slug: ['Slug is required.'] } }, { status: 400 }));
    await expect(createCategory(validation, { slug: '', name: 'Phones', isActive: true }))
      .rejects.toMatchObject<Partial<CategoriesApiError>>({ status: 400, message: 'Slug is required.' });
    const forbidden = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(deleteCategory(forbidden, 3)).rejects.toThrow('You do not have permission');
  });
});
