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
  parentCategoryId?: number | null;
}

export class CategoriesApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'CategoriesApiError';
  }
}

const categoriesPath = '/admin/categories';

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
