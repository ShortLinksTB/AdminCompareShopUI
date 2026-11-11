import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioReference } from './StudioReference';

afterEach(cleanup);

describe('Studio component reference', () => {
  it('shows the documented shared component examples', () => {
    const { container } = render(<StudioReference />);
    expect(screen.getByRole('heading', { name: 'Studio components' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Data table and pager' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show lightbox' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading preview' })).toBeInTheDocument();
    fireEvent.click(container.querySelector('.studio-row-menu summary')!);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    expect(screen.getByRole('button', { name: 'Copy API' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByRole('dialog', { name: 'Component details' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
  });

  it('demonstrates filter, search, paging, and switch interactions', () => {
    render(<StudioReference />);
    fireEvent.click(screen.getByRole('button', { name: 'Active 18' }));
    expect(screen.getByRole('button', { name: 'Active 18' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'drawer' } });
    expect(screen.getByRole('searchbox')).toHaveValue('drawer');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    const enabled = screen.getByRole('switch', { name: 'Enabled' });
    fireEvent.click(enabled);
    expect(enabled).not.toBeChecked();
  });

  it('opens and closes the modal, drawer, toast, and lightbox samples', () => {
    render(<StudioReference />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Retry requested')).toHaveClass('studio-toast');
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    const modal = screen.getByRole('dialog', { name: 'Studio dialog' });
    fireEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    const toast = screen.getByText('Saved');
    expect(toast).toHaveClass('studio-toast');
    fireEvent.click(toast);
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(screen.queryByRole('dialog', { name: 'Component details' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show lightbox' }));
    const lightbox = screen.getByRole('dialog', { name: 'Image preview' });
    expect(within(lightbox).getByRole('img', { name: 'Studio lightbox sample' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).not.toBeInTheDocument();
  });
});
