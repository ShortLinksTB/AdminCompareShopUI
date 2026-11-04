import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { UsersRolesPage } from './UsersRolesPage';
import type { AdminRequest, AdminUser } from './users-api';

const operator = { id: 2, name: 'Operator' };
const viewer = { id: 4, name: 'Viewer' };
const user: AdminUser = { id: 42, createdAtUtc: '2026-10-18T10:00:00Z', roles: [operator] };
const page = (items = [user], pageNumber = 1, totalItems = items.length) => Response.json({ items, pageNumber, pageSize: 20, totalItems });
afterEach(cleanup);

describe('UsersRolesPage', () => {
  it('loads only API fields, excludes subject and unsupported wireframe data, and stays read-only without permission', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(page());
    render(<UsersRolesPage requestAdmin={requestAdmin} canManage={false} />);
    expect(screen.getByRole('heading', { name: 'Users & Roles' })).toBeInTheDocument();
    expect(await screen.findByText('UserId 42')).toBeInTheDocument();
    expect(screen.getByText('Operator')).toBeInTheDocument();
    expect(screen.getByText(/18\/10\/26/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đổi role' })).not.toBeInTheDocument();
    expect(screen.queryByText(/KeycloakSubject|Last active|Active|Invite user/)).not.toBeInTheDocument();
    expect(requestAdmin).toHaveBeenCalledWith('/admin/users?page=1&pageSize=20', expect.objectContaining({ signal: expect.any(AbortSignal) }), false);
  });

  it('holds loading state until the API resolves and then shows empty state', async () => {
    let resolve!: (response: Response) => void;
    const requestAdmin = vi.fn<AdminRequest>().mockReturnValue(new Promise(done => { resolve = done; }));
    render(<UsersRolesPage requestAdmin={requestAdmin} canManage />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
    resolve(page([], 1, 0));
    expect(await screen.findByText('Chưa có user admin nào trong trang này.')).toBeInTheDocument();
  });

  it('shows retryable 403 error without rendering rows', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValueOnce(new Response('', { status: 403 })).mockResolvedValueOnce(page());
    render(<UsersRolesPage requestAdmin={requestAdmin} canManage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('403');
    expect(screen.queryByText('UserId 42')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('UserId 42')).toBeInTheDocument();
  });

  it('paginates using the API one-based page values', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValueOnce(page([user], 1, 21)).mockResolvedValueOnce(page([{ ...user, id: 43 }], 2, 21));
    render(<UsersRolesPage requestAdmin={requestAdmin} canManage={false} />);
    expect(await screen.findByText('UserId 42')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText('UserId 43')).toBeInTheDocument();
    expect(requestAdmin).toHaveBeenLastCalledWith('/admin/users?page=2&pageSize=20', expect.objectContaining({ signal: expect.any(AbortSignal) }), false);
  });

  it('commits selected roles only on successful response and retains row after 403', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValueOnce(page([user, { ...user, id: 43, roles: [viewer] }])).mockResolvedValueOnce(new Response('', { status: 403 })).mockResolvedValueOnce(Response.json({ roles: [viewer] }));
    render(<UsersRolesPage requestAdmin={requestAdmin} canManage />);
    expect(await screen.findByText('Operator')).toBeInTheDocument();
    fireEvent.click(within(screen.getByText('UserId 42').closest('tr')!).getByRole('button', { name: 'Đổi role' }));
    fireEvent.click(screen.getByLabelText('Viewer'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('403');
    expect(screen.getByText('Operator')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Operator' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(within(screen.getByText('UserId 42').closest('tr')!).getByText('Viewer')).toBeInTheDocument());
    expect(requestAdmin).toHaveBeenLastCalledWith('/admin/users/42/role-assignments', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ roleIds: [4] }) }));
  });

  it('cancels an edit without sending a mutation', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(page());
    render(<UsersRolesPage requestAdmin={requestAdmin} canManage />);
    await screen.findByText('Operator');
    fireEvent.click(screen.getByRole('button', { name: 'Đổi role' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.getByText('Operator')).toBeInTheDocument();
    expect(requestAdmin).toHaveBeenCalledTimes(1);
  });
});
