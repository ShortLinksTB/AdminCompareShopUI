const POST_LOGOUT_KEY = 'compareshop-post-logout';
const RETURN_TO_COOKIE = 'compareshop-auth-return-to';

export function safeReturnPath(value: string | null | undefined, origin = window.location.origin): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
}

export function storeReturnPath(value: string, storage: Storage = window.sessionStorage): void {
  const safePath = safeReturnPath(value);
  try { storage.setItem(RETURN_TO_COOKIE, safePath); } catch { /* The callback cookie is a short-lived fallback for browser redirects. */ }
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${RETURN_TO_COOKIE}=${encodeURIComponent(safePath)}; Path=/; Max-Age=600; SameSite=Lax${secure}`;
  } catch { /* Session storage remains the primary same-tab return-path store. */ }
}

export function consumeReturnPath(storage: Storage = window.sessionStorage): string {
  let path: string | null = null;
  try {
    path = storage.getItem(RETURN_TO_COOKIE);
    storage.removeItem(RETURN_TO_COOKIE);
  } catch { /* Fall back to the short-lived callback cookie. */ }
  try {
    const cookie = document.cookie.split('; ').find(item => item.startsWith(`${RETURN_TO_COOKIE}=`));
    if (path === null && cookie) path = decodeURIComponent(cookie.slice(RETURN_TO_COOKIE.length + 1));
    document.cookie = `${RETURN_TO_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch { /* A missing or unavailable return path safely resolves to the app root. */ }
  return safeReturnPath(path);
}

export function markPostLogout(storage: Storage = window.sessionStorage): void {
  try { storage.setItem(POST_LOGOUT_KEY, '1'); } catch { /* Logout should still proceed if storage is unavailable. */ }
}

export function consumePostLogout(storage: Storage = window.sessionStorage): boolean {
  try {
    const marked = storage.getItem(POST_LOGOUT_KEY) === '1';
    if (marked) storage.removeItem(POST_LOGOUT_KEY);
    return marked;
  } catch { return false; }
}

export function clearPostLogout(storage: Storage = window.sessionStorage): void {
  try { storage.removeItem(POST_LOGOUT_KEY); } catch { /* Best effort cleanup. */ }
}
