import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PriceAlertsPage } from './PriceAlertsPage';

afterEach(cleanup);

describe('PriceAlertsPage', () => {
  it('renders the Studio summary and preserves the existing alert table content', () => {
    render(<PriceAlertsPage />);

    expect(screen.getByRole('heading', { name: 'Price Alerts' })).toBeInTheDocument();
    expect(screen.getByText('Theo dõi các alert và trạng thái thông báo đến người dùng.')).toBeInTheDocument();
    expect(screen.getByText('8,420')).toBeInTheDocument();
    expect(screen.getByText('+8.6%')).toBeInTheDocument();
    expect(screen.getByText('186')).toBeInTheDocument();
    expect(screen.getByText('99.1%')).toBeInTheDocument();

    const table = screen.getByRole('region', { name: 'Price alerts' });
    expect(within(table).getAllByRole('row')).toHaveLength(6);
    expect(within(table).getByText('iPhone 15 128GB')).toBeInTheDocument();
    expect(within(table).getByText(/18\.190\.000/)).toBeInTheDocument();
    expect(within(table).getByText('Hôm nay, 09:20')).toBeInTheDocument();
    expect(within(table).getAllByText('Active')).toHaveLength(4);
    expect(within(table).getByText('Pending')).toBeInTheDocument();
    expect(within(table).getByText('Notifications: Email & push')).toBeInTheDocument();

    const states = screen.getByRole('region', { name: 'Price alert state examples' });
    expect(within(states).getByRole('status', { name: 'Price alerts are loading' })).toBeInTheDocument();
    expect(within(states).getByText('No price alerts available.')).toBeInTheDocument();
    expect(within(states).getByRole('alert')).toHaveTextContent('Could not load price alerts.');
    expect(within(states).queryByRole('button')).not.toBeInTheDocument();
  });
});
