import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DerivativeModal } from './DerivativeModal';
import type { AdminFile } from './files-api';
import type { AdminRequest } from '../products/products-api';

const source: AdminFile = { id: 'source', originalFileName: 'wide-banner.jpg', contentType: 'image/jpeg', sizeBytes: 1200, width: 1600, height: 900, uploadedBy: 'Andy', uploadedAtUtc: '2026-11-10T10:00:00Z' };
const rect = (width = 400, height = 320) => ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }) as DOMRect;
let drawImage: ReturnType<typeof vi.fn>;
let stageRect = rect();
let resizeCallbacks: Array<() => void> = [];

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture'); });

function renderEditor(request = vi.fn<AdminRequest>().mockResolvedValue(Response.json({ results: [{ success: true, file: { ...source, id: 'result', originalFileName: 'wide-banner-600x600.webp', warnings: ['GIF first frame'] } }] })), dimensions = { width: 800, height: 500 }) {
  drawImage = vi.fn();
  stageRect = rect(); resizeCallbacks = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn(), fillRect: vi.fn(), drawImage, imageSmoothingQuality: '' } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) { return this.classList?.contains('derivative-stage') ? stageRect : rect(0, 0); });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
  class FakeResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}
    observe() { resizeCallbacks.push(() => this.callback([], this as unknown as ResizeObserver)); }
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  class FakeImage {
    naturalWidth = dimensions.width;
    naturalHeight = dimensions.height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  }
  vi.stubGlobal('Image', FakeImage);
  const onClose = vi.fn(), onCreated = vi.fn();
  render(<DerivativeModal file={source} requestAdmin={request} existingFiles={[]} onClose={onClose} onCreated={onCreated} />);
  return { request, onClose, onCreated };
}

describe('DerivativeModal', () => {
  it('renders output preview and supports zoom, crop, contain backgrounds, custom dimensions, and format options', async () => {
    const request = vi.fn<AdminRequest>().mockImplementation((_path, init) => {
      const variants = JSON.parse(String(init?.body)).variants as Array<{ name: string }>;
      return Promise.resolve(Response.json({ results: variants.map((variant, index) => ({ success: true, file: { ...source, id: `result-${index}`, originalFileName: `${variant.name}.webp`, warnings: ['generated warning'] } })) }));
    });
    const { onClose, onCreated } = renderEditor(request);
    const stage = screen.getByLabelText(/Cuộn để zoom tại con trỏ/);
    await waitFor(() => expect(drawImage).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent(/Ảnh gốc 800×500/);
    expect((document.querySelector('canvas') as HTMLCanvasElement).width).toBe(600);

    fireEvent.wheel(stage, { deltaY: -300, clientX: 200, clientY: 160 });
    expect(document.querySelector('.derivative-zoom-badge')).toHaveTextContent('%');
    fireEvent.click(screen.getByRole('button', { name: '✋ Di chuyển' }));
    fireEvent.pointerDown(stage, { pointerId: 2, button: 0, clientX: 200, clientY: 150 });
    fireEvent.pointerMove(stage, { pointerId: 2, clientX: 220, clientY: 165 });
    fireEvent.pointerUp(stage, { pointerId: 2 });
    fireEvent.click(screen.getByRole('button', { name: '✥ Vùng cắt' }));
    fireEvent.keyDown(stage, { key: '+' });
    fireEvent.doubleClick(stage, { clientX: 190, clientY: 150 });
    fireEvent.pointerDown(stage, { pointerId: 1, button: 0, clientX: 200, clientY: 150 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 230, clientY: 155 });
    fireEvent.pointerUp(stage, { pointerId: 1 });
    expect(drawImage).toHaveBeenCalled();

    await screen.findByRole('checkbox', { name: /Tuỳ chọn/ });
    fireEvent.click(screen.getByRole('checkbox', { name: /Tuỳ chọn/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Rộng' }), { target: { value: '4001' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/số nguyên từ 16 đến 4000/);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Rộng' }), { target: { value: '1200' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Cao' }), { target: { value: '800' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /1000 × 1000 px/ }));
    fireEvent.click(screen.getByRole('button', { name: '1000x1000' }));

    fireEvent.click(screen.getByRole('button', { name: 'Giữ nguyên ảnh + nền' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nền trong suốt' }));
    expect(screen.getByRole('group', { name: 'Nền' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Định dạng' }), { target: { value: 'webp' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Chất lượng' }), { target: { value: '80' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Tên gốc' }), { target: { value: 'custom-name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo 3 bản sao' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/files/source/derivatives', expect.objectContaining({ method: 'POST' })));
    const payload = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(payload.variants).toHaveLength(3);
    expect(payload.variants[0]).toMatchObject({ fit: 'contain', background: 'transparent', format: 'webp', quality: 80, name: 'custom-name-600x600' });
    expect(payload.variants[0]).not.toHaveProperty('focalX');
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.querySelector('.derivative-result-success')).toHaveTextContent('generated warning');
    expect(screen.getByRole('link', { name: 'Mở file mới' })).toHaveAttribute('href', expect.stringContaining('/files/result-1'));
  }, 30000);

  it('keeps request failures retryable and maps a server validation error', async () => {
    const request = vi.fn<AdminRequest>()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(Response.json({ results: [{ success: false, errorCode: 'invalid_dimensions' }] }));
    renderEditor(request);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo 1 bản sao' }));
    expect(await screen.findByText('600x600: network unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('600x600: Kích thước phải từ 16 đến 4000 px.')).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('separates fit from 100%, anchors zoom at the cursor, resets on output switch, and preserves zoom on resize', async () => {
    renderEditor(undefined, { width: 1000, height: 1000 });
    let badge = document.querySelector('.derivative-zoom-badge')!;
    expect(screen.getByRole('button', { name: '✥ Vùng cắt' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /1000 × 1000 px/ }));
    await waitFor(() => expect(resizeCallbacks.length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: '1000x1000' }));
    const stage = screen.getByLabelText(/Cuộn để zoom tại con trỏ/);
    badge = document.querySelector('.derivative-zoom-badge')!;
    fireEvent.click(screen.getByRole('button', { name: '100%' }));
    expect(badge).toHaveTextContent('100%');
    fireEvent.click(screen.getByRole('button', { name: 'Vừa khung' }));
    expect(Number.parseInt(badge.textContent || '0', 10)).toBeLessThan(100);
    fireEvent.click(screen.getByRole('button', { name: '100%' }));

    fireEvent.wheel(stage, { deltaY: -100, clientX: 170, clientY: 140 });
    const transform = (document.querySelector('canvas') as HTMLCanvasElement).style.transform;
    const [, xValue, scaleValue] = transform.match(/calc\(-50% \+ ([\d.-]+)px\).*scale\(([\d.]+)\)/) ?? [];
    const scale = Number(scaleValue), offsetX = Number(xValue);
    expect((-30 - offsetX) / scale).toBeCloseTo(-30, 2);

    const zoomBeforeResize = badge.textContent;
    stageRect = rect(500, 400);
    act(() => resizeCallbacks.at(-1)?.());
    expect(badge.textContent).toBe(zoomBeforeResize);

    fireEvent.click(screen.getByRole('button', { name: '600x600' }));
    badge = document.querySelector('.derivative-zoom-badge')!;
    await waitFor(() => expect(Number.parseInt(badge.textContent || '0', 10)).toBeLessThan(100));
  });
});
