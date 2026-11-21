// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminRequest } from '../bannedItemsApi';
import { createCountry, getActiveCountries, getCountries, updateCountry } from './countries-api';

const admin = vi.fn<AdminRequest>();
const response = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('countries API', () => {
  beforeEach(() => vi.clearAllMocks());
  it('reads the country items envelope and forwards the abort signal', async () => {
    const controller = new AbortController();
    admin.mockResolvedValueOnce(response({ items: [{ id: 1, code: 'VN', name: 'Vietnam', isActive: true }] }));
    await expect(getCountries(admin, controller.signal)).resolves.toEqual([{ id: 1, code: 'VN', name: 'Vietnam', isActive: true }]);
    expect(admin).toHaveBeenCalledWith('/admin/countries', { signal: controller.signal });
  });

  it('loads active countries from the central public country endpoint', async () => {
    const controller = new AbortController();
    admin.mockResolvedValueOnce(response({ items: [{ id: 2, code: 'ID', name: 'Indonesia' }] }));
    await expect(getActiveCountries(admin, controller.signal)).resolves.toEqual([{ id: 2, code: 'ID', name: 'Indonesia' }]);
    expect(admin).toHaveBeenCalledWith('/countries', { signal: controller.signal });
  });

  it('posts create and update contracts to the admin country endpoints', async () => {
    admin.mockResolvedValueOnce(response({ id: 2, code: 'ID', name: 'Indonesia', isActive: true }, 201));
    admin.mockResolvedValueOnce(response({ id: 2, code: 'ID', name: 'Indonesia', isActive: false }));
    const input = { code: 'ID', name: 'Indonesia', isActive: true };
    await createCountry(admin, input);
    await updateCountry(admin, 2, { ...input, isActive: false });
    expect(admin).toHaveBeenNthCalledWith(1, '/admin/countries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    expect(admin).toHaveBeenNthCalledWith(2, '/admin/countries/2', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, isActive: false }) });
  });

  it('uses the API conflict detail when a code is duplicated', async () => {
    admin.mockResolvedValueOnce(response({ detail: 'A Country with this code already exists.' }, 409));
    await expect(createCountry(admin, { code: 'VN', name: 'Vietnam', isActive: true })).rejects.toThrow('A Country with this code already exists.');
  });

  it('uses a useful fallback for empty server errors', async () => {
    admin.mockResolvedValueOnce(response({}, 500));
    await expect(getCountries(admin)).rejects.toThrow('Request failed (500). Please try again.');
  });

  it('reads validation arrays and title-only API errors', async () => {
    admin.mockResolvedValueOnce(response({ errors: { Code: ['Invalid code.', 42], Other: 'Name is required.' } }, 400));
    await expect(createCountry(admin, { code: 'X1', name: '', isActive: true })).rejects.toThrow('Invalid code. Name is required.');
    admin.mockResolvedValueOnce(response({ title: 'Country not found.' }, 404));
    await expect(updateCountry(admin, 404, { code: 'VN', name: 'Vietnam', isActive: true })).rejects.toThrow('Country not found.');
  });

  it('falls back to status-specific messages when the response is not JSON', async () => {
    admin.mockResolvedValueOnce(new Response('invalid json', { status: 403 }));
    await expect(getCountries(admin)).rejects.toThrow('You do not have permission to manage countries.');
    admin.mockResolvedValueOnce(response({}, 400));
    await expect(getCountries(admin)).rejects.toThrow('Country details are invalid. Check the code and name.');
    admin.mockResolvedValueOnce(response({}, 404));
    await expect(getCountries(admin)).rejects.toThrow('This country could not be found. Refresh the list and try again.');
    admin.mockResolvedValueOnce(response({}, 409));
    await expect(getCountries(admin)).rejects.toThrow('This country code is already in use or the country is referenced by catalog data.');
  });

  it('supports no-content mutation responses', async () => {
    admin.mockResolvedValueOnce(response({}, 204));
    await expect(updateCountry(admin, 3, { code: 'SG', name: 'Singapore', isActive: true })).resolves.toBeUndefined();
  });
});
