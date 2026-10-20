import Keycloak from 'keycloak-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { adminRequest } from './api-client';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'logging-out' | 'error';
type PermissionState = 'loading' | 'ready' | 'error';
type AuthContextValue = {
  status: AuthStatus;
  permissionState: PermissionState;
  permissions: string[];
  userName: string;
  error: string | null;
  keycloak: Keycloak;
  retryPermissions: () => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  clearSession: () => void;
  requestAdmin: (path: string, init?: RequestInit) => Promise<Response>;
};

const RETURN_TO_KEY = 'compareshop-auth-return-to';
const callbackUrl = `${window.location.origin}/auth/callback`;
const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || 'https://keycloak-shortlink-dev.giamha.online',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'shortlink',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'compareshop-admin-ui',
});
let initialization: Promise<boolean> | undefined;

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
}

function requestedPath(): string {
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === '/login' || current === '/auth/callback') return '/';
  return safeReturnPath(current);
}

export function AuthLoadingScreen({ message = 'Đang xác thực phiên đăng nhập…' }: { message?: string }) {
  return <main className="auth-canvas"><section className="auth-card" role="status"><Brand /><h1>{message}</h1><p>Vui lòng chờ trong giây lát để đăng nhập an toàn.</p><div className="auth-spinner" aria-label="Đang tải" /><div className="auth-status">Đang kết nối với Keycloak…</div></section></main>;
}

function Brand() {
  return <div className="auth-brand"><span className="auth-mark" aria-hidden="true">C</span><span>CompareShop<small>ADMIN CONSOLE</small></span></div>;
}

export function LoginPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const beginLogin = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      window.sessionStorage.setItem(RETURN_TO_KEY, safeReturnPath(searchParams.get('returnTo') || requestedPath()));
      await auth.login();
    } catch {
      setStarting(false);
      setError('Không thể kết nối với Keycloak. Vui lòng thử lại.');
    }
  }, [auth, starting, searchParams]);

  useEffect(() => {
    if (auth.status === 'anonymous') void beginLogin();
    if (auth.status === 'error') setError('Không thể khởi tạo đăng nhập an toàn. Vui lòng thử lại.');
  }, [auth.status, beginLogin]);

  return <main className="auth-canvas"><section className="auth-card">
    <Brand />
    <h1>Đang chuyển đến trang đăng nhập</h1>
    <p>Vui lòng chờ trong giây lát để đăng nhập an toàn.</p>
    {starting && !error ? <><div className="auth-spinner" role="status" aria-label="Đang chuyển hướng" /><div className="auth-status">Đang kết nối với Keycloak…</div></> : <div className="auth-error" role="alert">{error || 'Phiên đăng nhập chưa sẵn sàng.'}</div>}
    <button className="auth-primary" type="button" onClick={() => void beginLogin()} disabled={starting}>Thử đăng nhập lại</button>
    <p className="auth-foot">Nếu trang không tự mở, chọn nút phía trên để tiếp tục.</p>
  </section></main>;
}

export function CallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (auth.status === 'authenticated') {
      let target = '/';
      try {
        target = safeReturnPath(window.sessionStorage.getItem(RETURN_TO_KEY));
        window.sessionStorage.removeItem(RETURN_TO_KEY);
      } catch { /* The default same-origin root remains safe when storage is unavailable. */ }
      navigate(target, { replace: true });
    }
  }, [auth.status, navigate]);
  if (auth.status === 'error' || auth.status === 'anonymous') return <main className="auth-canvas"><section className="auth-card"><Brand /><h1>Không thể hoàn tất đăng nhập</h1><p>Phiên đăng nhập chưa được xác nhận. Hãy thử lại để tiếp tục an toàn.</p><a className="auth-primary" href="/login">Thử đăng nhập lại</a></section></main>;
  return <AuthLoadingScreen message="Đang hoàn tất đăng nhập" />;
}

