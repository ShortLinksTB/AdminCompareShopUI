import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import './studio-ui.css';

const focusLayerStack: symbol[] = [];

type ButtonTone = 'primary' | 'secondary' | 'selected' | 'cool' | 'danger' | 'ghost';
export function Button({ tone = 'secondary', size = 'md', layout, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: 'sm' | 'md'; layout?: 'grid' | 'stacked' }) { return <button {...props} className={`studio-button studio-button-${tone} studio-button-${size} ${layout ? `studio-button-${layout}` : ''} ${className}`} />; }
export function Pill({ tone = 'neutral', size = 'md', children }: { tone?: 'ok' | 'warn' | 'bad' | 'info' | 'neutral'; size?: 'sm' | 'md'; children: ReactNode }) { return <span className={`studio-pill studio-pill-${tone} studio-pill-${size}`}>{children}</span>; }
export function FilterChips({ items, value, onChange, label }: { items: { value: string; label: string; count?: number }[]; value: string; onChange: (value: string) => void; label?: string }) { return <div className="studio-filter-chips" role="group" aria-label={label}>{items.map(item => <button type="button" key={item.value} aria-pressed={item.value === value} onClick={() => onChange(item.value)}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}</div>; }
export function Card({ as: Element = 'section', className = '', ...props }: HTMLAttributes<HTMLElement> & { as?: 'article' | 'section' }) { return <Element {...props} className={`studio-card ${className}`} />; }
export function Toolbar({ children, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={`studio-toolbar ${props.className || ''}`}>{children}</div>; }
export function DataTable({ children, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={`studio-table-scroll ${props.className || ''}`}><table className="studio-table">{children}</table></div>; }
type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'defaultChecked' | 'onChange' | 'aria-checked'> & { checked: boolean; indeterminate?: boolean; onChange: (checked: boolean) => void };
export function Checkbox({ checked, indeterminate = false, onChange, ...props }: CheckboxProps) {
  return <input {...props} ref={element => { if (element) element.indeterminate = indeterminate; }} className={`studio-checkbox ${props.className || ''}`} type="checkbox" checked={checked} aria-checked={indeterminate ? 'mixed' : checked} onChange={event => onChange(event.target.checked)} />;
}
export function TableFooter({ start, end, total, center, summary, startContent, children }: { start: number; end: number; total: number; center?: ReactNode; summary?: ReactNode; startContent?: ReactNode; children?: ReactNode }) { return <footer className="studio-table-footer"><span>{startContent ?? summary ?? <>Hiển thị <b>{start}–{end}</b> trong <b>{total}</b></>}</span><span className="studio-footer-range">{center}</span><div>{children}</div></footer>; }
export function Pager({ page, pages, onChange, previousLabel = 'Trang trước', nextLabel = 'Trang sau', formatPage = (current, count) => `${current} / ${count}`, disabled = false }: { page: number; pages: number; onChange: (page: number) => void; previousLabel?: string; nextLabel?: string; formatPage?: (page: number, pages: number) => string; disabled?: boolean }) { return <div className="studio-pager"><Button size="sm" aria-label={previousLabel} disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>←</Button><span>{formatPage(page, pages)}</span><Button size="sm" aria-label={nextLabel} disabled={disabled || page >= pages} onClick={() => onChange(page + 1)}>→</Button></div>; }
export function RowMenu({ children, open, onOpenChange, label = 'Thao tác' }: { children: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void; label?: string }) {
  const trigger = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const focusOnOpen = useRef<'first' | 'last' | null>(null);
  const setOpen = (next: boolean) => { if (open === undefined) setUncontrolledOpen(next); onOpenChange?.(next); };

  useLayoutEffect(() => {
    if (!isOpen || !focusOnOpen.current || !menu.current) return;
    const items = [...menu.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[role="menuitem"]:not([aria-disabled="true"])')];
    const target = focusOnOpen.current === 'last' ? items.at(-1) : items[0];
    focusOnOpen.current = null;
    target?.focus();
  }, [isOpen]);

  useLayoutEffect(() => {
    const triggerElement = trigger.current;
    const menuElement = menu.current;
    if (!isOpen || !triggerElement || !menuElement) return;
    const placeMenu = () => {
      const triggerRect = triggerElement.getBoundingClientRect();
      const minWidth = triggerElement.closest('.offers-actions') ? 245 : 150;
      const shell = triggerElement.closest<HTMLElement>('.studio-shell');
      const computed = shell ? getComputedStyle(shell) : null;
      const theme = computed ? Object.fromEntries(Array.from({ length: computed.length }, (_, index) => computed.item(index)).filter(property => property.startsWith('--studio-')).map(property => [property, computed.getPropertyValue(property)])) : {};
      // Apply the final theme and minimum width before measuring. Otherwise the
      // first measurement can use the actions' intrinsic width, then the portal
      // grows after positioning and crosses the viewport edge.
      Object.entries(theme).forEach(([property, value]) => menuElement.style.setProperty(property, String(value)));
      menuElement.style.minWidth = `${minWidth}px`;
      const menuRect = menuElement.getBoundingClientRect();
      const margin = 8;
      const gap = 4;
      const below = window.innerHeight - triggerRect.bottom - gap;
      const above = triggerRect.top - gap;
      const placeAbove = below < menuRect.height && above > below;
      const top = placeAbove
        ? Math.max(margin, triggerRect.top - menuRect.height - gap)
        : Math.min(window.innerHeight - menuRect.height - margin, triggerRect.bottom + gap);
      const left = Math.max(margin, Math.min(triggerRect.right - menuRect.width, window.innerWidth - menuRect.width - margin));
      setPosition({ ...theme, position: 'fixed', top, left, minWidth, visibility: 'visible' } as CSSProperties);
    };
    placeMenu();
    // The fixed popup cannot be clipped by table overflow. Close it on any scroll
    // so it never appears detached from its trigger.
    const closeOnScroll = () => setOpen(false);
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOutside = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && (trigger.current?.parentElement?.contains(target) || menu.current?.contains(target))) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    return () => document.removeEventListener('mousedown', closeOutside);
  }, [isOpen]);

  const closeAndRestoreFocus = () => { setOpen(false); trigger.current?.focus(); };
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeAndRestoreFocus(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'ArrowDown' ? (current + 1) % items.length : (current <= 0 ? items.length - 1 : current - 1);
      items[next]?.focus();
    }
  };

  return <details className="studio-row-menu" open={isOpen} onKeyDown={event => { if (event.key === 'Escape' && isOpen) { event.preventDefault(); event.stopPropagation(); closeAndRestoreFocus(); } }}>
    <summary ref={trigger} aria-label={label} aria-expanded={isOpen} onClick={event => { event.preventDefault(); if (!isOpen) focusOnOpen.current = 'first'; setOpen(!isOpen); }} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const direction = event.key === 'ArrowUp' ? 'last' : 'first';
        if (!isOpen) focusOnOpen.current = direction;
        else {
          const items = [...(menu.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
          (direction === 'last' ? items.at(-1) : items[0])?.focus();
        }
        setOpen(true);
      }
    }}>⋮</summary>
    {isOpen && createPortal(<div ref={menu} className="studio-row-menu studio-row-menu-portal" style={position} onKeyDown={onMenuKeyDown} onClick={event => { const target = event.target; if (target instanceof Element && target.closest('button,a')) closeAndRestoreFocus(); }}>{children}</div>, document.body)}
  </details>;
}
export function SearchField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="studio-search-field"><span aria-hidden="true">⌕</span><input {...props} aria-label={props['aria-label'] ?? label} /></label>; }
export function Select({ className = '', size = 'md', ...props }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { size?: 'sm' | 'md' }) { return <select {...props} className={['studio-select', `studio-select-${size}`, className].filter(Boolean).join(' ')} />; }
function FocusLayer({ children, onClose, label, className, role = 'dialog', portalToBody = false, captureEscape = false, deferFocusRestore = false }: { children: ReactNode; onClose: () => void; label: string; className: string; role?: 'dialog' | 'alertdialog'; portalToBody?: boolean; captureEscape?: boolean; deferFocusRestore?: boolean }) {
  const root = useRef<HTMLDivElement>(null); const previous = useRef<HTMLElement | null>(null);
  const layerId = useRef(Symbol(label));
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { previous.current = document.activeElement as HTMLElement; const bodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; root.current?.focus();
    focusLayerStack.push(layerId.current);
    const handle = (event: KeyboardEvent) => { if (event.key === 'Escape' && focusLayerStack.at(-1) === layerId.current) { event.preventDefault(); event.stopImmediatePropagation(); onCloseRef.current(); } if (event.key === 'Tab') { const dialog = root.current; const items = [...(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') || [])]; if (!items.length) { event.preventDefault(); dialog?.focus(); return; } const first = items[0]; const last = items.at(-1)!; if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus(); } } };
    window.addEventListener('keydown', handle, captureEscape); return () => { window.removeEventListener('keydown', handle, captureEscape); const index = focusLayerStack.lastIndexOf(layerId.current); if (index >= 0) focusLayerStack.splice(index, 1); document.body.style.overflow = bodyOverflow; const restoreTarget = previous.current; const restoreFocus = () => { if (restoreTarget?.isConnected) restoreTarget.focus(); }; if (deferFocusRestore) window.setTimeout(restoreFocus, 0); else queueMicrotask(restoreFocus); };
  }, []);
  const shell = document.querySelector('.studio-shell');
  const portalTarget = portalToBody ? document.body : shell ?? document.body;
  const shellStyle = portalToBody && shell ? getComputedStyle(shell) : null;
  const themeStyle = shellStyle
    ? Object.fromEntries(Array.from({ length: shellStyle.length }, (_, index) => shellStyle.item(index)).filter(property => property.startsWith('--')).map(property => [property, shellStyle.getPropertyValue(property)])) as CSSProperties
    : undefined;
  const overlay = <div className="studio-overlay" style={themeStyle} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={root} tabIndex={-1} role={role} aria-modal="true" aria-label={label} className={className}>{children}</section></div>;
  return createPortal(overlay, portalTarget);
}
export function Modal({ open, onClose, title, children, actions, role = 'dialog', className = '' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; actions?: ReactNode; role?: 'dialog' | 'alertdialog'; className?: string }) { return open ? <FocusLayer onClose={onClose} label={title} className={`studio-modal${className ? ` ${className}` : ''}`} role={role}><header><h2>{title}</h2><Button tone="ghost" aria-label="Đóng" onClick={onClose}>×</Button></header><div className="studio-modal-body">{children}</div>{actions && <footer>{actions}</footer>}</FocusLayer> : null; }
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) { return open ? <FocusLayer onClose={onClose} label={title} className="studio-drawer"><header><h2>{title}</h2><Button tone="ghost" aria-label="Đóng" onClick={onClose}>×</Button></header><div className="studio-drawer-body">{children}</div></FocusLayer> : null; }
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) { return <label className="studio-switch"><input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={event => onChange(event.target.checked)} /><span aria-hidden="true" /></label>; }
export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="studio-field"><span>{label}</span><input {...props} /></label>; }
export function Kbd({ children }: { children: ReactNode }) { return <kbd className="studio-kbd">{children}</kbd>; }
export function Toast({ children, onClose }: { children: ReactNode; onClose?: () => void }) { return <div className="studio-toast" role="status">{children}{onClose && <Button tone="ghost" aria-label="Đóng thông báo" onClick={onClose}>×</Button>}</div>; }
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) { return <div className="studio-state"><b>{title}</b>{children && <p>{children}</p>}</div>; }
export function ErrorState({ title, children }: { title: string; children?: ReactNode }) { return <div className="studio-state studio-error-state" role="alert"><b>{title}</b>{children && <p>{children}</p>}</div>; }
export function Loading({ label = 'Đang tải', children }: { label?: string; children?: ReactNode }) { return <div className="studio-loading" role="status" aria-label={label}><i /><i /><i />{children}</div>; }
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) { return <header className="studio-page-header">{eyebrow && <span>{eyebrow}</span>}<div><section><h1>{title}</h1>{description && <p>{description}</p>}</section>{actions}</div></header>; }
export function Lightbox({ open, onClose, children, toolbar, label = 'Xem ảnh', closeLabel = 'Đóng ảnh', className = '', clickZoom = true, resetKey }: { open: boolean; onClose: () => void; children: ReactNode; toolbar?: ReactNode; label?: string; closeLabel?: string; className?: string; clickZoom?: boolean; resetKey?: string }) {
  const [zoom, setZoom] = useState(1); const [pan, setPan] = useState({ x: 0, y: 0 }); const drag = useRef<{ id: number; x: number; y: number; panX: number; panY: number } | null>(null); const suppressStageClick = useRef(false); const stage = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) { setZoom(1); setPan({ x: 0, y: 0 }); drag.current = null; } }, [open, resetKey]);
  useEffect(() => {
    const element = stage.current;
    if (!open || !element) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const px = event.clientX - bounds.left - bounds.width / 2;
      const py = event.clientY - bounds.top - bounds.height / 2;
      const next = Math.min(4, Math.max(1, zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
      setPan(next === 1 ? { x: 0, y: 0 } : { x: px - (px - pan.x) * next / zoom, y: py - (py - pan.y) * next / zoom });
      setZoom(next);
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [open, zoom, pan]);
  return open ? <FocusLayer portalToBody captureEscape deferFocusRestore onClose={onClose} label={label} className={`studio-lightbox ${className}`.trim()}><Button tone="ghost" aria-label={closeLabel} onClick={onClose}>×</Button>{toolbar && <div className="studio-lightbox-toolbar">{toolbar}</div>}<div ref={stage} className={`studio-lightbox-stage${zoom > 1 ? ' is-zoomed' : ''}`} onClick={event => { if (suppressStageClick.current) { suppressStageClick.current = false; return; } const target = event.target; if (clickZoom && target instanceof Element && target.closest('.studio-lightbox-content')) { const next = zoom > 1 ? 1 : 2; setZoom(next); if (next === 1) setPan({ x: 0, y: 0 }); } }} onPointerDown={event => { suppressStageClick.current = false; if (zoom <= 1) return; if (typeof event.currentTarget.setPointerCapture === 'function') event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; }} onPointerMove={event => { const activeDrag = drag.current; if (activeDrag?.id === event.pointerId) { const dx = event.clientX - activeDrag.x; const dy = event.clientY - activeDrag.y; if (dx !== 0 || dy !== 0) suppressStageClick.current = true; setPan({ x: activeDrag.panX + dx, y: activeDrag.panY + dy }); } }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; suppressStageClick.current = false; }}><div className="studio-lightbox-content" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>{children}</div><span className="studio-lightbox-hint">Scroll để zoom · kéo để di chuyển</span><span className="studio-lightbox-zoom">{Math.round(zoom * 100)}%</span></div></FocusLayer> : null;
}
