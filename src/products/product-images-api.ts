import type { AdminRequest } from './products-api';

export interface ProductImage {
  id?: string;
  fileId?: string | null;
  externalUrl?: string | null;
  sourceUrl?: string | null;
  originalUrl?: string | null;
  url?: string | null;
  altText: string;
  sortOrder: number;
  card600FileId?: string | null;
  detail1000FileId?: string | null;
  url600?: string | null;
  url1000?: string | null;
  card600Url?: string | null;
  detail1000Url?: string | null;
  card600Status?: string | null;
  detail1000Status?: string | null;
  derivative600Status?: string | null;
  derivative1000Status?: string | null;
  sourceAvailable?: boolean;
  derivativeStatus?: string | null;
  width?: number | null;
  height?: number | null;
  originalFileName?: string | null;
}

export interface ProductImagesResponse { items?: ProductImage[]; images?: ProductImage[]; productName?: string; productSlug?: string; }
export interface ProductImageInput { id?: string; fileId?: string; externalUrl?: string; altText: string; sortOrder: number; }

function errorMessage(response: Response, action: string) {
  if (response.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  return `Không thể ${action} (lỗi ${response.status}).`;
}

export async function getProductImages(request: AdminRequest, productId: string, signal?: AbortSignal): Promise<ProductImagesResponse> {
  const response = await request(`/admin/products/${encodeURIComponent(productId)}/images`, { signal });
  if (!response.ok) throw new Error(errorMessage(response, 'tải thư viện ảnh'));
  return response.json() as Promise<ProductImagesResponse>;
}

export async function saveProductImages(request: AdminRequest, productId: string, images: ProductImageInput[]): Promise<void> {
  const response = await request(`/admin/products/${encodeURIComponent(productId)}/images`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(images),
  });
  if (!response.ok) throw new Error(errorMessage(response, 'lưu thư viện ảnh'));
}

export async function retryProductImageDerivatives(request: AdminRequest, productId: string, imageId: string): Promise<ProductImage> {
  const response = await request(`/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}/derivatives`, { method: 'POST' });
  if (!response.ok) throw new Error(errorMessage(response, 'tạo lại bản ảnh'));
  return response.json() as Promise<ProductImage>;
}
