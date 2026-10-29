import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MatchingPage } from './MatchingPage';
import type { AdminRequest, PendingMatching } from './matching-api';

const row: PendingMatching = {
  id: 12,
  name: 'Laptop source',
  brand: 'Acme',
  productId: null,
  createdAtUtc: '2026-10-29T00:00:00Z',
  isApproved: false,
  externalSku: 'SKU-12',
  dataSourceId: 4,
  candidates: [
    { productId: 71, name: 'Laptop product', brand: 'Acme', similarityScore: 0.9 },
    { productId: 72, name: 'Another laptop', brand: null, similarityScore: 0.42 },
  ],
};

const response = (body: unknown, status = 200) => Response.json(body, { status });
const renderPage = (requestAdmin: AdminRequest) => render(<MatchingPage requestAdmin={requestAdmin} />);

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('MatchingPage', () => {
  it('loads candidates in API order, selects locally, and approves only the selected product', async () => {
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(response([row]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(response([]));
    renderPage(requestAdmin);

    const firstCandidate = await screen.findByLabelText(/Laptop product/);
    const secondCandidate = screen.getByLabelText(/Another laptop/);
    expect(firstCandidate).not.toBeChecked();
    expect(secondCandidate).not.toBeChecked();
    expect(screen.getByText('90% tương đồng')).toBeInTheDocument();
    expect(screen.getByText('42% tương đồng')).toBeInTheDocument();

    fireEvent.click(secondCandidate);
    expect(requestAdmin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledTimes(3));
    expect(requestAdmin.mock.calls[1]).toEqual(['/admin/matching/12/approve', expect.objectContaining({
      method: 'POST', body: '{"productId":72}',
    })]);
    expect(await screen.findByText('Không có mục nào đang chờ duyệt')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Đã duyệt sản phẩm thành công');
  });

  it('keeps no-suitable-candidate local and leaves the pending row without a selection', async () => {
    const requestAdmin = vi.fn<AdminRequest>().mockResolvedValue(response([row]));
    renderPage(requestAdmin);
    fireEvent.click(await screen.findByLabelText(/Laptop product/));
    fireEvent.click(screen.getByRole('button', { name: 'Không có sản phẩm phù hợp' }));

    expect(await screen.findByRole('status')).toHaveTextContent('mục vẫn ở trạng thái chờ');
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeDisabled();
    expect(screen.getByText('Laptop source')).toBeInTheDocument();
    expect(requestAdmin).toHaveBeenCalledTimes(1);
  });

  it('clears a selection when refresh changes the candidate identity or score', async () => {
    const updatedRow = {
      ...row,
      candidates: [{ ...row.candidates[0], similarityScore: 0.75 }],
    };
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(response([row]))
      .mockResolvedValueOnce(response([updatedRow]));
    renderPage(requestAdmin);
    fireEvent.click(await screen.findByLabelText(/Laptop product/));
    fireEvent.click(screen.getByRole('button', { name: /Làm mới/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Duyệt' })).toBeDisabled());
    expect(screen.getByLabelText(/Laptop product/)).not.toBeChecked();
    expect(screen.getByText('75% tương đồng')).toBeInTheDocument();
  });

  it('retains the selected candidate after approval fails and allows retry', async () => {
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(response([row]))
      .mockResolvedValueOnce(new Response('', { status: 500 }));
    renderPage(requestAdmin);
    const candidate = await screen.findByLabelText(/Laptop product/);
    fireEvent.click(candidate);
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Lựa chọn của bạn vẫn được giữ');
    expect(candidate).toBeChecked();
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeEnabled();
    expect(requestAdmin).toHaveBeenCalledTimes(2);
  });

  it('shows a retryable queue error, then renders a pending item with no candidates', async () => {
    const emptyCandidates = { ...row, candidates: [] };
    const requestAdmin = vi.fn<AdminRequest>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(response([emptyCandidates]));
    renderPage(requestAdmin);

    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Không tìm thấy gợi ý phù hợp cho mục này.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Không có sản phẩm phù hợp' })).not.toBeInTheDocument();
  });
});
