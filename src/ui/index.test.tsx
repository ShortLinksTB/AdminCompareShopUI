import { useEffect, useState } from 'react';
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { Button, Card, Checkbox, DataTable, Drawer, EmptyState, ErrorState, Field, FilterChips, Kbd, Lightbox, Loading, Modal, PageHeader, Pager, Pill, RowMenu, Select, Switch, TableFooter, Toast, Toolbar } from './index';

describe('Studio shared components', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
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

  it('portals RowMenu outside overflowing tables and flips above the trigger near the viewport bottom', async () => {
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.matches('summary[aria-label="Row actions"]')) return { x: 20, y: 710, top: 710, right: 54, bottom: 744, left: 20, width: 34, height: 34, toJSON: () => ({}) } as DOMRect;
      if (this.classList.contains('studio-row-menu-portal')) return { x: 0, y: 0, top: 0, right: 180, bottom: 180, left: 0, width: 180, height: 180, toJSON: () => ({}) } as DOMRect;
      return { x: 0, y: 0, top: 0, right: 100, bottom: 100, left: 0, width: 100, height: 100, toJSON: () => ({}) } as DOMRect;
    });
    render(<div style={{ overflow: 'hidden' }}><table><tbody><tr><td><RowMenu label="Row actions"><button>Delete row</button></RowMenu></td></tr></tbody></table></div>);
    fireEvent.click(screen.getByText('⋮', { selector: 'summary' }));
    const popup = await screen.findByRole('button', { name: 'Delete row' });
    const portal = popup.closest('.studio-row-menu-portal');
    expect(portal?.parentElement).toBe(document.body);
    expect(portal).toHaveStyle({ position: 'fixed', top: '526px' });
    expect(portal).not.toHaveStyle({ overflow: 'auto' });
    bounds.mockRestore();
  });

  it('measures the final menu width before clamping it near the right viewport edge', async () => {
    vi.stubGlobal('innerWidth', 1366);
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.matches('summary[aria-label="Right edge actions"]')) return { x: 1251, y: 100, top: 100, right: 1285, bottom: 134, left: 1251, width: 34, height: 34, toJSON: () => ({}) } as DOMRect;
      if (this.classList.contains('studio-row-menu-portal')) {
        // Without the final min-width, the intrinsic action width is narrower;
        // that early measurement would place the subsequently expanded menu offscreen.
        const width = this.style.minWidth === '150px' ? 150 : 60;
        return { x: 0, y: 0, top: 0, right: width, bottom: 90, left: 0, width, height: 90, toJSON: () => ({}) } as DOMRect;
      }
      return { x: 0, y: 0, top: 0, right: 100, bottom: 100, left: 0, width: 100, height: 100, toJSON: () => ({}) } as DOMRect;
    });
    render(<RowMenu label="Right edge actions"><button>Edit</button><button>Delete</button></RowMenu>);
    fireEvent.click(screen.getByText('⋮', { selector: 'summary' }));
    const portal = (await screen.findByRole('button', { name: 'Edit' })).closest('.studio-row-menu-portal');
    expect(portal).toHaveStyle({ left: '1135px', minWidth: '150px' });
    expect(Number.parseFloat((portal as HTMLElement).style.left) + 150).toBeLessThanOrEqual(window.innerWidth - 8);
  });

  it.each([
    { screen: 'Products', wrapperClass: '', minWidth: 150, expectedLeft: 802, initialWidth: 120 },
    { screen: 'Offers & Prices', wrapperClass: 'offers-actions', minWidth: 245, expectedLeft: 707, initialWidth: 220 },
  ])('clamps the final $minWidth px $screen menu within a 960px viewport', async ({ screen: screenName, wrapperClass, minWidth, expectedLeft, initialWidth }) => {
    vi.stubGlobal('innerWidth', 960);
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.tagName === 'SUMMARY') return { x: 956, y: 100, top: 100, right: 990, bottom: 134, left: 956, width: 34, height: 34, toJSON: () => ({}) } as DOMRect;
      if (this.classList.contains('studio-row-menu-portal')) {
        const width = this.style.minWidth ? Number.parseFloat(this.style.minWidth) : initialWidth;
        return { x: 0, y: 0, top: 0, right: width, bottom: 90, left: 0, width, height: 90, toJSON: () => ({}) } as DOMRect;
      }
      return { x: 0, y: 0, top: 0, right: 100, bottom: 100, left: 0, width: 100, height: 100, toJSON: () => ({}) } as DOMRect;
    });
    render(<div className={wrapperClass}><RowMenu label={`${screenName} actions`}><button>Edit</button><button>Delete</button></RowMenu></div>);
    fireEvent.click(screen.getByText('⋮', { selector: 'summary' }));
    const portal = (await screen.findByRole('button', { name: 'Edit' })).closest('.studio-row-menu-portal') as HTMLElement;
    expect(portal).toHaveStyle({ left: `${expectedLeft}px`, minWidth: `${minWidth}px` });
    expect(Number.parseFloat(portal.style.left) + minWidth).toBeLessThanOrEqual(952);
    bounds.mockRestore();
  });

  it('opens into the menu with arrow keys and activates the focused action with Enter', async () => {
    const user = userEvent.setup();
    const select = vi.fn();
    render(<RowMenu label="Row actions"><button onClick={select}>Edit</button><button>Delete</button></RowMenu>);
    const trigger = screen.getByText('⋮', { selector: 'summary' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    const edit = screen.getByRole('button', { name: 'Edit' });
    const deleteAction = screen.getByRole('button', { name: 'Delete' });
    await waitFor(() => expect(edit).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(deleteAction).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(edit).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(select).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('tabs through menu actions and leaves the menu at its trigger tab position', async () => {
    const user = userEvent.setup();
    render(<><button>Before</button><RowMenu label="Row actions"><button>First</button><button>Second</button></RowMenu><button>After</button></>);
    const trigger = screen.getByText('⋮', { selector: 'summary' });
    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'First' })).not.toBeInTheDocument();
  });

  it('opens RowMenu into its first item with ArrowDown and wraps through items before Escape restores focus', () => {
    render(<RowMenu label="Row actions"><button>First</button><button>Second</button></RowMenu>);
    const trigger = screen.getByText('⋮', { selector: 'summary' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const first = screen.getByRole('button', { name: 'First' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    const second = screen.getByRole('button', { name: 'Second' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'First' })).not.toBeInTheDocument();
  });

  it('opens RowMenu into its last item with ArrowUp', () => {
    render(<RowMenu label="Row actions"><button>First</button><button>Second</button></RowMenu>);
    const trigger = screen.getByText('⋮', { selector: 'summary' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus();
  });

  it('closes on outside click and restores trigger focus after selecting an action', () => {
    render(<><RowMenu label="Row actions"><button onClick={() => {}}>Delete</button></RowMenu><button>Outside</button></>);
    const trigger = screen.getByText('⋮', { selector: 'summary' });
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
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
  it.each([
    ['light', '#ffffff'],
    ['dark', '#101b26'],
  ])('portals lightbox to the viewport body and carries the %s theme tokens', (theme, surface) => {
    const shell = document.createElement('div'); shell.className = 'studio-shell'; shell.dataset.theme = theme;
    shell.style.setProperty('--studio-surface', surface);
    const main = document.createElement('main'); shell.append(main); document.body.append(shell);
    const { unmount } = render(<Lightbox open onClose={() => undefined}><img alt="Viewport preview" src="/image.png" /></Lightbox>, { container: main });
    const overlay = document.querySelector('.studio-overlay');
    const dialog = screen.getByRole('dialog', { name: 'Xem ảnh' });
    expect(overlay?.parentElement).toBe(document.body);
    expect(dialog.closest('.studio-shell')).toBeNull();
    expect(overlay).toHaveStyle({ '--studio-surface': surface });
    unmount(); shell.remove();
  });
  it('auto-hides the hint after idle and restarts the delay on pointer or wheel activity', () => {
    vi.useFakeTimers();
    const { unmount } = render(<Lightbox open onClose={() => undefined}><img alt="Idle preview" src="/image.png" /></Lightbox>);
    const hint = document.querySelector('.studio-lightbox-hint')!;
    const stage = document.querySelector('.studio-lightbox-stage')!;
    expect(hint).not.toHaveClass('is-hidden');
    act(() => { vi.advanceTimersByTime(2999); });
    expect(hint).not.toHaveClass('is-hidden');
    fireEvent.pointerMove(stage, { pointerId: 1 });
    act(() => { vi.advanceTimersByTime(2999); });
    expect(hint).not.toHaveClass('is-hidden');
    act(() => { vi.advanceTimersByTime(1); });
    expect(hint).toHaveClass('is-hidden');
    fireEvent.wheel(stage);
    expect(hint).not.toHaveClass('is-hidden');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(hint).toHaveClass('is-hidden');
    unmount();
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
  it('returns focus to the opener after closing the shared lightbox from its backdrop', async () => {
    const Demo = () => { const [open, setOpen] = useState(false); return <><button onClick={() => setOpen(true)}>Open preview</button><Lightbox open={open} onClose={() => setOpen(false)}><img alt="Preview" src="/image.png" /></Lightbox></>; };
    render(<Demo />);
    const trigger = screen.getByRole('button', { name: 'Open preview' });
    trigger.focus();
    fireEvent.click(trigger);
    const overlay = document.querySelector('.studio-overlay')!;
    fireEvent.mouseDown(overlay);
    queueMicrotask(() => (document.activeElement as HTMLElement | null)?.blur());
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
  it('toggles the shared lightbox image between 100% and 200% on click without closing', () => {
    const close = vi.fn();
    render(<Lightbox open onClose={close}><img alt="Zoom image" src="/image.png" /></Lightbox>);
    const image = screen.getByRole('img', { name: 'Zoom image' });
    const stage = document.querySelector('.studio-lightbox-stage') as HTMLDivElement;
    stage.setPointerCapture = vi.fn();
    fireEvent.click(image);
    expect(screen.getByText('200%')).toBeInTheDocument();
    const pointerEvent = (type: string) => {
      const event = new MouseEvent(type, { bubbles: true });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      return event;
    };
    fireEvent(image, pointerEvent('pointerdown'));
    fireEvent(stage, pointerEvent('pointerup'));
    fireEvent.click(stage);
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Xem ảnh' })).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    expect(stage.setPointerCapture).toHaveBeenCalledWith(1);
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
  it('lets Escape close only the top lightbox before document handlers can dismiss its edit dialog', async () => {
    const Demo = () => {
      const [editOpen, setEditOpen] = useState(true);
      const [lightboxOpen, setLightboxOpen] = useState(false);
      const [name, setName] = useState('Original name');

      useEffect(() => {
        const handle = (event: KeyboardEvent) => {
          if (event.key !== 'Escape') return;
          if (lightboxOpen) setLightboxOpen(false);
          else setEditOpen(false);
        };
        document.addEventListener('keydown', handle);
        return () => document.removeEventListener('keydown', handle);
      }, [lightboxOpen]);

      return <>
        {editOpen && <Modal open title="Edit product" onClose={() => setEditOpen(false)}>
          <label>Name<input aria-label="Name" value={name} onChange={event => setName(event.target.value)} /></label>
          <button type="button" onClick={() => setLightboxOpen(true)}>View product preview</button>
        </Modal>}
        {lightboxOpen && <Lightbox open onClose={() => setLightboxOpen(false)}><img alt="Product preview" src="/image.png" /></Lightbox>}
      </>;
    };

    render(<Demo />);
    const editDialog = screen.getByRole('dialog', { name: 'Edit product' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Unsaved name' } });
    const previewOpener = screen.getByRole('button', { name: 'View product preview' });
    previewOpener.focus();
    fireEvent.click(previewOpener);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Xem ảnh' })).not.toBeInTheDocument();
    expect(editDialog).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Unsaved name');
    expect(document.body.style.overflow).toBe('hidden');
    await waitFor(() => expect(previewOpener).toHaveFocus());
  });
});
