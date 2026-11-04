import { useCallback, useEffect, useState } from 'react';
import { getAdminUsers, replaceUserRoles, seededRoles, type AdminRequest, type AdminUser } from './users-api';
import './users.css';

const PAGE_SIZE = 20;

function roleIdsFor(roles: string[]): number[] {
  return seededRoles.filter(role => roles.includes(role.name)).map(role => role.id);
}

export function UsersPage({ requestAdmin, canManage }: { requestAdmin: AdminRequest; canManage: boolean }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  const loadUsers = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError('');
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
      setError(reason instanceof Error ? reason.message : 'Không tải được danh sách user. Vui lòng thử lại.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [requestAdmin, pageNumber, pageSize, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    void loadUsers(controller.signal);
    return () => controller.abort();
  }, [loadUsers]);

  const startEditing = (user: AdminUser) => {
    setEditingId(user.id);
    setSelectedRoleIds(roleIdsFor(user.roles));
    setSaveError('');
    setSaveSuccess('');
  };

  const saveRoles = async (user: AdminUser) => {
    setSavingId(user.id);
    setSaveError('');
    setSaveSuccess('');
    try {
      const roles = await replaceUserRoles(requestAdmin, user.id, selectedRoleIds);
      setUsers(current => current.map(item => item.id === user.id ? { ...item, roles } : item));
      setEditingId(null);
      setSaveSuccess(`Đã cập nhật role cho user ${user.id}.`);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Không thể lưu role. Vui lòng thử lại.');
    } finally {
      setSavingId(null);
    }
  };

  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));

  return <div className="users-page">
    <div className="page-header">
      <div><span className="eyebrow">SYSTEM</span><h1>Users &amp; Roles</h1><p>Quản lý tài khoản admin và quyền truy cập theo role.</p></div>
    </div>

    {error && <div className="users-alert" role="alert">{error}<button className="outline-button small" type="button" onClick={() => setReloadKey(value => value + 1)}>Thử lại</button></div>}
    {saveError && <div className="users-alert" role="alert">{saveError}</div>}
    {saveSuccess && <div className="users-success" role="status">{saveSuccess}</div>}

    <section className="panel table-panel users-table-panel" aria-label="Users list">
      {loading ? <div className="users-state" role="status">Đang tải danh sách user…</div>
        : !error && users.length === 0 ? <div className="users-state" role="status">Chưa có user admin nào trong trang này.</div>
          : !error && <>
            <div className="users-table-scroll"><table><thead><tr><th>User</th><th>Role</th><th>Tạo lúc</th>{canManage && <th>Thao tác</th>}</tr></thead><tbody>
              {users.map(user => <tr key={user.id}>
                <td><strong>UserId {user.id}</strong></td>
                <td>{editingId === user.id ? <div className="users-role-editor">
                  <select aria-label={`Roles for user ${user.id}`} multiple value={selectedRoleIds.map(String)} onChange={event => setSelectedRoleIds(Array.from(event.currentTarget.selectedOptions, option => Number(option.value)))}>
                    {seededRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                  <div className="users-edit-actions"><button className="primary-button" type="button" disabled={savingId === user.id || selectedRoleIds.length === 0} onClick={() => void saveRoles(user)}>{savingId === user.id ? 'Đang lưu…' : 'Lưu'}</button><button className="outline-button" type="button" disabled={savingId === user.id} onClick={() => { setEditingId(null); setSaveError(''); }}>Hủy</button></div>
                </div> : user.roles.length ? <div className="users-role-list">{user.roles.map(role => <span className="users-role-pill" key={role}>{role}</span>)}</div> : <span className="users-no-role">Chưa gán role</span>}</td>
                <td><time dateTime={user.createdAtUtc}>{new Date(user.createdAtUtc).toLocaleDateString('vi-VN')}</time></td>
                {canManage && <td>{editingId === user.id ? null : <button className="outline-button small" type="button" onClick={() => startEditing(user)}>Đổi role</button>}</td>}
              </tr>)}
            </tbody></table></div>
            <div className="table-footer users-table-footer"><span>{totalItems === 0 ? 0 : (pageNumber - 1) * pageSize + 1}–{Math.min(pageNumber * pageSize, totalItems)} / {totalItems} user</span><div><button type="button" aria-label="Trang trước" disabled={pageNumber <= 1} onClick={() => setPageNumber(value => value - 1)}>‹</button><span>Trang {pageNumber}/{pageCount}</span><button type="button" aria-label="Trang sau" disabled={pageNumber >= pageCount} onClick={() => setPageNumber(value => value + 1)}>›</button></div></div>
          </>}
    </section>
  </div>;
}
