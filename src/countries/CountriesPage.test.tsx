// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { CountriesPage } from './CountriesPage';
import type { AdminRequest } from '../bannedItemsApi';
import type { Country } from './countries-api';

const api = vi.hoisted(() => ({ getCountries: vi.fn(), createCountry: vi.fn(), updateCountry: vi.fn() }));
vi.mock('./countries-api', async () => ({ ...await vi.importActual<typeof import('./countries-api')>('./countries-api'), ...api }));

const countries: Country[] = [
  { id: 1, code: 'ID', name: 'Indonesia', isActive: true },
  { id: 2, code: 'VN', name: 'Vietnam', isActive: true },
];
const requestAdmin: AdminRequest = vi.fn();
const renderPage = (permissions = ['countries.read', 'countries.manage']) => render(<CountriesPage requestAdmin={requestAdmin} permissions={permissions} />);

describe('Countries page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getCountries.mockResolvedValue(countries);
    api.createCountry.mockResolvedValue({ id: 3, code: 'SG', name: 'Singapore', isActive: true });
    api.updateCountry.mockImplementation(async (_admin, id, input) => ({ id, ...input }));
  });
  afterEach(() => cleanup());

  it('keeps the approved page header without an extra explanatory paragraph', async () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Countries' })).toBeInTheDocument();
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByText(/single source of truth for catalog assignment/)).not.toBeInTheDocument();
  });

  it('shows loading then the Code, Name, Active, and Edit list from the API', async () => {
    let resolve!: (items: Country[]) => void;
    api.getCountries.mockReturnValueOnce(new Promise<Country[]>(done => { resolve = done; }));
    renderPage();
    expect(screen.getByRole('status', { name: 'Loading countries' })).toBeInTheDocument();
    resolve(countries);
    expect(await screen.findByText('Indonesia')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Code' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Active ID' })).toBeChecked();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: '+ Add country' })).toBeInTheDocument();
  });

  it('creates a normalized country from the Add country modal', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '+ Add country' }));
    expect(screen.getByRole('dialog', { name: 'Add country' })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Code/), 'sg');
    await user.type(screen.getByLabelText('Name'), ' Singapore ');
    await user.click(screen.getByRole('button', { name: 'Save country' }));
    await waitFor(() => expect(api.createCountry).toHaveBeenCalledWith(requestAdmin, { code: 'SG', name: 'Singapore', isActive: true }));
    expect(await screen.findByRole('status')).toHaveTextContent('SG created.');
    expect(api.getCountries).toHaveBeenCalledTimes(2);
  });

  it('validates an incomplete code before sending a create request', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '+ Add country' }));
    await user.type(screen.getByLabelText(/^Code/), 'I');
    await user.type(screen.getByLabelText('Name'), 'India');
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Code must be exactly 2 letters');
    expect(api.createCountry).not.toHaveBeenCalled();
  });

  it('locks Code while editing and submits only the existing code with changed values', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findAllByRole('button', { name: 'Edit' }).then(buttons => buttons[0]));
    expect(screen.getByRole('dialog', { name: 'Edit country' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Code/)).toBeDisabled();
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Republic of Indonesia');
    await user.click(screen.getByRole('button', { name: 'Save country' }));
    await waitFor(() => expect(api.updateCountry).toHaveBeenCalledWith(requestAdmin, 1, { code: 'ID', name: 'Republic of Indonesia', isActive: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the country toggle unchanged until the API save succeeds', async () => {
    const user = userEvent.setup();
    let resolve!: (country: Country) => void;
    api.updateCountry.mockReturnValueOnce(new Promise<Country>(done => { resolve = done; }));
    renderPage();
    const toggle = await screen.findByRole('switch', { name: 'Active ID' });
    await user.click(toggle);
    expect(toggle).toBeChecked();
    resolve({ ...countries[0], isActive: false });
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Active ID' })).not.toBeChecked());
    expect(screen.getByRole('status')).toHaveTextContent('Indonesia deactivated.');
    expect(api.updateCountry).toHaveBeenCalledWith(requestAdmin, 1, { code: 'ID', name: 'Indonesia', isActive: false });
  });

  it('reports toggle failures without changing the country state', async () => {
    const user = userEvent.setup();
    api.updateCountry.mockRejectedValueOnce('network unavailable');
    renderPage();
    const toggle = await screen.findByRole('switch', { name: 'Active ID' });
    await user.click(toggle);
    expect(await screen.findByRole('status')).toHaveTextContent('Could not update country status.');
    expect(screen.getByRole('switch', { name: 'Active ID' })).toBeChecked();
  });

  it('allows changing the initial Active value in the create form and cancelling it', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '+ Add country' }));
    const active = screen.getByRole('switch', { name: 'Country active' });
    expect(active).toBeChecked();
    await user.click(active);
    expect(active).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('retains form values and reports server validation errors', async () => {
    const user = userEvent.setup();
    api.createCountry.mockRejectedValueOnce(new Error('A Country with this code already exists.'));
    renderPage();
    await user.click(await screen.findByRole('button', { name: '+ Add country' }));
    await user.type(screen.getByLabelText(/^Code/), 'id');
    await user.type(screen.getByLabelText('Name'), 'Indonesia');
    await user.click(screen.getByRole('button', { name: 'Save country' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A Country with this code already exists.');
    expect(screen.getByLabelText(/^Code/)).toHaveValue('ID');
    expect(screen.getByLabelText('Name')).toHaveValue('Indonesia');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('offers retry after load errors and shows the empty state after a successful empty response', async () => {
    const user = userEvent.setup();
    api.getCountries.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline again')).mockResolvedValueOnce([]);
    renderPage();
    expect(await screen.findByText('offline')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('offline again')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No countries yet')).toBeInTheDocument();
  });

  it('keeps read-only access without create, edit, or toggle controls', async () => {
    renderPage(['countries.read']);
    expect(await screen.findByText('Indonesia')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add country' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Active ID' })).toBeDisabled();
  });
});
