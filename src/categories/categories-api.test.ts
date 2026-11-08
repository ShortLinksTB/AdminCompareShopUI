import { describe, expect, it, vi } from 'vitest';
import type { AdminRequest } from '../bannedItemsApi';
import { createCategory, deleteCategory, getCategories, updateCategory, type AdminCategory } from './categories-api';

const category: AdminCategory = { id: 7, slug: 'audio', name: 'Audio', isActive: false };

describe('categories API adapter', () => {
  it('reads a paginated response with the requested page', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(new Response(JSON.stringify({ items: [category], pageNumber: 2, pageSize: 10, totalItems: 11 }), { status: 200 }));
    await expect(getCategories(request, 2, 10)).resolves.toEqual({ items: [category], pageNumber: 2, pageSize: 10, totalItems: 11 });
    expect(request).toHaveBeenCalledWith('/admin/categories?page=2&pageSize=10', { signal: undefined });
  });

  it('posts and puts only the category contract fields', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation(async () => new Response(JSON.stringify(category), { status: 201 }));
    const input = { slug: 'audio', name: 'Audio', isActive: false, parentCategoryId: 42 };
    await createCategory(request, input);
    await updateCategory(request, 7, input);
    expect(request).toHaveBeenNthCalledWith(1, '/admin/categories', expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }));
    expect(request).toHaveBeenNthCalledWith(2, '/admin/categories/7', expect.objectContaining({ method: 'PUT', body: JSON.stringify(input) }));
  });

  it('deletes by ID and accepts an empty 204 response', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteCategory(request, 7)).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith('/admin/categories/7', { method: 'DELETE' });
  });

  it.each([
    [400, 'Slug and name are required'],
    [404, 'could not be found'],
    [403, 'do not have permission'],
    [500, 'Request failed (500)'],
  ])('surfaces a useful fallback for HTTP %i', async (status, message) => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status }));
    await expect(getCategories(request, 1, 20)).rejects.toThrow(message);
  });

  it('prefers the API validation message when provided', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(new Response(JSON.stringify({ message: 'Slug already exists.' }), { status: 400 }));
    await expect(createCategory(request, { slug: 'audio', name: 'Audio', isActive: true, parentCategoryId: null })).rejects.toThrow('Slug already exists.');
  });
});
