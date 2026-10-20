export type AdminRole = 'Super Admin' | 'Operator' | 'Editor' | 'Viewer';
export type AdminPermission = 'compliance.read' | 'compliance.manage';

const rolePermissions: Record<AdminRole, AdminPermission[]> = {
  'Super Admin': ['compliance.read', 'compliance.manage'],
  Operator: ['compliance.read', 'compliance.manage'],
  Editor: [],
  Viewer: [],
};

export function currentAdminRole(): AdminRole {
  const role = window.localStorage.getItem('giatot-admin-role');
  return role === 'Operator' || role === 'Editor' || role === 'Viewer' || role === 'Super Admin' ? role : 'Super Admin';
}

export function hasPermission(role: string, permission: AdminPermission): boolean {
  return Object.hasOwn(rolePermissions, role) && rolePermissions[role as AdminRole].includes(permission);
}
