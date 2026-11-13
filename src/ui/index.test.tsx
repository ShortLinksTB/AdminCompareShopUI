import { useState } from 'react';
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { Button, Card, Checkbox, DataTable, Drawer, EmptyState, ErrorState, Field, FilterChips, Kbd, Lightbox, Loading, Modal, PageHeader, Pager, Pill, RowMenu, Select, Switch, TableFooter, Toast, Toolbar } from './index';

describe('Studio shared components', () => {
  afterEach(cleanup);
  it('renders button variants, status pills, semantic card and keyboard hint', () => {
    render(<><Button tone="primary">Save</Button><Button tone="danger" size="sm">Delete</Button><Pill tone="ok" size="sm">Ready</Pill><Card aria-label="Card"><Kbd>⌘K</Kbd></Card></>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('studio-button-primary');
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('studio-button-sm');
    expect(screen.getByText('Ready')).toHaveClass('studio-pill-ok', 'studio-pill-sm');
    expect(screen.getByLabelText('Card')).toBeInTheDocument(); expect(screen.getByText('⌘K')).toBeInTheDocument();
  });

  it('keeps shared Button layouts in the shared component contract', () => {
    render(<><Button layout="grid">Grid action</Button><Button layout="stacked">Stacked action</Button></>);
    expect(screen.getByRole('button', { name: 'Grid action' })).toHaveClass('studio-button-grid');
    expect(screen.getByRole('button', { name: 'Stacked action' })).toHaveClass('studio-button-stacked');
  });

  it('renders checked, mixed, disabled, focusable shared checkbox states and reports changes', () => {
    const onChange = vi.fn();
    render(<><Checkbox aria-label="Checked" checked onChange={onChange} /><Checkbox aria-label="Mixed" checked={false} indeterminate onChange={onChange} /><Checkbox aria-label="Disabled" checked={false} disabled onChange={onChange} /></>);
    const checked = screen.getByRole('checkbox', { name: 'Checked' });
    const mixed = screen.getByRole('checkbox', { name: 'Mixed' });
    const disabled = screen.getByRole('checkbox', { name: 'Disabled' });
    expect(checked).toHaveClass('studio-checkbox');
    expect(checked).toBeChecked();
    expect(mixed).toHaveAttribute('aria-checked', 'mixed');
    expect((mixed as HTMLInputElement).indeterminate).toBe(true);
    expect(disabled).toBeDisabled();
    fireEvent.click(checked);
    expect(onChange).toHaveBeenCalledWith(false);
  });
  it('changes filter chip and switch through accessible controls', () => {
    const change = vi.fn(); const toggle = vi.fn();
    render(<><FilterChips label="Status filters" items={[{ value: 'all', label: 'All', count: 4 }, { value: 'hidden', label: 'Hidden' }]} value="all" onChange={change} /><Switch checked onChange={toggle} label="Visible" /></>);
    expect(screen.getByRole('group', { name: 'Status filters' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hidden' })); fireEvent.click(screen.getByRole('switch', { name: 'Visible' }));
    expect(change).toHaveBeenCalledWith('hidden'); expect(toggle).toHaveBeenCalledWith(false);
  });
  it('renders searchable toolbar, data table and three-part footer pager', () => {
    const change = vi.fn(); render(<><Toolbar><Field label="Search" placeholder="Name" /></Toolbar><DataTable><thead><tr><th>Name</th></tr></thead><tbody><tr><td>One</td></tr></tbody></DataTable><TableFooter start={1} end={10} total={20}><Pager page={1} pages={2} onChange={change} /></TableFooter></>);
    expect(screen.getByLabelText('Search')).toBeInTheDocument(); expect(screen.getByText('One')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Trang sau' })); expect(change).toHaveBeenCalledWith(2);
  });
  it('keeps the shared pager formatter and disabled state with a caller-provided footer summary', () => {
    const change = vi.fn();
    render(<><TableFooter start={1} end={10} total={20} summary="Records 1–10 of 20" /><Pager page={2} pages={4} onChange={change} formatPage={(page, pages) => `${page} sur ${pages}`} disabled /></>);
    expect(screen.getByText('Records 1–10 of 20')).toBeInTheDocument();
    expect(screen.getByText('2 sur 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }));
    expect(change).not.toHaveBeenCalled();
  });
  it('styles native selects through shared Studio density variants', () => {
    render(<><Select aria-label="Sort"><option value="name">Name</option></Select><Select size="sm" aria-label="Page size"><option value="10">10</option></Select></>);
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveClass('studio-select', 'studio-select-md');
    expect(screen.getByRole('combobox', { name: 'Page size' })).toHaveClass('studio-select', 'studio-select-sm');
  });
  it('opens row menu and renders empty, error, loading, page header and toast states', () => {
    render(<><RowMenu><button>Archive</button></RowMenu><EmptyState title="Empty" /><ErrorState title="Error" /><Loading /><PageHeader title="Products" eyebrow="CATALOG" description="Manage products" /><Toast>Saved</Toast></>);
    fireEvent.click(screen.getByLabelText('Thao tác')); expect(screen.getByText('Archive')).toBeVisible(); expect(screen.getByRole('alert')).toHaveTextContent('Error'); expect(screen.getByRole('status', { name: 'Đang tải' })).toBeInTheDocument(); expect(screen.getByText('Products')).toBeInTheDocument(); expect(screen.getByText('Saved')).toBeInTheDocument();
  });
  it('dismisses a row menu on Escape and returns focus to its opener', () => {
    render(<RowMenu><button>Archive</button></RowMenu>);
    const opener = screen.getByLabelText('Thao tác');
    fireEvent.keyDown(opener, { key: 'Escape' });
    expect(opener.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(opener);
    const action = screen.getByRole('button', { name: 'Archive' });
    action.focus();
    fireEvent.keyDown(action, { key: 'Enter' });
    expect(opener.closest('details')).toHaveAttribute('open');
    fireEvent.keyDown(action, { key: 'Escape' });
    expect(opener.closest('details')).not.toHaveAttribute('open');
    expect(opener).toHaveFocus();
  });
  it('traps modal focus, closes on Escape, restores scroll and returns focus', async () => {
    const Demo = () => { const [open, setOpen] = useState(false); return <><button onClick={() => setOpen(true)}>Open</button><Modal open={open} onClose={() => setOpen(false)} title="Edit"><button>First</button><button>Last</button></Modal></>; };
    render(<Demo />); const trigger = screen.getByRole('button', { name: 'Open' }); trigger.focus(); fireEvent.click(trigger); const first = screen.getByRole('button', { name: 'Đóng' }); const last = screen.getByRole('button', { name: 'Last' }); last.focus(); fireEvent.keyDown(window, { key: 'Tab' }); expect(first).toHaveFocus(); fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); await waitFor(() => expect(trigger).toHaveFocus());
  });
  it('places modal overlays beside the app main region so mobile navigation cannot cover them', () => {
    const shell = document.createElement('div'); shell.className = 'studio-shell';
    shell.innerHTML = '<aside class="admin-sidebar mobile-nav-open"></aside><main class="admin-main"></main>';
    document.body.append(shell);
    const { unmount } = render(<Modal open onClose={() => undefined} title="Category editor" className="categories-modal">Form</Modal>, { container: shell.querySelector('main')! });
    const overlay = shell.querySelector('.studio-overlay');
    const sidebar = shell.querySelector('.admin-sidebar');
    expect(overlay?.parentElement).toBe(shell);
    expect(sidebar).not.toBeNull();
    expect(overlay).not.toBeNull();
    expect(sidebar!.compareDocumentPosition(overlay!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Category editor' })).toHaveClass('studio-modal', 'categories-modal');
    unmount(); shell.remove();
  });
  it('returns focus to the opener after closing the shared lightbox with its close button', async () => {
    const Demo = () => { const [open, setOpen] = useState(false); return <><button onClick={() => setOpen(true)}>Open preview</button><Lightbox open={open} onClose={() => setOpen(false)}><img alt="Preview" src="/image.png" /></Lightbox></>; };
    render(<Demo />);
    const trigger = screen.getByRole('button', { name: 'Open preview' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Xem ảnh' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng ảnh' }));
    expect(screen.queryByRole('dialog', { name: 'Xem ảnh' })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it('wraps Shift+Tab from the dialog root and keeps focus during lightbox zoom rerenders', () => {
    const close = vi.fn();
    const Demo = () => <><button>Opener</button><Lightbox open onClose={() => close()}><img alt="Zoom image" src="/image.png" /></Lightbox></>;
    render(<Demo />);
    const dialog = screen.getByRole('dialog', { name: 'Xem ảnh' });
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    const zoom = screen.getByRole('button', { name: 'Đóng ảnh' });
    expect(zoom).toHaveFocus();
    const stage = document.querySelector('.studio-lightbox-stage')!;
    fireEvent.wheel(stage, { deltaY: -100, clientX: 10, clientY: 10 });
    expect(zoom).toHaveFocus();
    expect(dialog).toBeInTheDocument();
  });
  it('drawer closes on Escape and invokes close callback', () => {
    const close = vi.fn(); render(<Drawer open onClose={close} title="Details">Drawer body</Drawer>); expect(screen.getByText('Drawer body')).toBeInTheDocument(); fireEvent.keyDown(window, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
  });
  it('supports lightbox close, disabled pager boundaries, field attributes and dismissible toast', () => {
    const close = vi.fn(); const page = vi.fn();
    render(<><Lightbox open onClose={close}><img alt="Product" src="/product.png" /></Lightbox><Field label="SKU" disabled value="SKU-1" readOnly /><Pager page={1} pages={1} onChange={page} /><Toast onClose={close}>Notice</Toast></>);
    expect(screen.getByRole('img', { name: 'Product' })).toBeInTheDocument(); expect(screen.getByRole('textbox', { name: 'SKU' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng ảnh' })); fireEvent.click(screen.getByRole('button', { name: 'Đóng thông báo' })); expect(close).toHaveBeenCalledTimes(2); expect(page).not.toHaveBeenCalled();
  });
  it('closes a dialog from its backdrop and restores body scroll', () => {
    const close = vi.fn(); render(<Modal open onClose={close} title="Backdrop dialog">Body</Modal>);
    const overlay = document.querySelector('.studio-overlay')!; expect(document.body.style.overflow).toBe('hidden'); fireEvent.mouseDown(overlay); expect(close).toHaveBeenCalledOnce();
  });
  it('zooms the lightbox from 1x to 4x, pans while zoomed and clamps at 1x', () => {
    const close = vi.fn(); render(<Lightbox open onClose={close}><img alt="Zoom image" src="/image.png" /></Lightbox>);
    const stage = document.querySelector('.studio-lightbox-stage') as HTMLDivElement; stage.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200, toJSON: () => ({}) }); stage.setPointerCapture = vi.fn();
    const wheel = createEvent.wheel(stage, { deltaY: -100, clientX: 200, clientY: 100 });
    fireEvent(stage, wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(screen.getByText('115%')).toBeInTheDocument(); expect(stage).toHaveClass('is-zoomed');
    expect((document.querySelector('.studio-lightbox-content') as HTMLDivElement).style.transform).toMatch(/^translate\(-7\.4\d+px,0px\) scale\(1\.15\)$/);
    const pointer = (type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }); Object.defineProperty(event, 'pointerId', { value: 1 }); fireEvent(stage, event); };
    pointer('pointerdown', 40, 50); pointer('pointermove', 60, 70); pointer('pointerup', 60, 70);
    expect(stage.setPointerCapture).toHaveBeenCalledWith(1); expect(document.querySelector('.studio-lightbox-content')).toHaveStyle({ transform: 'translate(12.500000000000007px,20px) scale(1.15)' });
    fireEvent.click(stage);
    expect(screen.getByRole('dialog', { name: 'Xem ảnh' })).toBeInTheDocument();
    pointer('pointerdown', 60, 70); pointer('pointermove', 70, 75); pointer('pointerup', 70, 75); fireEvent.click(stage);
    expect(document.querySelector('.studio-lightbox-content')).toHaveStyle({ transform: 'translate(22.500000000000007px,25px) scale(1.15)' });
    expect(screen.getByRole('dialog', { name: 'Xem ảnh' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng ảnh' }));
    expect(close).toHaveBeenCalledOnce();
    for (let index = 0; index < 20; index++) fireEvent.wheel(stage, { deltaY: -100, clientX: 200, clientY: 100 });
    expect(screen.getByText('400%')).toBeInTheDocument();
    for (let index = 0; index < 20; index++) fireEvent.wheel(stage, { deltaY: 100, clientX: 200, clientY: 100 });
    expect(screen.getByText('100%')).toBeInTheDocument(); expect(stage).not.toHaveClass('is-zoomed');
  });
  it('resets zoom and pan when the lightbox source changes', () => {
    const Demo = () => { const [source, setSource] = useState('shop'); return <><button onClick={() => setSource('product')}>Change source</button><Lightbox open onClose={vi.fn()} clickZoom resetKey={source}><img alt="Zoom image" src="/image.png" /></Lightbox></>; };
    render(<Demo />);
    const stage = document.querySelector('.studio-lightbox-stage') as HTMLDivElement;
    stage.setPointerCapture = vi.fn();
    fireEvent.click(screen.getByRole('img', { name: 'Zoom image' }));
    expect(screen.getByText('200%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change source' }));
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(document.querySelector('.studio-lightbox-content')).toHaveStyle({ transform: 'translate(0px,0px) scale(1)' });
  });
});