export function ForbiddenPage() {
  const { logout } = useAuth();
  return <main className="auth-canvas"><section className="auth-card auth-forbidden">
    <Brand /><div className="auth-error-icon" role="img" aria-label="Không được phép">!</div>
    <h1>Bạn không có quyền truy cập</h1>
    <p>Tài khoản hiện tại không được phép xem trang này. Hãy quay lại hoặc đăng xuất để dùng tài khoản khác.</p>
    <div className="auth-actions"><button className="auth-primary" onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign('/')}>Quay lại</button><button className="auth-secondary" onClick={() => void logout()}>Đăng xuất</button></div>
  </section></main>;
}

export function PermissionFailure() {
  const { retryPermissions } = useAuth();
  return <main className="auth-canvas"><section className="auth-card"><Brand /><h1>Không tải được quyền truy cập</h1><p>Không thể xác nhận quyền hiện tại. Các tính năng được bảo vệ đang tạm ẩn.</p><button className="auth-primary" onClick={retryPermissions}>Thử lại</button></section></main>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [permissionState, setPermissionState] = useState<PermissionState>('loading');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [permissionAttempt, setPermissionAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    initialization ??= keycloak.init({ onLoad: 'check-sso', pkceMethod: 'S256', checkLoginIframe: false, redirectUri: callbackUrl });
    initialization.then((authenticated) => {
      if (active) setStatus(authenticated ? 'authenticated' : 'anonymous');
    }).catch(() => {
      if (active) { setError('Keycloak initialization failed'); setStatus('error'); }
    });
    return () => { active = false; };
  }, []);

  const refreshPermissions = useCallback(async () => {
    if (status !== 'authenticated') return;
    setPermissionState('loading');
    setPermissions([]);
    setError(null);
    try {
      const response = await adminRequest(keycloak, '/admin/me/permissions', {}, () => {
        keycloak.clearToken();
        setStatus('anonymous');
      }, () => navigate('/forbidden', { replace: true }));
      if (response.status === 401) throw new Error('unauthorized');
      if (!response.ok) throw new Error(`permissions-${response.status}`);
      const result = await response.json() as { permissions?: unknown };
      if (!Array.isArray(result.permissions) || result.permissions.some(value => typeof value !== 'string')) throw new Error('invalid-permissions-response');
      setPermissions(result.permissions);
      setPermissionState('ready');
    } catch (reason) {
      setPermissions([]);
      setError(reason instanceof Error ? reason.message : 'Permission request failed');
      setPermissionState('error');
      if (reason instanceof Error && (reason.message.includes('refresh') || reason.message.includes('token'))) {
        keycloak.clearToken();
        setStatus('anonymous');
      }
    }
  }, [status, permissionAttempt, navigate]);

  useEffect(() => { void refreshPermissions(); }, [refreshPermissions]);

  const login = useCallback(() => keycloak.login({ redirectUri: callbackUrl, scope: 'openid profile email' }), []);
  const logout = useCallback(() => {
    setPermissions([]);
    setPermissionState('loading');
    setStatus('logging-out');
    return keycloak.logout({ redirectUri: `${window.location.origin}/login` }).catch((reason: unknown) => {
      setStatus('anonymous');
      throw reason;
    });
  }, []);
  const clearSession = useCallback(() => {
    keycloak.clearToken();
    setPermissions([]);
    setStatus('anonymous');
    setPermissionState('loading');
  }, []);
  const requestAdmin = useCallback((path: string, init?: RequestInit) => adminRequest(keycloak, path, init, clearSession, () => navigate('/forbidden', { replace: true })), [clearSession, navigate]);
  const value = useMemo<AuthContextValue>(() => ({
    status, permissionState, permissions,
    userName: status === 'authenticated' ? String(keycloak.tokenParsed?.name || keycloak.tokenParsed?.preferred_username || keycloak.tokenParsed?.email || 'Admin') : 'Admin',
    error, keycloak, retryPermissions: () => setPermissionAttempt(value => value + 1), login, logout, clearSession, requestAdmin,
  }), [status, permissionState, permissions, error, login, logout, clearSession, requestAdmin]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
