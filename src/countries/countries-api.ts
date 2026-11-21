import type { AdminRequest } from '../bannedItemsApi';

export interface Country { id: number; code: string; name: string; isActive: boolean }
export interface ActiveCountry { id: number; code: string; name: string }
export interface CountryInput { code: string; name: string; isActive: boolean }

export class CountriesApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'CountriesApiError'; }
}

async function requestAt<T>(admin: AdminRequest, path: string, init?: RequestInit): Promise<T> {
  const response = await admin(path, init);
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json() as { detail?: unknown; message?: unknown; title?: unknown; errors?: Record<string, unknown> };
      const value = body.detail ?? body.message;
      if (typeof value === 'string') message = value;
      else if (body.errors) message = Object.values(body.errors).flatMap(item => Array.isArray(item) ? item : [item]).filter((item): item is string => typeof item === 'string').join(' ') || (typeof body.title === 'string' ? body.title : message);
      else if (typeof body.title === 'string') message = body.title;
    } catch { /* Keep the HTTP status message when the response has no JSON body. */ }
    if (!message.startsWith('Request failed')) throw new CountriesApiError(message, response.status);
    const fallback = response.status === 409 ? 'This country code is already in use or the country is referenced by catalog data.'
      : response.status === 400 ? 'Country details are invalid. Check the code and name.'
        : response.status === 401 || response.status === 403 ? 'You do not have permission to manage countries.'
          : response.status === 404 ? 'This country could not be found. Refresh the list and try again.'
            : `Request failed (${response.status}). Please try again.`;
    throw new CountriesApiError(fallback, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function request<T>(admin: AdminRequest, path: string, init?: RequestInit): Promise<T> {
  return requestAt(admin, `/admin/countries${path}`, init);
}

export async function getCountries(admin: AdminRequest, signal?: AbortSignal): Promise<Country[]> {
  const result = await request<{ items: Country[] }>(admin, '', { signal });
  return result.items;
}

export async function getActiveCountries(admin: AdminRequest, signal?: AbortSignal): Promise<ActiveCountry[]> {
  const result = await requestAt<{ items: ActiveCountry[] }>(admin, '/countries', { signal });
  return result.items;
}

export function createCountry(admin: AdminRequest, input: CountryInput): Promise<Country> {
  return request(admin, '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
}

export function updateCountry(admin: AdminRequest, id: number, input: CountryInput): Promise<Country> {
  return request(admin, `/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
}
