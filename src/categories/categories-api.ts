import type { AdminRequest, Page } from '../bannedItemsApi';

export interface AdminCategory {
  id: number;
  slug: string;
  name: string;
  isActive: boolean;
  parentCategoryId?: number | null;
}

export interface CategoryInput {
  slug: string;
  name: string;
  isActive: boolean;
  parentCategoryId: number | null;
}

export class CategoriesApiError extends Error {
  constructor(message: string, readonly status: number, readonly blockers: CategoryImportBlocker[] = []) {
    super(message);
    this.name = 'CategoriesApiError';
  }
}

const categoriesPath = '/admin/categories';

export interface CategoryImportSummary {
  create: number;
  update: number;
  delete: number;
}

export interface CategoryImportChange {
  action: 'create' | 'update' | 'delete' | string;
  slug: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface CategoryImportBlocker {
  slug: string;
  name: string;
  productCount: number;
}

export interface CategoryImportDryRun {
  valid: boolean;
  blocked: boolean;
  errors: string[];
  blockers: CategoryImportBlocker[];
  summary: CategoryImportSummary;
  changes: CategoryImportChange[];
}

export interface CategoryImportResult {
  summary: CategoryImportSummary;
  changes: CategoryImportChange[];
}

async function assertResponse(response: Response): Promise<void> {
  if (response.ok) return;

  let detail = '';
  try {
    const body = await response.json() as { message?: string; title?: string; detail?: string };
    detail = body.message ?? body.detail ?? body.title ?? '';
  } catch {
    // Preserve a useful status-specific message when the API has no JSON body.
  }

  const fallback = response.status === 400
    ? 'Slug and name are required. Slug must be at most 160 characters and name at most 200.'
    : response.status === 404
      ? 'This category could not be found. Refresh the list and try again.'
      : response.status === 401 || response.status === 403
        ? 'You do not have permission to manage categories.'
        : `Request failed (${response.status}). Please try again.`;
  throw new CategoriesApiError(detail || fallback, response.status);
}

async function readError(response: Response): Promise<Error> {
  try {
    const body = await response.json() as { message?: string; title?: string; detail?: string; errors?: unknown; blockers?: CategoryImportBlocker[] };
    const errors = Array.isArray(body.errors) ? body.errors.map(String).join('\n') : '';
    const fallback = response.status === 413 ? 'File vượt quá giới hạn 1 MB.' : response.status === 409 ? 'Import bị chặn vì category vẫn còn sản phẩm.' : `Request failed (${response.status}). Please try again.`;
    return new CategoriesApiError(errors || body.message || body.detail || body.title || fallback, response.status, body.blockers ?? []);
  } catch {
    return new CategoriesApiError(response.status === 413 ? 'File vượt quá giới hạn 1 MB.' : `Request failed (${response.status}). Please try again.`, response.status);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw await readError(response);
  return response.json() as Promise<T>;
}

export async function exportCategories(requestAdmin: AdminRequest): Promise<{ blob: Blob; filename: string }> {
  const response = await requestAdmin(`${categoriesPath}/export`);
  if (!response.ok) throw await readError(response);
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : plain ?? `categories-${new Date().toISOString().slice(0, 10)}.json`;
  return { blob: await response.blob(), filename };
}

function importForm(file: File, confirmation?: string): FormData {
  const form = new FormData();
  form.append('file', file);
  if (confirmation !== undefined) form.append('confirmation', confirmation);
  return form;
}

export async function dryRunCategoryImport(requestAdmin: AdminRequest, file: File): Promise<CategoryImportDryRun> {
  const response = await requestAdmin(`${categoriesPath}/import/dry-run`, { method: 'POST', body: importForm(file) });
  if (response.status === 422) {
    const body = await response.json() as Partial<CategoryImportDryRun>;
    return { valid: false, blocked: false, errors: body.errors ?? ['File không hợp lệ.'], blockers: body.blockers ?? [], summary: body.summary ?? { create: 0, update: 0, delete: 0 }, changes: body.changes ?? [] };
  }
  return readJson<CategoryImportDryRun>(response);
}

export async function commitCategoryImport(requestAdmin: AdminRequest, file: File, confirmation: string): Promise<CategoryImportResult> {
  const response = await requestAdmin(`${categoriesPath}/import/commit`, { method: 'POST', body: importForm(file, confirmation) });
  if (response.status === 409) throw await readError(response);
  return readJson<CategoryImportResult>(response);
}

export async function getCategories(requestAdmin: AdminRequest, page: number, pageSize: number, signal?: AbortSignal): Promise<Page<AdminCategory>> {
  const response = await requestAdmin(`${categoriesPath}?page=${page}&pageSize=${pageSize}`, { signal });
  await assertResponse(response);
  return response.json() as Promise<Page<AdminCategory>>;
}

export async function createCategory(requestAdmin: AdminRequest, input: CategoryInput): Promise<AdminCategory> {
  const response = await requestAdmin(categoriesPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await assertResponse(response);
  return response.json() as Promise<AdminCategory>;
}

export async function updateCategory(requestAdmin: AdminRequest, id: number, input: CategoryInput): Promise<AdminCategory> {
  const response = await requestAdmin(`${categoriesPath}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await assertResponse(response);
  return response.json() as Promise<AdminCategory>;
}

export async function deleteCategory(requestAdmin: AdminRequest, id: number): Promise<void> {
  const response = await requestAdmin(`${categoriesPath}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await assertResponse(response);
}
