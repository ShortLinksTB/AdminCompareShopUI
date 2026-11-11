import { useState } from 'react';
import { Button, Card, DataTable, Drawer, EmptyState, ErrorState, Field, FilterChips, Input, Kbd, Lightbox, Loading, Modal, PageHeader, Pager, Pill, RowMenu, Search, Select, Switch, TableFooter, Toast, Toolbar } from './index';

const sampleImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 200'%3E%3Crect width='320' height='200' rx='16' fill='%23162433'/%3E%3Ccircle cx='160' cy='100' r='48' fill='%23ff5a00'/%3E%3C/svg%3E";

export function StudioReference() {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [enabled, setEnabled] = useState(true);
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  return <main className="studio-reference">
    <PageHeader eyebrow="DESIGN SYSTEM" title="Studio components" description="Shared components used across Admin Studio pages." action={<Button tone="primary" onClick={() => setModal(true)}>Open dialog</Button>} />
    <div className="studio-reference-grid">
      <Card><h2>Buttons and status</h2><div className="studio-demo-row"><Button tone="primary">Primary</Button><Button>Secondary</Button><Button tone="cool">Info</Button><Button tone="danger">Delete</Button><Pill tone="ok">Active</Pill><Pill tone="warn">Needs review</Pill><Pill tone="bad">Hidden</Pill><Pill tone="info">New</Pill></div></Card>
      <Card><h2>Filters and search</h2><FilterChips value={filter} onChange={setFilter} items={[{ value: 'all', label: 'All', count: 24 }, { value: 'active', label: 'Active', count: 18 }, { value: 'review', label: 'Review', count: 6 }]} /><Toolbar><Search value={query} onChange={setQuery} placeholder="Search components..." /><Select aria-label="Sort"><option>Recently updated</option><option>Name</option></Select></Toolbar></Card>
      <Card><h2>Data table and pager</h2><DataTable><thead><tr><th>Component</th><th>Status</th><th>Actions</th></tr></thead><tbody><tr><td>Button</td><td><Pill tone="ok">Ready</Pill></td><td><RowMenu><button type="button">Inspect</button><button type="button">Copy API</button></RowMenu></td></tr><tr><td>DataTable</td><td><Pill tone="info">Shared</Pill></td><td><Button size="sm" onClick={() => setDrawer(true)}>Details</Button></td></tr></tbody></DataTable><TableFooter left={<span>24 components</span>} summary="Showing 1–10 of 24"><Pager page={page} pages={3} onChange={setPage} /></TableFooter></Card>
      <Card><h2>Form fields</h2><Field label="Component name" hint="Use a concise, reusable name."><Input defaultValue="Studio Button" /></Field><Field label="Category"><Select defaultValue="shared"><option value="shared">Shared</option><option value="page">Page-specific</option></Select></Field><Switch checked={enabled} onChange={setEnabled} label="Enabled" /></Card>
      <Card><h2>Feedback states</h2><div className="studio-demo-stack"><EmptyState title="No results">Try another search or filter.</EmptyState><ErrorState title="Preview unavailable" onRetry={() => setToast('Retry requested')} /><Loading label="Loading preview" /><Button onClick={() => setToast('Changes saved')}>Show toast</Button></div></Card>
      <Card><h2>Keyboard and lightbox</h2><p>Open command palette <Kbd>⌘</Kbd> <Kbd>K</Kbd></p><div className="studio-demo-row"><Button onClick={() => setDrawer(true)}>Open drawer</Button><Button onClick={() => setLightboxOpen(true)}>Show lightbox</Button></div></Card>
    </div>
    <Modal open={modal} onClose={() => setModal(false)} title="Studio dialog" footer={<><Button onClick={() => setModal(false)}>Cancel</Button><Button tone="primary" onClick={() => { setModal(false); setToast('Saved'); }}>Save</Button></>}><p>Dialog content keeps focus inside while open and restores it after close.</p></Modal>
    <Drawer open={drawer} onClose={() => setDrawer(false)} title="Component details"><p>Reusable details panel with Escape and focus handling.</p></Drawer>
    {lightboxOpen && <Lightbox src={sampleImage} alt="Studio lightbox sample" onClose={() => setLightboxOpen(false)} />}
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
  </main>;
}
