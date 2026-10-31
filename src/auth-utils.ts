const POST_LOGOUT_KEY = 'compareshop-post-logout';
const RETURN_TO_KEY = 'compareshop-auth-return-to';
const RETURN_TO_COOKIE = 'compareshop-auth-return-to';
const CALLBACK_PATH = '/auth/callback';

export function safeReturnPath(value: string | null | undefined, origin = window.location.origin): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
}

export function storeReturnTo(value: string, storage?: Storage, doc: Document = window.document): void {
  const returnTo = safeReturnPath(value);
  try { (storage ?? window.sessionStorage).setItem(RETURN_TO_KEY, returnTo); } catch { /* The short-lived callback cookie is the fallback. */ }
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    doc.cookie = `${RETURN_TO_COOKIE}=${encodeURIComponent(returnTo)}; Max-Age=900; Path=${CALLBACK_PATH}; SameSite=Lax${secure}`;
  } catch { /* Session storage remains the fallback when cookies are unavailable. */ }
}

export function consumeReturnTo(storage?: Storage, doc: Document = window.document): string {
  let returnTo: string | null = null;
  try {
    const sessionStorage = storage ?? window.sessionStorage;
    returnTo = sessionStorage.getItem(RETURN_TO_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
  } catch { /* Continue with the short-lived callback cookie. */ }

  let cookie: string | undefined;
  try { cookie = doc.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${RETURN_TO_COOKIE}=`)); } catch { /* Storage may be unavailable in restricted contexts. */ }
  if (!returnTo && cookie) {
    try { returnTo = decodeURIComponent(cookie.slice(RETURN_TO_COOKIE.length + 1)); } catch { returnTo = null; }
  }
  if (cookie) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    try { doc.cookie = `${RETURN_TO_COOKIE}=; Max-Age=0; Path=${CALLBACK_PATH}; SameSite=Lax${secure}`; } catch { /* The short-lived cookie expires on its own. */ }
  }
  return safeReturnPath(returnTo);
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
