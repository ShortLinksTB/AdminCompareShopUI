import { createContext, useContext } from 'react';

export type AdminRole = 'Super Admin' | 'Operator' | 'Editor' | 'Viewer';
export type AdminPermission = 'compliance.read' | 'compliance.manage';

export interface AdminIdentity {
  role: AdminRole;
  permissions: readonly AdminPermission[];
  displayName?: string;
}

// The authenticated shell must provide this context after validating the session.
// Missing identity is deliberately deny-by-default; browser storage is not an authority.
export const AdminIdentityContext = createContext<AdminIdentity | null>(null);

export function useAdminIdentity(): AdminIdentity | null {
  return useContext(AdminIdentityContext);
}

export function hasPermission(identity: AdminIdentity | null, permission: AdminPermission): boolean {
  return identity?.permissions.includes(permission) ?? false;
}
