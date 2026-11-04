import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { UsersPage } from './UsersPage';
import type { AdminRequest } from './users-api';

const user = { id: 7, createdAtUtc: '2026-10-18T00:00:00Z', roles: ['Viewer'] };
const page = (items = [user], pageNumber = 1, pageSize = 20, totalItems = items.length) => Response.json({ items, pageNumber, pageSize, totalItems });
afterEach(cleanup);

describe('UsersPage', () => {
  it('shows only API-backed fields, localized date, and read-only roles without users.manage', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(page());
    render(<UsersPage requestAdmin={requestAdmin} canManage={false} />);
    expect(await screen.findByText('UserId 7')).toBeInTheDocument();
    expect(screen.getByText('Viewer')).toBeInTheDocument();
    expect(screen.getByText('18/10/2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đổi role' })).not.toBeInTheDocument();
    expect(screen.queryByText(/subject|last active|Active|Invite/)).not.toBeInTheDocument();
    expect(requestAdmin).toHaveBeenCalledWith('/admin/users?page=1&pageSize=20', expect.objectContaining({ signal: expect.any(AbortSignal) }), { redirectOnForbidden: false });
  });

  it('keeps loading visible until the request resolves and then renders empty state', async () => {
    let resolve!: (response: Response) => void;
    const requestAdmin = vi.fn<AdminRequest>().mockReturnValue(new Promise(done => { resolve = done; }));
    render(<UsersPage requestAdmin={requestAdmin} canManage />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải danh sách user');
    resolve(page([], 1, 20, 0));
    expect(await screen.findByText('Chưa có user admin nào trong trang này.')).toBeInTheDocument();
  });

  it('shows a retryable 403 error without mock rows', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValueOnce(new Response('', { status: 403 })).mockResolvedValueOnce(page());
    render(<UsersPage requestAdmin={requestAdmin} canManage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('403');
    expect(screen.queryByText('UserId 7')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('UserId 7')).toBeInTheDocument();
  });

  it('sends multi-selected seeded roles and updates displayed roles only after success', async () => {
    const userActions = userEvent.setup();
    let finishUpdate!: (response: Response) => void;
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(page())
      .mockReturnValueOnce(new Promise(done => { finishUpdate = done; }));
    render(<UsersPage requestAdmin={requestAdmin} canManage />);
    await screen.findByText('Viewer');
    fireEvent.click(screen.getByRole('button', { name: 'Đổi role' }));
    const roles = screen.getByRole('listbox', { name: 'Roles for user 7' });
    await userActions.selectOptions(roles, ['2', '4']);
    await userActions.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(screen.getByText('Viewer')).toBeInTheDocument();
    expect(requestAdmin).toHaveBeenLastCalledWith('/admin/users/7/role-assignments', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ roleIds: [2, 4] }) }));
    finishUpdate(Response.json(['Operator', 'Viewer']));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Đổi role' })).toBeInTheDocument());
    expect(await screen.findByText('Operator')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Đã cập nhật role');
  });

  it('preserves the row and reports API rejection; Cancel discards local selection', async () => {
    const userActions = userEvent.setup();
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValueOnce(page()).mockResolvedValueOnce(new Response('', { status: 403 }));
    render(<UsersPage requestAdmin={requestAdmin} canManage />);
    await screen.findByText('Viewer');
    fireEvent.click(screen.getByRole('button', { name: 'Đổi role' }));
    await userActions.selectOptions(screen.getByRole('listbox'), '1');
    await userActions.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('403');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect((screen.getByRole('option', { name: 'Super Admin' }) as HTMLOptionElement).selected).toBe(true);
    await userActions.click(screen.getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(screen.getByText('Viewer')).toBeInTheDocument());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('uses API pagination values for subsequent pages', async () => {
    const nextUser = { ...user, id: 8, roles: [] };
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValueOnce(page([user], 1, 20, 21)).mockResolvedValueOnce(page([nextUser], 2, 20, 21));
    render(<UsersPage requestAdmin={requestAdmin} canManage={false} />);
    await screen.findByText('UserId 7');
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(requestAdmin).toHaveBeenLastCalledWith('/admin/users?page=2&pageSize=20', expect.any(Object), { redirectOnForbidden: false }));
    expect(await screen.findByText('UserId 8')).toBeInTheDocument();
    expect(screen.getByText('Chưa gán role')).toBeInTheDocument();
  });
});
