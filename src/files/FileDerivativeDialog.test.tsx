import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { FileDerivativeDialog } from './FileDerivativeDialog';
import type { AdminFile } from './files-api';
import type { AdminRequest } from '../products/products-api';

const file: AdminFile = { id: 'source', originalFileName: 'wide.png', contentType: 'image/png', sizeBytes: 1000, width: 600, height: 300, uploadedBy: 'Andy', uploadedAtUtc: '2026-11-15T00:00:00Z' };
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('FileDerivativeDialog', () => {
  it('renders crop previews, controls viewport separately, and submits only crop focal values', async () => {
    class MockImage {
      naturalWidth = 600; naturalHeight = 300; width = 600; height = 300; crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', MockImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn(), fillRect: vi.fn(), clearRect: vi.fn(), set imageSmoothingQuality(_value: ImageSmoothingQuality) {} } as unknown as CanvasRenderingContext2D);
    const request = vi.fn<AdminRequest>().mockResolvedValue(Response.json([{ index: 0, file: { ...file, id: 'new' }, publicUrl: '/files/new', warnings: [] }]));
    const onClose = vi.fn(); const onCreated = vi.fn(); const user = userEvent.setup();
    render(<FileDerivativeDialog file={file} requestAdmin={request} onClose={onClose} onCreated={onCreated} />);
    expect(await screen.findByText('600 × 600 px · Trang chủ')).toBeInTheDocument();
    await waitFor(() => expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled());
    expect(screen.getByText(/Ảnh gốc nhỏ hơn kích thước đích/)).toBeInTheDocument();
    const stage = screen.getByLabelText(/Xem trước\. Cuộn chuột/);
    fireEvent.wheel(stage, { deltaY: -400, clientX: 200, clientY: 150 });
    expect(await screen.findByText(/190\s*%/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '✋ Di chuyển' }));
    fireEvent.pointerDown(stage, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 120, clientY: 110 });
    fireEvent.pointerUp(stage, { pointerId: 1 });
    fireEvent.keyDown(stage, { key: '0' });
    expect((await screen.findAllByText('100%')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Giữ nguyên ảnh + nền' }));
    await user.click(screen.getByRole('button', { name: 'Nền transparent' }));
    await user.selectOptions(screen.getByLabelText('Định dạng'), 'png');
    await user.selectOptions(screen.getByLabelText('Chất lượng'), '80');
    await user.clear(screen.getByDisplayValue('wide')); await user.type(screen.getByDisplayValue(''), 'custom-name');
    await user.click(screen.getByRole('button', { name: 'Tạo bản sao' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(true));
    const body = JSON.parse(request.mock.calls[0][1]?.body as string);
    expect(body.variants[0]).not.toHaveProperty('focalX');
    expect(body.variants[0]).toEqual(expect.objectContaining({ fit: 'contain', background: 'transparent', format: 'png', quality: 80, name: 'custom-name-600x600' }));
  });

  it('allows custom sizes and keeps partial failures retryable', async () => {
    const request = vi.fn<AdminRequest>().mockResolvedValueOnce(Response.json([{ index: 0, error: 'processing_failed', warnings: [] }, { index: 1, file: { id: 'made' }, warnings: [] }])).mockResolvedValueOnce(Response.json([{ index: 0, file: { id: 'retry-made' }, warnings: [] }]));
    const onCreated = vi.fn(); const user = userEvent.setup();
    render(<FileDerivativeDialog file={{ ...file, width: 1000, height: 1000 }} requestAdmin={request} onClose={vi.fn()} onCreated={onCreated} />);
    await user.click(screen.getByRole('checkbox', { name: /Tuỳ chọn/ }));
    await user.clear(screen.getByLabelText('Rộng')); await user.type(screen.getByLabelText('Rộng'), '4001');
    expect(screen.getByText('Kích thước tuỳ chọn phải từ 16 đến 4000 px.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Rộng')); await user.type(screen.getByLabelText('Rộng'), '800');
    await user.click(screen.getByRole('button', { name: 'Tạo 2 bản sao' }));
    await waitFor(() => expect(screen.getByText(/processing_failed/)).toBeInTheDocument());
    expect(onCreated).toHaveBeenCalledWith(false);
    await user.click(screen.getAllByRole('button', { name: 'Thử lại' })[0]);
    await waitFor(() => expect(onCreated).toHaveBeenLastCalledWith(true));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('renders nothing without a source and reports a request exception', async () => {
    const request = vi.fn<AdminRequest>().mockRejectedValue(new Error('offline'));
    const { rerender } = render(<FileDerivativeDialog file={null} requestAdmin={request} onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(<FileDerivativeDialog file={file} requestAdmin={request} onClose={vi.fn()} onCreated={vi.fn()} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Tạo bản sao' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
  });
});
