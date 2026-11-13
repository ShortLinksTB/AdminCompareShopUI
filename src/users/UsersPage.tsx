import { useCallback, useEffect, useState } from 'react';
import { getAdminUsers, replaceUserRoles, seededRoles, type AdminRequest, type AdminUser } from './users-api';
import { Button, Card, DataTable, EmptyState, ErrorState, Loading, PageHeader, Pager, Pill, Select, Toast } from '../ui';

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

  return <>
    <PageHeader eyebrow="SYSTEM" title="Users & Roles" description="Quản lý tài khoản admin và quyền truy cập theo role." />

    {error && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}><ErrorState title={error} /><Button size="sm" type="button" onClick={() => setReloadKey(value => value + 1)}>Thử lại</Button></div>}
    {saveError && <ErrorState title={saveError} />}
    {saveSuccess && <Toast>{saveSuccess}</Toast>}

    <Card aria-label="Users list" style={{ overflow: 'hidden' }}>
      {loading ? <div aria-live="polite" style={{ display: 'grid', justifyItems: 'center', gap: 8, padding: 28, color: 'var(--studio-muted)' }}><Loading label="Đang tải danh sách user" /><span>Đang tải danh sách user…</span></div>
        : !error && users.length === 0 ? <EmptyState title="Chưa có user admin nào trong trang này." />
          : !error && <>
            <DataTable><thead><tr><th>User</th><th>Role</th><th>Tạo lúc</th>{canManage && <th>Thao tác</th>}</tr></thead><tbody>
              {users.map(user => <tr key={user.id}>
                <td><strong>UserId {user.id}</strong></td>
                <td>{editingId === user.id ? <div style={{ display: 'grid', minWidth: 170, gap: 8 }}>
                  <Select aria-label={`Roles for user ${user.id}`} multiple value={selectedRoleIds.map(String)} onChange={event => setSelectedRoleIds(Array.from(event.currentTarget.selectedOptions, option => Number(option.value)))} style={{ minHeight: 112, padding: 6 }}>
                    {seededRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </Select>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}><Button tone="primary" type="button" disabled={savingId === user.id || selectedRoleIds.length === 0} onClick={() => void saveRoles(user)}>{savingId === user.id ? 'Đang lưu…' : 'Lưu'}</Button><Button type="button" disabled={savingId === user.id} onClick={() => { setEditingId(null); setSaveError(''); }}>Hủy</Button></div>
                </div> : user.roles.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{user.roles.map(role => <Pill key={role} tone="neutral" size="sm">{role}</Pill>)}</div> : <span style={{ color: 'var(--studio-muted)' }}>Chưa gán role</span>}</td>
                <td><time dateTime={user.createdAtUtc}>{new Date(user.createdAtUtc).toLocaleDateString('vi-VN')}</time></td>
                {canManage && <td>{editingId === user.id ? null : <Button size="sm" type="button" onClick={() => startEditing(user)}>Đổi role</Button>}</td>}
              </tr>)}
            </tbody></DataTable>
            <div className="studio-table-footer"><span>{totalItems === 0 ? 0 : (pageNumber - 1) * pageSize + 1}–{Math.min(pageNumber * pageSize, totalItems)} / {totalItems} user</span><Pager page={pageNumber} pages={pageCount} onChange={setPageNumber} /></div>
          </>}
    </Card>
  </>;
}
