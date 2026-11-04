import type { AdminRequest, Page } from '../bannedItemsApi';

export interface AdminCategory {
  id: number;
  slug: string;
  name: string;
  isActive: boolean;
}

export interface CategoryInput {
  slug: string;
  name: string;
  isActive: boolean;
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
    const body = await response.json() as {
      message?: string;
      title?: string;
      detail?: string;
      errors?: Record<string, string[]>;
    };
    detail = body.message ?? body.detail ?? body.title ?? '';
    if (!detail && body.errors) detail = Object.values(body.errors).flat().join(' ');
  } catch {
    // Fall back to a useful status message when the API returns no JSON body.
  }

  const fallback = response.status === 400
    ? 'Category details are invalid. Check the slug and name.'
    : response.status === 404
      ? 'This category could not be found. Refresh the list and try again.'
      : response.status === 401 || response.status === 403
        ? 'You do not have permission to manage this category.'
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
