import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAdminUsers, updateAdminUserRoles, type AdminRequest, type AdminUser, type AdminUserRole } from './users-api';

const PAGE_SIZE = 20;
const ALLOWED_ROLES = ['Super Admin', 'Operator', 'Editor', 'Viewer', 'Customer'];

export function UsersRolesPage({ requestAdmin, canManage }: { requestAdmin: AdminRequest; canManage: boolean }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [mutationError, setMutationError] = useState('');
  const [notice, setNotice] = useState('');

  const loadUsers = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await getAdminUsers(requestAdmin, pageNumber, pageSize, signal);
      setUsers(result.items);
      setPageNumber(result.pageNumber);
      setPageSize(result.pageSize);
      setTotalItems(result.totalItems);
    } catch (reason) {
      if (signal.aborted) return;
      setUsers([]);
      setTotalItems(0);
      setLoadError(reason instanceof Error ? reason.message : 'Không tải được danh sách người dùng.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [requestAdmin, pageNumber, pageSize, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    void loadUsers(controller.signal);
    return () => controller.abort();
  }, [loadUsers]);

  const roleCatalog = useMemo(() => {
    const byName = new Map<string, AdminUserRole>();
    users.flatMap(user => user.roles).forEach(role => {
      if (ALLOWED_ROLES.includes(role.name) && !byName.has(role.name)) byName.set(role.name, role);
    });
    return ALLOWED_ROLES.flatMap(name => byName.has(name) ? [byName.get(name)!] : []);
  }, [users]);
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));

  const beginEdit = (user: AdminUser) => {
    setEditingId(user.id);
    setSelectedRoleIds(user.roles.map(role => role.id));
    setMutationError('');
    setNotice('');
  };

  const saveRoles = async (userId: number) => {
    setSavingId(userId);
    setMutationError('');
    setNotice('');
    try {
      const roles = await updateAdminUserRoles(requestAdmin, userId, selectedRoleIds);
      setUsers(current => current.map(user => user.id === userId ? { ...user, roles } : user));
      setEditingId(null);
      setNotice('Đã cập nhật role.');
    } catch (reason) {
      setMutationError(reason instanceof Error ? reason.message : 'Không thể thay đổi role. Vui lòng thử lại.');
    } finally {
      setSavingId(null);
    }
  };

  return <div className="users-roles-page">
    <div className="page-header"><div><span className="eyebrow">SYSTEM</span><h1>Users &amp; Roles</h1><p>Quản lý tài khoản admin và quyền truy cập theo role.</p></div></div>
    {mutationError && <div className="users-alert" role="alert">{mutationError}</div>}
    {notice && <div className="users-notice" role="status">{notice}</div>}
    {loadError && <div className="users-alert" role="alert">{loadError}<button className="outline-button small" type="button" onClick={() => setReloadKey(value => value + 1)}>Thử lại</button></div>}
    <section className="panel table-panel users-table-panel" aria-label="Users and roles">
      {loading ? <div className="users-state" role="status">Đang tải danh sách người dùng…</div>
        : loadError ? null
          : users.length === 0 ? <div className="users-state" role="status">Chưa có user admin nào trong trang này.</div>
            : <>
              <div className="users-table-scroll"><table><thead><tr><th>User</th><th>Role</th><th>Tạo lúc</th>{canManage && <th>Thao tác</th>}</tr></thead>
                <tbody>{users.map(user => <tr key={user.id}>
                  <td><div className="users-user-cell"><strong>UserId {user.id}</strong></div></td>
                  <td>{editingId === user.id ? <fieldset className="users-role-options" aria-label={`Roles for user ${user.id}`}>
                    {roleCatalog.map(role => <label key={role.id}><input type="checkbox" checked={selectedRoleIds.includes(role.id)} onChange={event => setSelectedRoleIds(current => event.target.checked ? [...current, role.id] : current.filter(id => id !== role.id))} />{role.name}</label>)}
                    {roleCatalog.length === 0 && <span>Không có role khả dụng.</span>}
                  </fieldset> : user.roles.length ? <div className="users-role-list">{user.roles.map(role => <span className="users-role-pill" key={role.id}>{role.name}</span>)}</div> : <span className="users-muted">Chưa gán role</span>}</td>
                  <td>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(user.createdAtUtc))}</td>
                  {canManage && <td className="users-actions">{editingId === user.id ? <><button type="button" className="primary-button" disabled={savingId === user.id || roleCatalog.length === 0} onClick={() => void saveRoles(user.id)}>{savingId === user.id ? 'Đang lưu…' : 'Lưu'}</button><button type="button" className="outline-button small" disabled={savingId === user.id} onClick={() => { setEditingId(null); setMutationError(''); }}>Hủy</button></> : <button type="button" className="outline-button small" onClick={() => beginEdit(user)}>Đổi role</button>}</td>}
                </tr>)}</tbody></table></div>
              <div className="table-footer"><span>{totalItems} user · trang {pageNumber}/{pageCount}</span><div><button type="button" aria-label="Trang trước" disabled={pageNumber <= 1} onClick={() => setPageNumber(value => value - 1)}>‹</button><span className="products-page-number">Trang {pageNumber}/{pageCount}</span><button type="button" aria-label="Trang sau" disabled={pageNumber >= pageCount} onClick={() => setPageNumber(value => value + 1)}>›</button></div></div>
            </>}
    </section>
  </div>;
}
