import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { Button, Card, Checkbox, DataTable, Drawer, EmptyState, ErrorState, Field, FilterChips, Kbd, Lightbox, Loading, Modal, PageHeader, Pager, Pill, RowMenu, Switch, TableFooter, Toast, Toolbar } from './index';

describe('Studio shared components', () => {
  afterEach(cleanup);
  it('renders button variants, status pills, semantic card and keyboard hint', () => {
    render(<><Button tone="primary">Save</Button><Button tone="danger" size="sm">Delete</Button><Pill tone="ok">Ready</Pill><Card aria-label="Card"><Kbd>⌘K</Kbd></Card></>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('studio-button-primary');
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('studio-button-sm');
    expect(screen.getByText('Ready')).toHaveClass('studio-pill-ok');
    expect(screen.getByLabelText('Card')).toBeInTheDocument(); expect(screen.getByText('⌘K')).toBeInTheDocument();
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
    render(<><FilterChips items={[{ value: 'all', label: 'All', count: 4 }, { value: 'hidden', label: 'Hidden' }]} value="all" onChange={change} /><Switch checked onChange={toggle} label="Visible" /></>);
    fireEvent.click(screen.getByRole('button', { name: 'Hidden' })); fireEvent.click(screen.getByRole('switch', { name: 'Visible' }));
    expect(change).toHaveBeenCalledWith('hidden'); expect(toggle).toHaveBeenCalledWith(false);
  });
  it('renders searchable toolbar, data table and three-part footer pager', () => {
    const change = vi.fn(); render(<><Toolbar><Field label="Search" placeholder="Name" /></Toolbar><DataTable><thead><tr><th>Name</th></tr></thead><tbody><tr><td>One</td></tr></tbody></DataTable><TableFooter start={1} end={10} total={20}><Pager page={1} pages={2} onChange={change} /></TableFooter></>);
    expect(screen.getByLabelText('Search')).toBeInTheDocument(); expect(screen.getByText('One')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Trang sau' })); expect(change).toHaveBeenCalledWith(2);
  });
  it('opens row menu and renders empty, error, loading, page header and toast states', () => {
    render(<><RowMenu><button>Archive</button></RowMenu><EmptyState title="Empty" /><ErrorState title="Error" /><Loading /><PageHeader title="Products" eyebrow="CATALOG" description="Manage products" /><Toast>Saved</Toast></>);
    fireEvent.click(screen.getByLabelText('Thao tác')); expect(screen.getByText('Archive')).toBeVisible(); expect(screen.getByRole('alert')).toHaveTextContent('Error'); expect(screen.getByRole('status', { name: 'Đang tải' })).toBeInTheDocument(); expect(screen.getByText('Products')).toBeInTheDocument(); expect(screen.getByText('Saved')).toBeInTheDocument();
  });
  it('traps modal focus, closes on Escape, restores scroll and returns focus', () => {
    const Demo = () => { const [open, setOpen] = useState(false); return <><button onClick={() => setOpen(true)}>Open</button><Modal open={open} onClose={() => setOpen(false)} title="Edit"><button>First</button><button>Last</button></Modal></>; };
    render(<Demo />); const trigger = screen.getByRole('button', { name: 'Open' }); trigger.focus(); fireEvent.click(trigger); const first = screen.getByRole('button', { name: 'Đóng' }); const last = screen.getByRole('button', { name: 'Last' }); last.focus(); fireEvent.keyDown(window, { key: 'Tab' }); expect(first).toHaveFocus(); fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
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
    render(<Lightbox open onClose={vi.fn()}><img alt="Zoom image" src="/image.png" /></Lightbox>);
    const stage = document.querySelector('.studio-lightbox-stage') as HTMLDivElement; stage.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200, toJSON: () => ({}) }); stage.setPointerCapture = vi.fn();
    fireEvent.wheel(stage, { deltaY: -100, clientX: 200, clientY: 100 }); expect(screen.getByText('115%')).toBeInTheDocument(); expect(stage).toHaveClass('is-zoomed');
    const pointer = (type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }); Object.defineProperty(event, 'pointerId', { value: 1 }); fireEvent(stage, event); };
    pointer('pointerdown', 40, 50); pointer('pointermove', 60, 70); pointer('pointerup', 60, 70);
    expect(stage.setPointerCapture).toHaveBeenCalledWith(1); expect(document.querySelector('.studio-lightbox-content')).toHaveStyle({ transform: 'translate(12.500000000000007px,20px) scale(1.15)' });
    for (let index = 0; index < 20; index++) fireEvent.wheel(stage, { deltaY: 100, clientX: 200, clientY: 100 });
    expect(screen.getByText('100%')).toBeInTheDocument(); expect(stage).not.toHaveClass('is-zoomed');
  });
});
