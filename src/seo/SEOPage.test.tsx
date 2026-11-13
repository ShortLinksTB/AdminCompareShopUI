import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SEOPage } from './SEOPage';

afterEach(cleanup);

describe('SEOPage', () => {
  it('renders the existing SEO copy, route fields, and row actions', () => {
    render(<SEOPage />);

    expect(screen.getByRole('heading', { name: 'SEO Management' })).not.toBeNull();
    expect(screen.getByText('Metadata, canonical and index status cho các route public.')).not.toBeNull();
    const table = within(screen.getByLabelText('SEO rules, scroll horizontally')).getByRole('table');
    expect(within(table).getByText('/product/iphone-15-128gb')).not.toBeNull();
    expect(within(table).getByText('iPhone 15 128GB - Giá tốt nhất')).not.toBeNull();
    expect(within(table).getAllByText('Self canonical')).toHaveLength(2);
    expect(within(table).getAllByRole('button', { name: 'Edit' })).toHaveLength(3);
    expect(screen.getByText('Showing 3 routes')).not.toBeNull();
  });

  it('filters routes by route or keyword and shows an accessible empty result', () => {
    render(<SEOPage />);
    const search = screen.getByRole('searchbox', { name: 'Search route or keyword' });

    fireEvent.change(search, { target: { value: 'laptop' } });
    expect(screen.getByText('/category/laptop')).not.toBeNull();
    expect(screen.queryByText('/blog')).toBeNull();
    expect(screen.getByText('Showing 1 route')).not.toBeNull();

    fireEvent.change(search, { target: { value: 'no matching route' } });
    expect(screen.getByText('No routes match the search.')).not.toBeNull();
    expect(screen.getByText('Showing 0 routes')).not.toBeNull();
  });

  it('exposes the documented loading, empty, and error layout references', () => {
    render(<SEOPage />);
    fireEvent.click(screen.getByText('Layout state references'));

    const references = screen.getByText('Layout state references').parentElement;
    expect(references?.textContent).toContain('Table skeleton rows while routes are loading.');
    expect(references?.textContent).toContain('Could not load SEO routes. Retry control follows the shared Button pattern.');
  });

  it('renders an announced loading state while routes load', () => {
    render(<SEOPage loading />);

    expect(screen.getByRole('status', { name: 'Loading SEO routes' })).not.toBeNull();
    expect(screen.getByText('Loading routes...')).not.toBeNull();
    expect(screen.queryByText('/blog')).toBeNull();
  });

  it('renders the error and retries only through the supplied callback', () => {
    let retries = 0;
    render(<SEOPage error="Could not load SEO routes." onRetry={() => { retries += 1; }} />);

    expect(screen.getByRole('alert').textContent).toContain('Could not load SEO routes.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retries).toBe(1);
  });
});
