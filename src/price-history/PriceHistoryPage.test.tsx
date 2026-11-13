import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PriceHistory } from './PriceHistoryPage';

afterEach(cleanup);

describe('PriceHistory', () => {
  it('renders the existing header, controls, trend and price history records', () => {
    render(<PriceHistory />);

    expect(screen.getByRole('heading', { name: 'Price History' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '⇩ Export report' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search product' })).toHaveAttribute('placeholder', 'Search product...');
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '☷ Filters' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '⇩ Export' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Price trend over six months' })).toBeInTheDocument();

    const records = screen.getByRole('region', { name: 'Price history records' });
    expect(within(records).getAllByRole('row')).toHaveLength(4);
    expect(within(records).getByText('Shopee Mall')).toBeInTheDocument();
    expect(within(records).getByText('₫18.490.000')).toBeInTheDocument();
    expect(within(records).getByText('+₫300.000')).toBeInTheDocument();
    expect(within(records).getByText('Promotion')).toBeInTheDocument();
    expect(within(records).getByText('3 price records')).toBeInTheDocument();
  });
});
