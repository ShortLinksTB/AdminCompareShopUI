import type { AdminRequest } from '../bannedItemsApi';

export type DataSourceState = 'Active' | 'Paused' | 'Error';

export interface DataSource {
  id: string;
  key: string;
  displayName: string;
  categoryPath: string;
  partnerShopId: number | null;
  partnerShopDisplayName: string | null;
  state: DataSourceState;
  intervalHours: number;
  createdAtUtc: string;
  lastCompletedAtUtc: string | null;
  nextAttemptAtUtc: string | null;
}

export class DataSourcesApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'DataSourcesApiError';
  }
}

const states: DataSourceState[] = ['Active', 'Paused', 'Error'];
const stateNames: DataSourceState[] = ['Active', 'Paused', 'Error'];

function parseState(value: unknown): DataSourceState | null {
  if (typeof value === 'number' && Number.isInteger(value)) return stateNames[value] ?? null;
  return typeof value === 'string' && states.includes(value as DataSourceState) ? value as DataSourceState : null;
}

function parseId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}

function normalizeDataSource(value: unknown): DataSource | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = parseId(row.id);
  const state = parseState(row.state);
  if (id === null || state === null
    || typeof row.key !== 'string' || typeof row.displayName !== 'string'
    || typeof row.categoryPath !== 'string' || !Number.isInteger(row.intervalHours)
    || typeof row.createdAtUtc !== 'string'
    || (row.partnerShopId !== null && !Number.isInteger(row.partnerShopId))
    || (row.partnerShopDisplayName !== null && typeof row.partnerShopDisplayName !== 'string')
    || (row.lastCompletedAtUtc !== null && typeof row.lastCompletedAtUtc !== 'string')
    || (row.nextAttemptAtUtc !== null && typeof row.nextAttemptAtUtc !== 'string')) return null;

  return {
    id, key: row.key, displayName: row.displayName, categoryPath: row.categoryPath,
    partnerShopId: row.partnerShopId as number | null,
    partnerShopDisplayName: row.partnerShopDisplayName as string | null,
    state, intervalHours: row.intervalHours as number, createdAtUtc: row.createdAtUtc,
    lastCompletedAtUtc: row.lastCompletedAtUtc as string | null,
    nextAttemptAtUtc: row.nextAttemptAtUtc as string | null,
  };
}

async function throwResponseError(response: Response, operation: string): Promise<never> {
  let detail = '';
  try {
    const body = await response.json() as { message?: string; title?: string; detail?: string };
    detail = body.message ?? body.detail ?? body.title ?? '';
  } catch {
    // Fall back to a status-specific message for empty or non-JSON responses.
  }
  const fallback = response.status === 400
    ? 'The configuration is invalid. Check the interval and selected partner shop.'
    : response.status === 403 || response.status === 401
      ? `You do not have permission to ${operation}.`
      : response.status === 404
        ? 'This data source could not be found. Refresh the list and try again.'
        : response.status === 409
          ? 'This source cannot run now because it is paused, has an error, or already has a job running.'
          : `Could not ${operation} (request failed with status ${response.status}).`;
  throw new DataSourcesApiError(detail || fallback, response.status);
}

export async function getDataSources(requestAdmin: AdminRequest, signal?: AbortSignal): Promise<DataSource[]> {
  const response = await requestAdmin('/admin/data-sources', { signal });
  if (!response.ok) await throwResponseError(response, 'view data sources');
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new DataSourcesApiError('The Data Sources response was invalid. Please try again.', response.status);
  const sources = body.map(normalizeDataSource);
  if (sources.some(source => source === null)) throw new DataSourcesApiError('The Data Sources response was invalid. Please try again.', response.status);
  return sources as DataSource[];
}

export async function updateDataSource(requestAdmin: AdminRequest, source: DataSource, input: { state: 'Active' | 'Paused'; intervalHours: number; partnerShopId: number | null }): Promise<DataSource> {
  const response = await requestAdmin(`/admin/data-sources/${encodeURIComponent(source.id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!response.ok) await throwResponseError(response, 'configure this data source');
  const updated = normalizeDataSource(await response.json());
  if (!updated) throw new DataSourcesApiError('The updated Data Source response was invalid. Please refresh and try again.', response.status);
  return updated;
}

export async function runDataSourceSync(requestAdmin: AdminRequest, sourceId: string): Promise<void> {
  const response = await requestAdmin(`/admin/data-sources/${encodeURIComponent(sourceId)}/sync`, { method: 'POST' });
  if (response.status !== 202) await throwResponseError(response, 'queue a sync');
}
