import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DataSourcesPage } from './DataSourcesPage';
import type { AdminRequest } from '../bannedItemsApi';

afterEach(cleanup);

const sources = [
  { id: 1006, key: 'bhx', displayName: 'Bách Hóa Xanh', categoryPath: '/bia', partnerShopId: 1028, partnerShopDisplayName: 'Bách Hóa Xanh', state: 0, intervalHours: 72, createdAtUtc: '2026-01-01T00:00:00Z', lastCompletedAtUtc: '2026-11-14T12:00:00Z', nextAttemptAtUtc: '2026-11-17T12:00:00Z' },
  { id: 1007, key: 'phone-shop', displayName: 'Phone shop', categoryPath: '/laptop/mac.html', partnerShopId: null, partnerShopDisplayName: null, state: 2, intervalHours: 24, createdAtUtc: '2026-01-01T00:00:00Z', lastCompletedAtUtc: null, nextAttemptAtUtc: null },
];
const jobs = [
  { id: 91, dataSourceId: 1006, dataSource: 'Bách Hóa Xanh', state: 3, queuedAtUtc: '2026-11-14T12:00:00Z', startedAtUtc: '2026-11-14T12:00:00Z', finishedAtUtc: '2026-11-14T12:01:00Z', seenCount: 214, importedCount: 214, pendingCount: 12 },
  { id: 92, dataSourceId: 1007, dataSource: 'Phone shop', state: 4, queuedAtUtc: '2026-11-14T11:00:00Z', startedAtUtc: '2026-11-14T11:00:00Z', finishedAtUtc: '2026-11-14T11:01:00Z', seenCount: 0, importedCount: 0, pendingCount: 0 },
];

function makeRequest(overrides: Record<string, (init?: RequestInit) => Response> = {}) {
  const requestAdmin: AdminRequest = vi.fn(async (path, init) => {
    if (overrides[path]) return overrides[path](init);
    if (path === '/admin/data-sources') return Response.json(sources);
    if (path === '/admin/sync-jobs') return Response.json(jobs);
    if (path.startsWith('/admin/shops?')) return Response.json({ items: [{ id: 1028, slug: 'bhx', name: 'Bách Hóa Xanh', isActive: true }], pageNumber: 1, pageSize: 100, totalItems: 1 });
    if (init?.method === 'PATCH') return Response.json({ ...sources[0], state: 0, intervalHours: 24 });
    if (init?.method === 'POST') return new Response(null, { status: 202 });
    return new Response(null, { status: 404 });
  });
  return requestAdmin;
}

function renderPage(requestAdmin: AdminRequest, permissions: string[]) {
  return render(<MemoryRouter><DataSourcesPage requestAdmin={requestAdmin} permissions={permissions} /></MemoryRouter>);
}

