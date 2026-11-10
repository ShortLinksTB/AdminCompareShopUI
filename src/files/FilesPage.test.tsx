import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { FilesPage } from './FilesPage';
import type { AdminFile, AdminFilePage } from './files-api';
import type { AdminRequest } from '../products/products-api';

const image: AdminFile = { id: 'image-1', originalFileName: 'banner.png', contentType: 'image/png', sizeBytes: 1200, width: 800, height: 600, uploadedBy: 'Andy', uploadedAtUtc: '2026-11-10T10:00:00Z' };
const pdf: AdminFile = { ...image, id: 'pdf-1', originalFileName: 'guide.pdf', contentType: 'application/pdf', width: null, height: null };
const page = (items: AdminFile[] = [image, pdf], pageNumber = 1, pageSize = 10, totalItems = items.length): AdminFilePage => ({ items, pageNumber, pageSize, totalItems });
const pageResponse = (items: AdminFile[] = [image, pdf], pageNumber = 1, pageSize = 10, totalItems = items.length) => Response.json(page(items, pageNumber, pageSize, totalItems));

function requestFor(): ReturnType<typeof vi.fn<AdminRequest>> {
  return vi.fn<AdminRequest>().mockImplementation(path => path === '/admin/files?page=1&pageSize=10'
    ? Promise.resolve(pageResponse())
    : path.startsWith('/admin/files/') ? Promise.resolve(Response.json(image))
      : Promise.resolve(new Response(null, { status: 204 })));
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('FilesPage list and permissions', () => {
  it('loads the list, omits size and dimensions, and supports search, filter, page size, and pagination', async () => {
    const user = userEvent.setup();
    const request = requestFor();
    request.mockImplementation(path => {
      if (path.startsWith('/admin/files?')) {
        const params = new URLSearchParams(path.split('?')[1]);
        return Promise.resolve(params.get('page') === '2' ? pageResponse([pdf], 2, 20, 21) : pageResponse([image, pdf], Number(params.get('page')), Number(params.get('pageSize')), 21));
      }
      return Promise.resolve(Response.json(image));
    });
    render(<FilesPage requestAdmin={request} permissions={['files.read']} />);
    expect(await screen.findByText('banner')).toBeInTheDocument();
    expect(screen.getByText('guide')).toBeInTheDocument();
    expect(screen.queryByText('1 KB')).not.toBeInTheDocument();
    expect(screen.queryByText('800 × 600')).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Search file name' }), 'banner');
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('q=banner'), expect.objectContaining({ signal: expect.any(AbortSignal) })));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by type' }), 'image');
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('type=images'), expect.objectContaining({ signal: expect.any(AbortSignal) })));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by type' }), 'other');
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('type=other'), expect.objectContaining({ signal: expect.any(AbortSignal) })));
    await user.selectOptions(screen.getByLabelText('Rows per page'), '20');
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('pageSize=20'), expect.any(Object)));
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.any(Object)));
    expect(await screen.findByText('Showing 21–21 of 21 files')).toBeInTheDocument();
  });

  it('shows loading, empty, and retryable error states', async () => {
    let resolve!: (response: Response) => void;
    const request = vi.fn<AdminRequest>().mockImplementation(() => new Promise(done => { resolve = done; }));
    render(<FilesPage requestAdmin={request} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading files');
    resolve(pageResponse([], 1, 10, 0));
    expect(await screen.findByText(/No files found/)).toBeInTheDocument();
    request.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce(pageResponse([], 1, 10, 0));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search file name' }), { target: { value: 'error' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('temporary failure');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/No files found/)).toBeInTheDocument();
  });

  it('keeps requested pagination when the list response omits page metadata', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ items: [], totalItems: 0 }));
    render(<FilesPage requestAdmin={request} />);

    expect(await screen.findByText(/No files found/)).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/admin/files?page=1&pageSize=10', expect.any(Object));
    expect(screen.getByText('Showing 0–0 of 0 files')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('hides upload and delete affordances without files.write', async () => {
    render(<FilesPage requestAdmin={requestFor()} permissions={['files.read']} />);
    await screen.findByText('banner');
    expect(screen.queryByRole('button', { name: '⬆ Upload' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for banner' }));
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
  });
});

describe('FilesPage thumbnail fallback', () => {
  it('replaces a broken image thumbnail with a type badge', async () => {
    render(<FilesPage requestAdmin={requestFor()} permissions={['files.read']} />);
    const button = await screen.findByRole('button', { name: 'Preview banner' });
    const img = button.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(button.querySelector('img')).toBeNull();
    expect(button).toHaveTextContent('IMG');
  });
});

describe('FilesPage details and file actions', () => {
  it('loads full metadata in Details and closes with Escape', async () => {
    const user = userEvent.setup();
    const request = requestFor();
    render(<FilesPage requestAdmin={request} permissions={['files.read']} />);
    await user.click(await screen.findByRole('button', { name: 'banner' }));
    expect(await screen.findByRole('dialog', { name: 'File details' })).toBeInTheDocument();
    expect(screen.getByText('1 KB')).toBeInTheDocument();
    expect(screen.getByText('800 × 600')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/admin/files/image-1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'File details' })).not.toBeInTheDocument();
  });

  it('shows and performs write actions, retaining a delete error for retry', async () => {
    const request = requestFor();
    request.mockImplementation(path => path === '/admin/files?page=1&pageSize=10' ? Promise.resolve(pageResponse([pdf]))
      : path.startsWith('/admin/files/') ? Promise.resolve(new Response('', { status: 403 }))
        : Promise.resolve(new Response(null, { status: 204 })));
    render(<FilesPage requestAdmin={request} permissions={['files.read', 'files.write']} />);
    await screen.findByText('guide');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for guide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('alertdialog').querySelector('button.file-delete-button')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('permission to delete file');
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('validates upload types and size and reports per-file upload failure', async () => {
    const request = requestFor();
    let resolveUpload!: (response: Response) => void;
    request.mockImplementation(path => path === '/admin/files?page=1&pageSize=10' ? Promise.resolve(pageResponse())
      : path === '/admin/files' ? new Promise(resolve => { resolveUpload = resolve; })
        : Promise.resolve(new Response(null, { status: 204 })));
    render(<FilesPage requestAdmin={request} permissions={['files.read', 'files.write']} />);
    fireEvent.click(await screen.findByRole('button', { name: '⬆ Upload' }));
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const valid = new File(['x'], 'ok.png', { type: 'image/png' });
    const invalid = new File(['x'], 'bad.txt', { type: 'text/plain' });
    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [valid, invalid, oversized] } });
    expect(screen.getByText(/Unsupported file type/)).toBeInTheDocument();
    expect(screen.getByText(/exceeds the 10 MB limit/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByText('Uploading…')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    resolveUpload(new Response('', { status: 400 }));
    expect(await screen.findByText(/Could not upload file.*400/)).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('opens image preview, zooms at cursor, pans, resets, and closes', async () => {
    const user = userEvent.setup();
    render(<FilesPage requestAdmin={requestFor()} permissions={['files.read']} />);
    await user.click(await screen.findByRole('button', { name: 'Preview banner' }));
    const dialog = screen.getByRole('dialog', { name: 'Image preview' });
    const box = dialog.querySelector('.files-lightbox-box')!;
    fireEvent.wheel(box, { deltaY: -100, clientX: 300, clientY: 250 });
    expect(await screen.findByText('115%')).toBeInTheDocument();
    fireEvent.pointerDown(box, { pointerId: 1, clientX: 300, clientY: 250 });
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 320, clientY: 270 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    expect(dialog.querySelector('img')?.getAttribute('style')).toContain('translate(');
    fireEvent.wheel(box, { deltaY: 1000, clientX: 300, clientY: 250 });
    expect(await screen.findByText('100%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).not.toBeInTheDocument();
  });
});
