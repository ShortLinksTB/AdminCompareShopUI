export type AdminRequest = (path: string, init?: RequestInit, options?: { redirectOnForbidden?: boolean }) => Promise<Response>;

export interface AdminUser {
  id: number;
  createdAtUtc: string;
  roles: string[];
}

export interface AdminUserPage {
  items: AdminUser[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
}

export const seededRoles = [
  { id: 1, name: 'Super Admin' },
  { id: 2, name: 'Operator' },
  { id: 3, name: 'Editor' },
  { id: 4, name: 'Viewer' },
  { id: 5, name: 'Customer' },
] as const;

export class UsersApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'UsersApiError';
  }
}

export async function getAdminUsers(requestAdmin: AdminRequest, page: number, pageSize: number, signal?: AbortSignal): Promise<AdminUserPage> {
  const response = await requestAdmin(`/admin/users?page=${page}&pageSize=${pageSize}`, { signal }, { redirectOnForbidden: false });
  if (!response.ok) {
    const message = response.status === 403
      ? 'Không tải được danh sách user (403 — thiếu quyền users.manage).'
      : `Không tải được danh sách user (request failed with status ${response.status}).`;
    throw new UsersApiError(message, response.status);
  }
  return response.json() as Promise<AdminUserPage>;
}

export async function replaceUserRoles(requestAdmin: AdminRequest, userId: number, roleIds: number[]): Promise<string[]> {
  const response = await requestAdmin(`/admin/users/${userId}/role-assignments`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleIds }),
  });
  if (!response.ok) {
    const message = response.status === 403
      ? 'Không thể lưu role (403 — API từ chối thay đổi quyền, có thể do tự nâng quyền).'
      : `Không thể lưu role (request failed with status ${response.status}).`;
    throw new UsersApiError(message, response.status);
  }
  return response.json() as Promise<string[]>;
}