describe('Data Sources page', () => {
  it('loads real source and job data, safely renders missing shops, and disables unsupported actions', async () => {
    const requestAdmin = makeRequest();
    renderPage(requestAdmin, ['sync_jobs.read']);

    const bhx = await screen.findByRole('region', { name: 'Bách Hóa Xanh' });
    expect(within(bhx).getByRole('heading', { name: 'Bách Hóa Xanh' })).toBeInTheDocument();
    expect(within(bhx).getByText('Every 72 hours')).toBeInTheDocument();
    expect(within(bhx).getByText(/Imported 214.*Pending 12/)).toBeInTheDocument();
    expect(within(bhx).getByRole('link', { name: 'View in Sync Jobs →' })).toHaveAttribute('href', '/sync-jobs');

    const errorSource = screen.getByRole('region', { name: 'Phone shop' });
    expect(within(errorSource).getByText('Not assigned')).toBeInTheDocument();
    expect(within(errorSource).getByText('Error')).toBeInTheDocument();
    expect(within(errorSource).getByRole('button', { name: 'Run sync' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Add source' })).toBeDisabled();
    expect(screen.queryByText(/Credential|Connected|Expired|Shopee Affiliate|TechMart Products/)).not.toBeInTheDocument();
    expect(requestAdmin).toHaveBeenCalledWith('/admin/data-sources', expect.anything());
    expect(requestAdmin).toHaveBeenCalledWith('/admin/sync-jobs', expect.anything());
  });

  it('configures a source, validates interval locally, focuses the first field, and saves server values', async () => {
    const user = userEvent.setup();
    const requestAdmin = makeRequest();
    renderPage(requestAdmin, ['sync_jobs.read', 'sync_jobs.execute', 'shops.read']);
    await user.click((await screen.findAllByRole('button', { name: 'Configure' }))[0]);

    const dialog = await screen.findByRole('dialog', { name: 'Configure Bách Hóa Xanh' });
    const interval = within(dialog).getByLabelText('Run interval hours');
    await waitFor(() => expect(interval).toHaveFocus());
    expect(within(dialog).getByText('bhx')).toBeInTheDocument();
    expect(within(dialog).getByText('/bia')).toBeInTheDocument();
    expect(await within(dialog).findByRole('option', { name: 'Bách Hóa Xanh' })).toBeInTheDocument();

    await user.clear(interval);
    await user.type(interval, '721');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('1 to 720');
    expect(requestAdmin).not.toHaveBeenCalledWith('/admin/data-sources/1006', expect.anything());

    await user.clear(interval);
    await user.type(interval, '24');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requestAdmin).toHaveBeenCalledWith('/admin/data-sources/1006', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ state: 'Active', intervalHours: 24, partnerShopId: 1028 }),
    }));
    expect(screen.getByRole('status')).toHaveTextContent('configuration saved');
  });

  it('keeps edits open and displays a real permission failure on Configure', async () => {
    const user = userEvent.setup();
    const requestAdmin = makeRequest({
      '/admin/data-sources/1006': () => Response.json({ detail: 'Forbidden' }, { status: 403 }),
    });
    renderPage(requestAdmin, ['sync_jobs.read', 'sync_jobs.execute', 'shops.read']);
    await user.click((await screen.findAllByRole('button', { name: 'Configure' }))[0]);
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Run interval hours'));
    await user.type(within(dialog).getByLabelText('Run interval hours'), '48');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Forbidden');
    expect(within(dialog).getByLabelText('Run interval hours')).toHaveValue(48);
  });

  it('does not offer Error-state reactivation and restores focus to Configure on Escape', async () => {
    const user = userEvent.setup();
    const requestAdmin = makeRequest();
    renderPage(requestAdmin, ['sync_jobs.read', 'sync_jobs.execute']);
    const triggers = await screen.findAllByRole('button', { name: 'Configure' });
    await user.click(triggers[1]);
    const dialog = await screen.findByRole('dialog', { name: 'Configure Phone shop' });
    expect(within(dialog).getByRole('switch', { name: 'Automatic sync state' })).toHaveAttribute('aria-checked', 'false');
    expect(within(dialog).getByRole('switch', { name: 'Automatic sync state' })).toBeDisabled();
    expect(within(dialog).getByText(/cannot be reactivated/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(triggers[1]).toHaveFocus();
  });

  it('queues an active source and reloads job data; server conflicts are shown without success', async () => {
    const user = userEvent.setup();
    const requestAdmin = makeRequest({
      '/admin/data-sources/1006/sync': () => Response.json({ detail: 'A job is already active.' }, { status: 409 }),
    });
    renderPage(requestAdmin, ['sync_jobs.read', 'sync_jobs.execute']);
    const bhx = await screen.findByRole('region', { name: 'Bách Hóa Xanh' });
    await user.click(within(bhx).getByRole('button', { name: 'Run sync' }));
    expect(await screen.findByRole('status')).toHaveTextContent('A job is already active.');
    expect(requestAdmin).toHaveBeenCalledWith('/admin/data-sources/1006/sync', { method: 'POST' });
  });

  it('reports successful queueing only after the API accepts the job', async () => {
    const user = userEvent.setup();
    const requestAdmin = makeRequest({ '/admin/data-sources/1006/sync': () => new Response(null, { status: 202 }) });
    renderPage(requestAdmin, ['sync_jobs.read', 'sync_jobs.execute']);
    const bhx = await screen.findByRole('region', { name: 'Bách Hóa Xanh' });
    await user.click(within(bhx).getByRole('button', { name: 'Run sync' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Sync queued for Bách Hóa Xanh');
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledTimes(5));
  });

  it('shows sources even when Sync Jobs access is denied and explains missing shop permission in Configure', async () => {
    const requestAdmin = makeRequest({ '/admin/sync-jobs': () => Response.json({}, { status: 403 }) });
    const user = userEvent.setup();
    renderPage(requestAdmin, ['sync_jobs.read', 'sync_jobs.execute']);
    expect(await screen.findByRole('region', { name: 'Bách Hóa Xanh' })).toBeInTheDocument();
    expect(await screen.findByText(/Latest job details are unavailable/)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Configure' })[0]);
    expect(await screen.findByText(/permission to view Partner Shops/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
