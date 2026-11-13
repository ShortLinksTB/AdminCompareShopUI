import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { AnalyticsPage } from './AnalyticsPage';

afterEach(cleanup);

describe('AnalyticsPage', () => {
  it('renders the Analytics hierarchy, existing KPI copy, and date range control', () => {
    render(<AnalyticsPage />);

    expect(screen.getByRole('heading', { name: 'Analytics & Revenue', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Theo dõi view, click, conversion và revenue đã đối soát.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Khoảng thời gian' })).toHaveValue('Last 30 days');
    expect(screen.getByRole('region', { name: 'Chỉ số Analytics' })).toBeInTheDocument();
    for (const value of ['1.24M', '84.2K', '3.84%', '₫482M']) expect(screen.getByText(value)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Clicks & conversion' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Top products' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Revenue by partner shop' })).toBeInTheDocument();
  });

  it('keeps clicks and conversion on separate labeled scales with keyboard reachable tooltips', () => {
    render(<AnalyticsPage />);

    expect(screen.getByText('lượt click / ngày · thang 0–8k')).toBeInTheDocument();
    expect(screen.getByText('tỷ lệ / ngày (%) · thang 0–4%')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Affiliate clicks' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Conversion rate' })).toBeInTheDocument();
    const lastClickBar = document.querySelector('.analytics-bar-plot rect:last-child');
    const lastConversionPoint = document.querySelector('.analytics-line-plot circle:last-child');
    expect(lastClickBar).toHaveAttribute('tabindex', '0');
    expect(lastClickBar?.querySelector('title')).toHaveTextContent('Nov 13 · 7,800 lượt click');
    expect(lastConversionPoint).toHaveAttribute('tabindex', '0');
    expect(lastConversionPoint?.querySelector('title')).toHaveTextContent('Nov 13 · 3.84%');
    expect(screen.getAllByText('Affiliate clicks').length).toBeGreaterThan(1);
  });

  it('provides alternate data tables for the chart and reconciled partner revenue', () => {
    render(<AnalyticsPage />);

    const alternateTables = screen.getAllByText('Bảng dữ liệu thay thế cho biểu đồ');
    fireEvent.click(alternateTables[0]);
    expect(screen.getByRole('columnheader', { name: 'Conversion rate' })).toBeInTheDocument();
    expect(screen.getByText('7.800 lượt click')).toBeInTheDocument();

    fireEvent.click(alternateTables[1]);
    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(2);
    expect(within(tables[1]).getByRole('columnheader', { name: 'Revenue đã đối soát' })).toBeInTheDocument();
    expect(within(tables[1]).getByText('₫184.000.000')).toBeInTheDocument();
  });

  it('preserves the existing top product ranking and partner offer values', () => {
    render(<AnalyticsPage />);

    const topProducts = screen.getByRole('list');
    expect(within(topProducts).getAllByRole('listitem')).toHaveLength(5);
    expect(within(topProducts).getByText('iPhone 15 128GB')).toBeInTheDocument();
    expect(within(topProducts).getByText('MacBook Air M3 13 inch')).toBeInTheDocument();
    expect(screen.getByText('2,380 active offers')).toBeInTheDocument();
    expect(within(document.querySelector('.analytics-revenue-list') as HTMLElement).getByText('Tiki')).toBeInTheDocument();
    expect(screen.getByText('₫184.0M')).toBeInTheDocument();
  });

  it('exposes the approved loading, error, and empty chart states in the design reference', () => {
    render(<AnalyticsPage />);

    fireEvent.click(screen.getByText('Trạng thái biểu đồ · tham chiếu thiết kế'));
    expect(screen.getByText('Loading data…')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load analytics.');
    expect(screen.getByText('No analytics data')).toBeInTheDocument();
  });
});
