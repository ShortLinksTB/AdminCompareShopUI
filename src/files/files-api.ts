import type { AdminRequest } from '../products/products-api';

export interface AdminFile {
  id: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  uploadedBy: string;
  uploadedAtUtc: string;
  derivedFrom?: { id?: string; originalFileName?: string } | null;
  derivedPreset?: string | null;
  derivativeSpec?: { width?: number; height?: number; fit?: 'cover' | 'contain'; format?: string; quality?: number } | null;
}

export type DerivativeFormat = 'keep' | 'webp' | 'jpg' | 'png';
export interface FileDerivativeVariant {
  width: number; height: number; fit: 'cover' | 'contain'; focalX?: number; focalY?: number;
  background: string; format: DerivativeFormat; quality: number; name: string;
}
export interface FileDerivativeResult { index?: number; file?: AdminFile; publicUrl?: string; error?: string; warnings?: string[]; }

export interface AdminFilePage {
  items: AdminFile[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
}

export type AdminFileTypeFilter = 'all' | 'image' | 'other';

export class FilesApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'FilesApiError';
  }
}

function apiError(response: Response, action: string): FilesApiError {
  return new FilesApiError(response.status === 403
    ? `You do not have permission to ${action}.`
    : `Could not ${action} (request failed with status ${response.status}).`, response.status);
}

export async function getAdminFiles(request: AdminRequest, page: number, pageSize: number, q: string, type: AdminFileTypeFilter, signal?: AbortSignal): Promise<AdminFilePage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (q.trim()) params.set('q', q.trim());
  if (type !== 'all') params.set('type', type === 'image' ? 'images' : type);
  const response = await request(`/admin/files?${params}`, { signal });
  if (!response.ok) throw apiError(response, 'load files');
  return response.json() as Promise<AdminFilePage>;
}

export async function getAdminFile(request: AdminRequest, id: string, signal?: AbortSignal): Promise<AdminFile> {
  const response = await request(`/admin/files/${encodeURIComponent(id)}`, { signal });
  if (!response.ok) throw apiError(response, 'load file details');
  return response.json() as Promise<AdminFile>;
}

export async function uploadAdminFiles(request: AdminRequest, files: File[], onFileStart: (file: File) => void): Promise<Array<{ file: File; error?: string }>> {
  const results: Array<{ file: File; error?: string }> = [];
  for (const file of files) {
    const body = new FormData();
    body.append('file', file);
    try {
      onFileStart(file);
      const response = await request('/admin/files', { method: 'POST', body });
      if (!response.ok) throw apiError(response, 'upload file');
      results.push({ file });
    } catch (error) {
      results.push({ file, error: error instanceof Error ? error.message : 'Upload failed.' });
    }
  }
  return results;
}

export async function deleteAdminFile(request: AdminRequest, id: string): Promise<void> {
  const response = await request(`/admin/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw apiError(response, 'delete file');
}

export async function createFileDerivatives(request: AdminRequest, id: string, variants: FileDerivativeVariant[]): Promise<FileDerivativeResult[]> {
  const response = await request(`/admin/files/${encodeURIComponent(id)}/derivatives`, {
    method: 'POST', body: JSON.stringify({ variants }), headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw apiError(response, 'create image derivatives');
  const payload = await response.json() as { results?: FileDerivativeResult[]; items?: FileDerivativeResult[] } | FileDerivativeResult[];
  return Array.isArray(payload) ? payload : payload.results ?? payload.items ?? [];
}

export function publicFileUrl(id: string, apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'https://api-compareshop-dev.giamha.online'): string {
  return new URL(`/files/${encodeURIComponent(id)}`, apiBaseUrl).toString();
}
