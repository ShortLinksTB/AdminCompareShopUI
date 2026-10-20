import type Keycloak from 'keycloak-js';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'https://api-compareshop-dev.giamha.online').replace(/\/$/, '');

export async function adminRequest(
  keycloak: Keycloak,
  path: string,
  init: RequestInit = {},
  onUnauthorized: () => void,
  onForbidden: () => void = () => undefined,
): Promise<Response> {
  const url = new URL(path, `${apiBaseUrl}/`);
  if (url.origin !== new URL(apiBaseUrl).origin || !url.pathname.startsWith('/admin/')) {
    throw new Error('Authenticated API requests must target same-origin /admin endpoints.');
  }

  try {
    await keycloak.updateToken(30);
  } catch (error) {
    onUnauthorized();
    throw error;
  }

  const sendWithCurrentToken = () => {
    const headers = new Headers(init.headers);
    if (keycloak.token) headers.set('Authorization', `Bearer ${keycloak.token}`);
    return fetch(url, { ...init, headers, credentials: 'omit' });
  };

  let response = await sendWithCurrentToken();
  const method = (init.method || 'GET').toUpperCase();
  if (response.status === 401 && ['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    try {
      await keycloak.updateToken(-1);
      response = await sendWithCurrentToken();
    } catch (error) {
      onUnauthorized();
      throw error;
    }
  }
  if (response.status === 401) onUnauthorized();
  if (response.status === 403) onForbidden();
  return response;
}
