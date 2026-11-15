import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SyncJobsPage } from './SyncJobsPage';
import type { AdminRequest } from './sync-jobs-api';

const job = { id: '210', dataSource: 'QC-SL1815 Shop A', startedAtUtc: '2026-11-15T03:12:00Z', finishedAtUtc: '2026-11-15T03:15:02Z', queuedAtUtc: '2026-11-15T03:11:00Z', state: 'Failed', seenCount: 0, importedCount: 0, pendingCount: 0, errorCode: 'source_failure', errorSummary: 'Catalog source could not be read or imported.' };
const log = { id: '1', occurredAtUtc: '2026-11-15T03:12:01Z', level: 'Error', step: 'shop_check', message: 'Shop is unavailable', exceptionType: 'TimeoutException', httpStatusCode: 503 };
function requestMock(withLogs = true): ReturnType<typeof vi.fn<AdminRequest>> {
  return vi.fn<AdminRequest>().mockImplementation(async path => {
    if (path.includes('/logs')) return Response.json({ items: withLogs ? [log] : [], page: 1, pageSize: 500, totalItems: withLogs ? 1 : 0 });
    if (path.includes('/retry')) return new Response(null, { status: 202 });
    const params = new URL(`http://localhost${path}`).searchParams;
    const pageSize = Number(params.get('pageSize') || 25);
    if (pageSize === 1) return Response.json({ items: [], page: 1, pageSize, totalItems: params.get('status') === 'Failed' ? 2 : 4 });
    return Response.json({ items: [job], page: Number(params.get('page') || 1), pageSize, totalItems: 1 });
  });
}
afterEach(cleanup);

describe('SyncJobsPage', () => {
  it('renders approved summary, status counts and the three-part server pager', async () => {
    const requestAdmin = requestMock();
    render(<SyncJobsPage requestAdmin={requestAdmin} permissions={['sync_jobs.read']} />);
    expect(await screen.findByText('QC-SL1815 Shop A')).toBeInTheDocument();
    expect(screen.getByText('Hiển thị 1–1 trong 1')).toBeInTheDocument();
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledWith(expect.stringContaining('pageSize=1'), expect.anything()));
    expect(screen.getByRole('group', { name: 'Lọc theo trạng thái' })).toHaveTextContent('Failed');
  });
  it('combines search, date and status filters into the API request', async () => {
    const requestAdmin = requestMock();
    render(<SyncJobsPage requestAdmin={requestAdmin} permissions={['sync_jobs.read']} />);
    await screen.findByText('QC-SL1815 Shop A');
    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm theo tên nguồn dữ liệu' }), { target: { value: 'Shop A' } });
    fireEvent.change(screen.getByLabelText('Từ ngày bắt đầu'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: /Failed/ }));
    await waitFor(() => expect(requestAdmin.mock.calls.some(([path]) => String(path).includes('q=Shop+A') && String(path).includes('startedFrom=') && String(path).includes('status=Failed'))).toBe(true));
  });
  it('opens the log modal with failure cause, timeline, search and no-log states', async () => {
    const requestAdmin = requestMock();
    render(<SyncJobsPage requestAdmin={requestAdmin} permissions={['sync_jobs.read']} />);
    await screen.findByText('QC-SL1815 Shop A');
    fireEvent.click(screen.getByLabelText('Thao tác job 210'));
    fireEvent.click(screen.getByRole('button', { name: 'Xem log' }));
    expect(await screen.findByRole('dialog', { name: /Log đồng bộ/ })).toHaveTextContent('Nguyên nhân lỗi');
    expect(await screen.findByText('Shop is unavailable')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm trong log' }), { target: { value: 'no match' } });
    expect(screen.getByText('Không tìm thấy dòng log phù hợp')).toBeInTheDocument();
  });
  it('shows the legacy job empty-log state', async () => {
    const requestAdmin = requestMock(false);
    render(<SyncJobsPage requestAdmin={requestAdmin} permissions={['sync_jobs.read']} />);
    await screen.findByText('QC-SL1815 Shop A');
    fireEvent.click(screen.getByLabelText('Thao tác job 210'));
    fireEvent.click(screen.getByRole('button', { name: 'Xem log' }));
    expect(await screen.findByText('Job này chưa có log')).toBeInTheDocument();
  });
  it('keeps retry gated without execute permission and retries eligible jobs when allowed', async () => {
    const requestAdmin = requestMock();
    const { rerender } = render(<SyncJobsPage requestAdmin={requestAdmin} permissions={['sync_jobs.read']} />);
    await screen.findByText('QC-SL1815 Shop A');
    fireEvent.click(screen.getByLabelText('Thao tác job 210'));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    rerender(<SyncJobsPage requestAdmin={requestAdmin} permissions={['sync_jobs.read', 'sync_jobs.execute']} />);
    if (!screen.queryByRole('button', { name: 'Retry' })) fireEvent.click(screen.getByLabelText('Thao tác job 210'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(requestAdmin.mock.calls.some(([path, init]) => String(path).includes('/210/retry') && init?.method === 'POST')).toBe(true));
    expect(await screen.findByText(/Đã xếp lịch retry/)).toBeInTheDocument();
  });
});
