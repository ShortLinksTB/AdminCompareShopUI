import { describe, expect, it, vi } from 'vitest';
import { bulkDeleteAdminFiles, createFileDerivatives, deleteAdminFile, getAdminFile, getAdminFiles, publicFileUrl, resolvePublicFileUrl, uploadAdminFiles, FilesApiError } from './files-api';
import type { AdminRequest } from '../products/products-api';

describe('Files API', () => {
  it('requests filtered pages and returns the page envelope', async () => {
    const page = { items: [], pageNumber: 2, pageSize: 20, totalItems: 23 };
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json(page));
    await expect(getAdminFiles(request, 2, 20, '  banner  ', 'image')).resolves.toEqual(page);
    expect(request).toHaveBeenCalledWith('/admin/files?page=2&pageSize=20&q=banner&type=images', { signal: undefined });
  });

  it('preserves the supported other file type filter', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ items: [], pageNumber: 1, pageSize: 10, totalItems: 0 }));
    await getAdminFiles(request, 1, 10, '', 'other');
    expect(request).toHaveBeenCalledWith('/admin/files?page=1&pageSize=10&type=other', { signal: undefined });
  });

  it('omits empty search and all type filters, and passes cancellation', async () => {
    const controller = new AbortController();
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ items: [], pageNumber: 1, pageSize: 10, totalItems: 0 }));
    await getAdminFiles(request, 1, 10, '  ', 'all', controller.signal);
    expect(request).toHaveBeenCalledWith('/admin/files?page=1&pageSize=10', { signal: controller.signal });
  });

  it.each([403, 500])('reports list failure %i', async status => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(new Response('', { status }));
    await expect(getAdminFiles(request, 1, 10, '', 'all')).rejects.toMatchObject({ status, name: 'FilesApiError' });
  });

  it('loads encoded detail ids and distinguishes forbidden reads', async () => {
    const file = { id: 'file/id', originalFileName: 'banner.png' };
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json(file));
    await expect(getAdminFile(request, file.id)).resolves.toEqual(file);
    expect(request).toHaveBeenCalledWith('/admin/files/file%2Fid', { signal: undefined });
    request.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(getAdminFile(request, file.id)).rejects.toThrow('You do not have permission to load file details.');
  });

  it('uploads each file independently and reports a failed response without stopping the batch', async () => {
    const first = new File(['ok'], 'first.png', { type: 'image/png' });
    const second = new File(['no'], 'second.pdf', { type: 'application/pdf' });
    const request = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response('', { status: 400 }));
    const started: File[] = [];
    const result = await uploadAdminFiles(request, [first, second], file => started.push(file));
    expect(started).toEqual([first, second]);
    expect(result).toEqual([{ file: first }, { file: second, error: 'Could not upload file (request failed with status 400).' }]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][1]?.body).toBeInstanceOf(FormData);
  });

  it('captures thrown upload errors and reports forbidden upload explicitly', async () => {
    const file = new File(['content'], 'file.png', { type: 'image/png' });
    const request = vi.fn<AdminRequest>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Response('', { status: 403 }));
    const results = await uploadAdminFiles(request, [file, file], () => undefined);
    expect(results.map(item => item.error)).toEqual(['offline', 'You do not have permission to upload file.']);
  });

  it('deletes files and surfaces the API error status', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteAdminFile(request, 'id 1')).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith('/admin/files/id%201', { method: 'DELETE' });
    request.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(deleteAdminFile(request, 'id 1')).rejects.toBeInstanceOf(FilesApiError);
  });

  it('posts bulk file ids and preserves independent per-file outcomes', async () => {
    const results = [
      { fileId: 'free', status: 'deleted', usedBy: [] },
      { fileId: 'used', status: 'in_use', usedBy: [{ type: 'product', id: 'p-1', label: 'Sản phẩm #1' }] },
      { fileId: 'broken', status: 'failed', usedBy: [], reason: 'Storage unavailable' },
    ] as const;
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ results }));
    await expect(bulkDeleteAdminFiles(request, ['free', 'used', 'broken'])).resolves.toEqual(results);
    expect(request).toHaveBeenCalledWith('/admin/files/bulk-delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileIds: ['free', 'used', 'broken'] }),
    });
  });

  it('reports bulk delete permission and server failures', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValueOnce(new Response('', { status: 403 })).mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(bulkDeleteAdminFiles(request, ['id'])).rejects.toThrow('You do not have permission to delete files.');
    await expect(bulkDeleteAdminFiles(request, ['id'])).rejects.toThrow('Could not delete files (request failed with status 500).');
  });

  it('posts derivative variants and preserves independent outcomes from the API', async () => {
    const results = [{ success: true, file: { id: 'new-1' } }, { success: false, errorCode: 'encode_failed' }];
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ results }));
    await expect(createFileDerivatives(request, 'source/1', [{ width: 600, height: 600, fit: 'cover', focalX: 0.4, focalY: 0.5, background: '#ffffff', format: 'webp', quality: 90, name: 'banner-600x600' }])).resolves.toEqual(results);
    expect(request).toHaveBeenCalledWith('/admin/files/source%2F1/derivatives', expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: expect.stringContaining('banner-600x600') }));
  });

  it('accepts a direct result array and reports derivative permission errors', async () => {
    const result = [{ success: true }];
    const request = vi.fn<AdminRequest>().mockResolvedValueOnce(Response.json(result)).mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(createFileDerivatives(request, 'source', [])).resolves.toEqual(result);
    await expect(createFileDerivatives(request, 'source', [])).rejects.toThrow('You do not have permission to create image derivatives.');
  });

  it('builds the root public Files route from versioned API bases and encoded ids', () => {
    const guid = '6f9619ff-8b86-d011-b42d-00cf4fc964ff';
    expect(publicFileUrl(guid, 'https://api-compareshop-dev.giamha.online/api/v1')).toBe(`https://api-compareshop-dev.giamha.online/files/${guid}`);
    expect(publicFileUrl('id/1', 'https://api.example.com/api/v1/')).toBe('https://api.example.com/files/id%2F1');
  });

  it('resolves relative public file URLs against the API origin while preserving external URLs', () => {
    expect(resolvePublicFileUrl('/files/internal-1')).toBe('https://api-compareshop-dev.giamha.online/files/internal-1');
    expect(resolvePublicFileUrl('https://cdn.example/image.jpg')).toBe('https://cdn.example/image.jpg');
  });
});
