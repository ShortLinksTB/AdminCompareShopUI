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
}

export interface AdminFilePage {
  items: AdminFile[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
}

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

export async function getAdminFiles(request: AdminRequest, page: number, pageSize: number, q: string, type: string, signal?: AbortSignal): Promise<AdminFilePage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (q.trim()) params.set('q', q.trim());
  if (type !== 'all') params.set('type', type);
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

export function publicFileUrl(id: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL || 'https://api-compareshop-dev.giamha.online').replace(/\/$/, '');
  return `${base}/files/${encodeURIComponent(id)}`;
}
