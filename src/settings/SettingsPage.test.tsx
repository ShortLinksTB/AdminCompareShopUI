import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsPage } from './SettingsPage';

afterEach(cleanup);

describe('SettingsPage', () => {
  it('renders the wireframe sections, all existing settings and defaults', () => {
    render(<SettingsPage />);

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Data quality' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Product display currency' })).toHaveValue('VND');
    expect(screen.getByRole('combobox', { name: 'Default timezone' })).toHaveValue('Asia/Ho_Chi_Minh');
    expect(screen.getByRole('combobox', { name: 'Stale offer threshold' })).toHaveValue('24');
    expect(screen.getByRole('switch', { name: 'Outlier detection' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Auto matching suggestions' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Notify failed sync' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save settings' })).toHaveClass('studio-button-primary');
  });

  it('keeps each data quality switch independently keyboard operable', () => {
    render(<SettingsPage />);
    const outlier = screen.getByRole('switch', { name: 'Outlier detection' });
    const matching = screen.getByRole('switch', { name: 'Auto matching suggestions' });
    const failedSync = screen.getByRole('switch', { name: 'Notify failed sync' });

    fireEvent.click(outlier);
    fireEvent.click(matching);
    fireEvent.click(failedSync);

    expect(outlier).not.toBeChecked();
    expect(matching).not.toBeChecked();
    expect(failedSync).not.toBeChecked();
  });
});
