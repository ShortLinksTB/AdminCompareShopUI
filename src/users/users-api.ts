export type AdminRequest = (path: string, init?: RequestInit, redirectOnForbidden?: boolean) => Promise<Response>;

export interface AdminUserRole {
  id: number;
  name: string;
}

export interface AdminUser {
  id: number;
  createdAtUtc: string;
  roles: AdminUserRole[];
}

export interface AdminUserPage {
  items: AdminUser[];
  pageNumber: number;
  pageSize: number;
  totalItems: number;
}

export class UsersApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'UsersApiError';
  }
}

export async function getAdminUsers(requestAdmin: AdminRequest, page: number, pageSize: number, signal?: AbortSignal): Promise<AdminUserPage> {
  const response = await requestAdmin(`/admin/users?page=${page}&pageSize=${pageSize}`, { signal }, false);
  if (!response.ok) {
    const message = response.status === 403
      ? 'Không có quyền xem danh sách người dùng (403).'
      : `Không tải được danh sách người dùng (lỗi ${response.status}).`;
    throw new UsersApiError(message, response.status);
  }
  return response.json() as Promise<AdminUserPage>;
}

export async function updateAdminUserRoles(requestAdmin: AdminRequest, userId: number, roleIds: number[]): Promise<AdminUserRole[]> {
  const response = await requestAdmin(`/admin/users/${userId}/role-assignments`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleIds }),
  });
  if (!response.ok) {
    const message = response.status === 403
      ? 'Không thể thay đổi role (403). Bạn có thể không đủ quyền hoặc đang tự nâng quyền.'
      : `Không thể thay đổi role (lỗi ${response.status}).`;
    throw new UsersApiError(message, response.status);
  }
  const result = await response.json() as { roles: AdminUserRole[] } | AdminUserRole[];
  return Array.isArray(result) ? result : result.roles;
}
