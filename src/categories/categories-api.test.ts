import { describe, expect, it, vi } from 'vitest';
import type { AdminRequest } from '../bannedItemsApi';
import { CategoriesApiError, commitCategoryImport, createCategory, deleteCategory, dryRunCategoryImport, exportCategories, getCategories, updateCategory, type AdminCategory } from './categories-api';

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

  it('downloads the shared export endpoint using its content-disposition filename', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(new Response('{"schemaVersion":1}', { status: 200, headers: { 'Content-Disposition': 'attachment; filename="categories-2026-11-16.json"' } }));
    const exported = await exportCategories(request);
    expect(request).toHaveBeenCalledWith('/admin/categories/export');
    expect(exported.filename).toBe('categories-2026-11-16.json');
    expect(exported.blob.size).toBe(19);
  });

  it('sends dry-run as multipart and renders validation details from a 422 preview', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(new Response(JSON.stringify({ errors: ['Slug không hợp lệ'], blockers: [], summary: { create: 0, update: 0, delete: 0 }, changes: [] }), { status: 422 }));
    const file = new File(['{}'], 'categories.json', { type: 'application/json' });
    await expect(dryRunCategoryImport(request, file)).resolves.toMatchObject({ valid: false, blocked: false, errors: ['Slug không hợp lệ'] });
    const [path, options] = request.mock.calls[0];
    expect(path).toBe('/admin/categories/import/dry-run');
    expect(options?.method).toBe('POST');
    expect(options?.body).toBeInstanceOf(FormData);
    expect((options?.body as FormData).get('file')).toBe(file);
  });

  it('commits only multipart file plus exact confirmation and returns applied changes', async () => {
    const result = { summary: { create: 0, update: 1, delete: 0 }, changes: [{ action: 'update', slug: 'audio' }] };
    const request = vi.fn<AdminRequest>().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    const file = new File(['{}'], 'categories.json');
    await expect(commitCategoryImport(request, file, 'GHI ĐÈ')).resolves.toEqual(result);
    const [path, options] = request.mock.calls[0];
    expect(path).toBe('/admin/categories/import/commit');
    expect(options?.method).toBe('POST');
    expect((options?.body as FormData).get('file')).toBe(file);
    expect((options?.body as FormData).get('confirmation')).toBe('GHI ĐÈ');
  });

  it('preserves product-use conflict blockers for the UI', async () => {
    const blockers = [{ slug: 'audio', name: 'Audio', productCount: 3 }];
    const request = vi.fn<AdminRequest>().mockResolvedValue(new Response(JSON.stringify({ code: 'category_in_use', blockers }), { status: 409 }));
    await expect(commitCategoryImport(request, new File(['{}'], 'categories.json'), 'GHI ĐÈ')).rejects.toMatchObject<Partial<CategoriesApiError>>({ status: 409, blockers });
  });

  it('surfaces export and oversized upload failures with actionable status context', async () => {
    const exportRequest = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(exportCategories(exportRequest)).rejects.toThrow('Request failed (403)');
    const uploadRequest = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 413 }));
    await expect(dryRunCategoryImport(uploadRequest, new File(['{}'], 'categories.json'))).rejects.toThrow('File vượt quá giới hạn 1 MB.');
  });
});
