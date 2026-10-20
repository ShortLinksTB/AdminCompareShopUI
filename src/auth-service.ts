import type Keycloak from 'keycloak-js';
import { adminRequest } from './api-client';

export async function fetchPermissions(
  keycloak: Keycloak,
  onUnauthorized: () => void,
  onForbidden: () => void,
): Promise<string[]> {
  const response = await adminRequest(keycloak, '/admin/me/permissions', {}, onUnauthorized, onForbidden);
  if (response.status === 401) throw new Error('unauthorized');
  if (!response.ok) throw new Error(`permissions-${response.status}`);
  const result = await response.json() as { permissions?: unknown };
  if (!Array.isArray(result.permissions) || result.permissions.some(value => typeof value !== 'string')) {
    throw new Error('invalid-permissions-response');
  }
  return result.permissions;
}
