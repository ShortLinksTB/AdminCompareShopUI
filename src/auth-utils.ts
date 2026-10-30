const POST_LOGOUT_KEY = 'compareshop-post-logout';

export function safeReturnPath(value: string | null | undefined, origin = window.location.origin): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
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
