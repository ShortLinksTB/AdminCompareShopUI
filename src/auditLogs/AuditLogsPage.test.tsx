import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { AuditLogsPage } from './AuditLogsPage';

afterEach(cleanup);

const entry = {
  id: 'entry-1', actor: 'f17177f9-bebf-48e8-a7ed-6d9164703b9a', action: 'role_assignment.updated',
  resourceType: 'user', resourceId: null, createdAtUtc: '2026-11-04T10:00:00', before: null, after: { roles: ['admin'] },
};

describe('AuditLogsPage', () => {
  it('loads real API data, preserves full actor and UTC, and expands initially collapsed JSON', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [entry], pageNumber: 1, pageSize: 50, totalItems: 1 }), { status: 200 }));
    render(<AuditLogsPage requestAdmin={request} />);

    expect(screen.getByRole('status', { name: 'Loading audit logs' })).toBeInTheDocument();
    expect(await screen.findByText(entry.actor)).toBeInTheDocument();
    expect(screen.getByText('10:00:00 04/11/2026 UTC')).toBeInTheDocument();
    expect(screen.queryByText('Result')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    const details = screen.getByText('View Before/After JSON').closest('details');
    expect(details).not.toHaveAttribute('open');
    const disclosure = screen.getByText('View Before/After JSON');
    await userEvent.tab();
    expect(disclosure).toHaveFocus();
    fireEvent.click(disclosure);
    expect(details).toHaveAttribute('open');
    expect(within(details as HTMLElement).getByText('After').parentElement).toHaveTextContent(/roles/);
    expect(within(details as HTMLElement).getByText('Before').parentElement).toHaveTextContent('null');
    expect(screen.getByText(/1–1 of 1 records · page 1\/1/)).toBeInTheDocument();
  });

  it('shows a successful empty state and uses the returned page for navigation', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [entry], pageNumber: 1, pageSize: 1, totalItems: 2 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], pageNumber: 2, pageSize: 1, totalItems: 2 }), { status: 200 }));
    render(<AuditLogsPage requestAdmin={request} />);
    expect(await screen.findByText(entry.actor)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(request).toHaveBeenLastCalledWith('/admin/audit-logs?page=2&pageSize=50', expect.any(Object)));
    expect(await screen.findByText('No audit logs found.')).toBeInTheDocument();
    expect(screen.getByText(/0–0 of 2 records · page 2\/2/)).toBeInTheDocument();
  });

  it('offers retry after a failed request', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], pageNumber: 1, pageSize: 50, totalItems: 0 }), { status: 200 }));
    render(<AuditLogsPage requestAdmin={request} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('status 500');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No audit logs found.')).toBeInTheDocument();
  });
});
