import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { DataSourcesPage } from './DataSourcesPage';

afterEach(cleanup);

describe('Data Sources page', () => {
  it('shows the existing source cards, fields, statuses, and actions', () => {
    render(<DataSourcesPage />);

    expect(screen.getByRole('heading', { name: 'Data Sources' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add source' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Data Sources' })).toBeInTheDocument();

    const cellphone = screen.getByRole('region', { name: 'CellphoneS API' });
    expect(within(cellphone).getByText('CellphoneS')).toBeInTheDocument();
    expect(within(cellphone).getByText('Every 15 min')).toBeInTheDocument();
    expect(within(cellphone).getByText('Connected')).toBeInTheDocument();
    expect(within(cellphone).getByText('2 phút trước')).toBeInTheDocument();
    expect(within(cellphone).getByRole('button', { name: 'Configure' })).toBeInTheDocument();
    expect(within(cellphone).getByRole('button', { name: 'Run sync' })).toBeInTheDocument();

    const shopee = screen.getByRole('region', { name: 'Shopee Affiliate Feed' });
    expect(within(shopee).getByText('Shopee Mall')).toBeInTheDocument();
    expect(within(shopee).getByText('Every 1 hour')).toBeInTheDocument();
    expect(within(shopee).getByText('8 phút trước')).toBeInTheDocument();

    const techmart = screen.getByRole('region', { name: 'TechMart Products' });
    expect(within(techmart).getByText('Manual upload')).toBeInTheDocument();
    expect(within(techmart).getByText('Expired')).toBeInTheDocument();
    expect(within(techmart).getByText('Failed')).toBeInTheDocument();
    expect(within(techmart).getByText('3 giờ trước')).toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refresh|làm mới/i })).not.toBeInTheDocument();
  });
});
