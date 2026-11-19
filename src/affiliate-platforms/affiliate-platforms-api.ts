import type { AdminRequest } from '../bannedItemsApi';

export interface AffiliatePlatform {
  id: number;
  name: string;
  homeUrl: string | null;
  notes: string | null;
}

export interface AffiliatePlatformInput {
  name: string;
  homeUrl: string | null;
  notes: string | null;
}

export interface ImportRowError { rowIndex: number; message: string }
export interface ImportPreview { created: number; updated: number; errors: ImportRowError[] }
export interface ImportResult { created: number; updated: number; failed: number; errors: ImportRowError[] }

export class AffiliatePlatformsApiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = 'AffiliatePlatformsApiError'; }
}

async function request<T>(admin: AdminRequest, path: string, init?: RequestInit): Promise<T> {
  const response = await admin(`/admin/affiliate-platforms${path}`, init);
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json() as { detail?: unknown; message?: unknown; title?: unknown; errors?: Record<string, unknown> };
      const value = body.detail ?? body.message;
      if (typeof value === 'string') message = value;
      else if (body.errors) message = Object.values(body.errors).flatMap(item => Array.isArray(item) ? item : [item]).filter((item): item is string => typeof item === 'string').join(' ') || (typeof body.title === 'string' ? body.title : message);
      else if (typeof body.title === 'string') message = body.title;
    } catch { /* Keep the HTTP status message when the response has no JSON body. */ }
    throw new AffiliatePlatformsApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const json = (value: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

export const getAffiliatePlatforms = (admin: AdminRequest, signal?: AbortSignal) => request<AffiliatePlatform[]>(admin, '', { signal });
export const createAffiliatePlatform = (admin: AdminRequest, input: AffiliatePlatformInput) => request<AffiliatePlatform>(admin, '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
export const updateAffiliatePlatform = (admin: AdminRequest, id: number, input: AffiliatePlatformInput) => request<AffiliatePlatform>(admin, `/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
export const deleteAffiliatePlatform = (admin: AdminRequest, id: number) => request<void>(admin, `/${id}`, { method: 'DELETE' });
export async function bulkDeleteAffiliatePlatforms(admin: AdminRequest, ids: number[]): Promise<Array<{ id: number; deleted: boolean; error?: string }>> {
  const outcomes = await request<Array<{ id: number; status: string }>>(admin, '/bulk-delete', json({ ids }));
  return outcomes.map(outcome => ({ id: outcome.id, deleted: outcome.status === 'deleted', error: outcome.status === 'deleted' ? undefined : outcome.status }));
}
interface ImportApiResponse { createCount?: number; updateCount?: number; createdCount?: number; updatedCount?: number; failedCount?: number; errors?: Array<{ index: number; errors: string[] }> }
function normalizeImport(response: ImportApiResponse, committed: boolean): ImportPreview | ImportResult {
  const errors = (response.errors ?? []).map(error => ({ rowIndex: error.index, message: error.errors.join(' ') }));
  const created = response.createdCount ?? response.createCount ?? 0;
  const updated = response.updatedCount ?? response.updateCount ?? 0;
  return committed ? { created, updated, failed: response.failedCount ?? errors.length, errors } : { created, updated, errors };
}
export async function previewAffiliatePlatformImport(admin: AdminRequest, rows: AffiliatePlatformInput[]): Promise<ImportPreview> {
  return normalizeImport(await request<ImportApiResponse>(admin, '/import/preview', json(rows)), false) as ImportPreview;
}
export async function commitAffiliatePlatformImport(admin: AdminRequest, rows: AffiliatePlatformInput[]): Promise<ImportResult> {
  return normalizeImport(await request<ImportApiResponse>(admin, '/import/commit', json(rows)), true) as ImportResult;
}
