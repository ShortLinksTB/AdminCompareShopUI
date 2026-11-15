import { describe, expect, it, vi } from 'vitest';
import { getProductImages, retryProductImageDerivatives, saveProductImages } from './product-images-api';
import type { AdminRequest } from './products-api';

describe('product images API', () => {
  it('loads image rows from the product images route and forwards cancellation', async () => {
    const controller = new AbortController();
    const payload = { productName: 'Phone', images: [{ fileId: 'file-1', altText: 'Front', sortOrder: 0 }] };
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json(payload));
    await expect(getProductImages(request, 'id/42', controller.signal)).resolves.toEqual(payload);
    expect(request).toHaveBeenCalledWith('/admin/products/id%2F42/images', { signal: controller.signal });
  });

  it.each([403, 500])('explains GET failure %i', async status => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status }));
    await expect(getProductImages(request, '42')).rejects.toThrow(status === 403 ? 'không có quyền' : 'lỗi 500');
  });

  it('replaces the complete ordered list and reports a failed save', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(new Response(null, { status: 204 }));
    const images = [{ fileId: 'file-1', altText: 'Front', sortOrder: 0 }];
    await saveProductImages(request, '42', images);
    expect(request).toHaveBeenCalledWith('/admin/products/42/images?createDerivatives=true', expect.objectContaining({ method: 'PUT', body: JSON.stringify(images) }));
    await saveProductImages(request, '42', images, false);
    expect(request).toHaveBeenCalledWith('/admin/products/42/images?createDerivatives=false', expect.objectContaining({ method: 'PUT', body: JSON.stringify(images) }));
    request.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(saveProductImages(request, '42', images)).rejects.toThrow('không có quyền');
  });

  it('retries derivatives through the product image route', async () => {
    const result = { id: 'image-id', fileId: 'source-id', sourceUrl: 'https://cdn.test/source.jpg', url600: 'https://cdn.test/small.jpg', url1000: 'https://cdn.test/source.jpg', derivative600Status: 'ready', derivative1000Status: 'failed', sourceAvailable: true, sortOrder: 0, altText: '' };
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json(result));
    await expect(retryProductImageDerivatives(request, '42', 'image-id')).resolves.toEqual(result);
    expect(request).toHaveBeenCalledWith('/admin/products/42/images/image-id/derivatives', { method: 'POST' });
  });
});
