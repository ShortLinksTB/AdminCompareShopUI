import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AffiliatePlatformsPage } from './AffiliatePlatformsPage';
import type { AdminRequest } from '../bannedItemsApi';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const records = [{ id: 8, name: 'AccessTrade', homeUrl: 'https://accesstrade.vn', notes: 'Primary network' }, { id: 9, name: 'Masoffer', homeUrl: null, notes: null }];

function renderPage(requestAdmin: AdminRequest, permissions = ['affiliate_platforms.read', 'affiliate_platforms.create', 'affiliate_platforms.update', 'affiliate_platforms.delete']) {
  return render(<MemoryRouter><AffiliatePlatformsPage requestAdmin={requestAdmin} permissions={permissions} /></MemoryRouter>);
}

describe('Affiliate Platforms page', () => {
  it('renders the collection and hides mutation actions without their permissions', async () => {
    const request: AdminRequest = vi.fn().mockResolvedValue(Response.json(records));
    renderPage(request, ['affiliate_platforms.read']);
    expect(await screen.findByText('AccessTrade')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://accesstrade.vn' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('button', { name: /Export JSON/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import JSON|Add platform|Edit|Delete/ })).not.toBeInTheDocument();
  });

  it('keeps all page actions grouped in the header toolbar', async () => {
    const request: AdminRequest = vi.fn().mockResolvedValue(Response.json(records));
    renderPage(request);
    await screen.findByText('AccessTrade');

    const header = screen.getByRole('heading', { name: 'Affiliate Platforms' }).closest('header');
    const toolbar = header?.querySelector('.affiliate-platforms-head-actions');
    expect(toolbar).toBeInTheDocument();
    expect(within(toolbar as HTMLElement).getAllByRole('button')).toHaveLength(3);
    expect(within(toolbar as HTMLElement).getByRole('button', { name: /Export JSON/ })).toBeInTheDocument();
    expect(within(toolbar as HTMLElement).getByRole('button', { name: /Import JSON/ })).toBeInTheDocument();
    expect(within(toolbar as HTMLElement).getByRole('button', { name: /Add platform/ })).toBeInTheDocument();
  });

  it('validates and creates a platform, then refreshes the full list', async () => {
    const user = userEvent.setup();
    let reads = 0;
    const request: AdminRequest = vi.fn(async (path, init) => {
      if (path === '/admin/affiliate-platforms' && init?.method === 'POST') return Response.json({ id: 10, name: 'New', homeUrl: null, notes: null });
      reads += 1;
      return Response.json(reads > 1 ? [...records, { id: 10, name: 'New', homeUrl: null, notes: null }] : records);
    });
    renderPage(request);
    await screen.findByText('AccessTrade');
    await user.click(screen.getByRole('button', { name: '+ Add platform' }));
    const dialog = screen.getByRole('dialog', { name: 'Add platform' });
    await user.type(within(dialog).getByLabelText('Name'), ' ');
    await user.click(within(dialog).getByRole('button', { name: 'Save platform' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Name is required');
    await user.clear(within(dialog).getByLabelText('Name'));
    await user.type(within(dialog).getByLabelText('Name'), 'New');
    await user.click(within(dialog).getByRole('button', { name: 'Save platform' }));
    expect(await screen.findByText('New')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/admin/affiliate-platforms', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'New', homeUrl: null, notes: null }) }));
  });

  it('previews imports, commits only after confirmation, and reports row errors', async () => {
    const user = userEvent.setup();
    const request: AdminRequest = vi.fn(async (path, init) => {
      if (path.endsWith('/import/preview')) return Response.json({ createCount: 1, updateCount: 0, errors: [{ index: 2, errors: ['Invalid URL'] }] });
      if (path.endsWith('/import/commit')) return Response.json({ createdCount: 1, updatedCount: 0, failedCount: 1, errors: [{ index: 2, errors: ['Invalid URL'] }] });
      return Response.json(records);
    });
    renderPage(request);
    await screen.findByText('AccessTrade');
    await user.click(screen.getByRole('button', { name: /Import JSON/ }));
    const file = new File([JSON.stringify([{ name: 'New' }, { name: 'Bad' }])], 'platforms.json', { type: 'application/json' });
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(picker, file);
    const dialog = screen.getByRole('dialog', { name: 'Import platforms' });
    await waitFor(() => expect(dialog.textContent).toContain('1 to create'));
    expect(dialog.textContent).toContain('Row 2: Invalid URL');
    expect(request).not.toHaveBeenCalledWith('/admin/affiliate-platforms/import/commit', expect.anything());
    await user.click(screen.getByRole('button', { name: 'Confirm import' }));
    expect(await screen.findByText(/1 created/)).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/admin/affiliate-platforms/import/commit', expect.objectContaining({ method: 'POST' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/affiliate-platforms', expect.anything()));
  });

  it('exports a fresh complete response with exactly the three supported fields', async () => {
    const user = userEvent.setup();
    const request: AdminRequest = vi.fn().mockImplementation(() => Promise.resolve(Response.json(records)));
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:export');
    vi.stubGlobal('URL', Object.assign(class TestUrl extends URL {}, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderPage(request);
    await screen.findByText('AccessTrade');
    await user.click(screen.getByRole('button', { name: /Export JSON/ }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const text = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsText(blob); });
    const payload = JSON.parse(text);
    expect(payload).toHaveLength(2);
    expect(payload[0]).toEqual({ name: 'AccessTrade', homeUrl: 'https://accesstrade.vn', notes: 'Primary network' });
    expect(Object.keys(payload[0])).toEqual(['name', 'homeUrl', 'notes']);
    expect(click).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('confirms bulk delete and refreshes while clearing the selected rows', async () => {
    const user = userEvent.setup();
    let reads = 0;
    const request: AdminRequest = vi.fn(async (path, init) => {
      if (path.endsWith('/bulk-delete')) return Response.json([{ id: 8, status: 'deleted' }]);
      reads += 1;
      return Response.json(reads > 1 ? [records[1]] : records);
    });
    renderPage(request);
    await screen.findByText('AccessTrade');
    await user.click(screen.getByRole('checkbox', { name: 'Select AccessTrade' }));
    await user.click(screen.getByRole('button', { name: 'Delete selected' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete selected platforms' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete 1 platforms' }));
    expect(await screen.findByText('Masoffer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete selected' })).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/admin/affiliate-platforms/bulk-delete', expect.objectContaining({ body: JSON.stringify({ ids: [8] }) }));
  });

  it('keeps an empty collection empty and presents a retry after load failure', async () => {
    const user = userEvent.setup();
    const request: AdminRequest = vi.fn().mockResolvedValueOnce(Response.json([])).mockResolvedValueOnce(Response.json({}, { status: 503 })).mockResolvedValueOnce(Response.json([]));
    renderPage(request);
    expect(await screen.findByText('Chưa có affiliate platform nào')).toBeInTheDocument();
    const retryRequest: AdminRequest = vi.fn().mockResolvedValue(Response.json({}, { status: 503 }));
    cleanup();
    renderPage(retryRequest);
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(retryRequest).toHaveBeenCalledTimes(2));
  });
});
