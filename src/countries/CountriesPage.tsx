import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, Loading, Modal, PageHeader, Switch } from '../ui';
import type { AdminRequest } from '../bannedItemsApi';
import { createCountry, getCountries, updateCountry, type Country, type CountryInput } from './countries-api';
import './countries.css';

const emptyForm: CountryInput = { code: '', name: '', isActive: true };

export function CountriesPage({ requestAdmin, permissions }: { requestAdmin: AdminRequest; permissions: string[] }) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [editor, setEditor] = useState<Country | null | undefined>(undefined);
  const [form, setForm] = useState<CountryInput>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const canManage = permissions.includes('countries.manage');
  const refresh = useCallback(() => setReloadKey(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError('');
    getCountries(requestAdmin, controller.signal)
      .then(items => setCountries(items))
      .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setLoadError(error instanceof Error ? error.message : 'Could not load countries.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestAdmin, reloadKey]);

  function openCreate() { setEditor(null); setForm(emptyForm); setFormError(''); }
  function openEdit(country: Country) { setEditor(country); setForm({ code: country.code, name: country.name, isActive: country.isActive }); setFormError(''); }
  function closeEditor() { if (!saving) setEditor(undefined); }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || editor === undefined) return;
    const input = { ...form, code: form.code.trim().toUpperCase(), name: form.name.trim() };
    if (!editor && !/^[A-Z]{2}$/.test(input.code)) { setFormError('Code must be exactly 2 letters (ISO 3166-1 alpha-2).'); return; }
    if (!input.name) { setFormError('Name is required.'); return; }
    setSaving(true); setFormError('');
    try {
      if (editor) await updateCountry(requestAdmin, editor.id, input);
      else await createCountry(requestAdmin, input);
      setEditor(undefined);
      setNotice(editor ? `${input.code} updated.` : `${input.code} created.`);
      refresh();
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Could not save country.'); }
    finally { setSaving(false); }
  }

  async function toggleActive(country: Country) {
    if (!canManage || saving) return;
    setSaving(true); setNotice('');
    try {
      await updateCountry(requestAdmin, country.id, { code: country.code, name: country.name, isActive: !country.isActive });
      setCountries(current => current.map(item => item.id === country.id ? { ...item, isActive: !country.isActive } : item));
      setNotice(`${country.name} ${country.isActive ? 'deactivated' : 'activated'}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update country status.'); }
    finally { setSaving(false); }
  }

  return <div className="countries-page">
    <PageHeader eyebrow="DỮ LIỆU" title="Countries" description="Manage the central country list used by Partner Shops, Categories, and country-specific catalog settings."
      actions={canManage ? <Button type="button" tone="primary" onClick={openCreate}>+ Add country</Button> : undefined} />
    <p className="countries-guidance">Countries are the single source of truth for catalog assignment. Deactivating a country keeps existing references intact and removes it from new assignments.</p>
    {notice && <div className="countries-notice" role="status">{notice}</div>}
    {loadError ? <div className="countries-state"><ErrorState title={loadError} /><Button size="sm" onClick={refresh}>Retry</Button></div>
      : loading ? <Card className="countries-state"><Loading label="Loading countries">Loading countries…</Loading></Card>
        : <Card className="countries-card" aria-label="Countries list">
          {countries.length ? <div className="countries-table-wrap"><table className="studio-table"><thead><tr><th className="countries-code-col">Code</th><th>Name</th><th className="countries-active-col">Active</th><th aria-label="Actions" /></tr></thead><tbody>
            {countries.map(country => <tr key={country.id}><td><span className="countries-code">{country.code}</span></td><td className="countries-name">{country.name}</td><td><Switch label={`Active ${country.code}`} checked={country.isActive} disabled={!canManage || saving} onChange={() => void toggleActive(country)} /></td><td className="countries-actions">{canManage && <Button size="sm" onClick={() => openEdit(country)}>Edit</Button>}</td></tr>)}
          </tbody></table></div> : <div className="countries-empty"><EmptyState title="No countries yet">The country list is empty. Add a country to make it available to catalog features.</EmptyState></div>}
        </Card>}

    <Modal open={editor !== undefined} title={editor ? 'Edit country' : 'Add country'} onClose={closeEditor} className="countries-modal" actions={<><Button type="button" disabled={saving} onClick={closeEditor}>Cancel</Button><Button type="submit" form="country-form" tone="primary" disabled={saving}>{saving ? 'Saving…' : 'Save country'}</Button></>}>
      <form id="country-form" className="countries-form" onSubmit={event => void save(event)}>
        {formError && <div className="countries-error" role="alert">{formError}</div>}
        <label htmlFor="country-code">Code<input id="country-code" autoFocus={!editor} required disabled={Boolean(editor)} maxLength={2} value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) }))} placeholder="Vd: VN" /><small>ISO 3166-1 alpha-2, 2 ký tự, viết hoa.</small></label>
        <label htmlFor="country-name">Name<input id="country-name" autoFocus={Boolean(editor)} required maxLength={120} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Vd: Vietnam" /></label>
        <div className="countries-form-active"><span>Active</span><Switch label="Country active" checked={form.isActive} onChange={isActive => setForm(current => ({ ...current, isActive }))} /></div>
      </form>
    </Modal>
  </div>;
}
