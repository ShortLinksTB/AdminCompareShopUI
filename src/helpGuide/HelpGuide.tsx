import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import guides from './helpGuides.json';
import './helpGuide.css';

type Guide = (typeof guides)[number];

const guidesByRoute = new Map<string, Guide>(guides.map(guide => [guide.route, guide]));

export function guideForPath(pathname: string): Guide | undefined {
  if (pathname === '/banned-items/new') return guidesByRoute.get('/banned-items');
  const productDetail = pathname.match(/^\/products\/[^/]+\/?$/);
  if (productDetail) return guidesByRoute.get('/products/:id');
  return guidesByRoute.get(pathname);
}

export function HelpGuide({ pathname }: { pathname: string }) {
  const guide = guideForPath(pathname);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      closeRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const closeButton = closeRef.current;
      event.preventDefault();
      closeButton?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  if (!guide) return null;

  const layer = open && <div className="help-guide-layer">
    <div className="help-guide-overlay" aria-hidden="true" onMouseDown={() => setOpen(false)} />
    <aside id="admin-help-guide" className="help-guide-drawer" role="dialog" aria-modal="true" aria-labelledby="help-guide-title">
      <header className="help-guide-header">
        <div><span className="help-guide-eyebrow">{guide.eyebrow}</span><h2 id="help-guide-title">{guide.title}</h2></div>
        <button ref={closeRef} className="help-guide-close" type="button" aria-label="Đóng" onClick={() => setOpen(false)}>×</button>
      </header>
      <div className="help-guide-body">
        <h3 className="help-guide-section guide"><i aria-hidden="true">?</i>Hướng dẫn sử dụng</h3>
        <ol className="help-guide-steps">{guide.steps.map((step, index) => <li key={step.text}><b>{index + 1}</b><span>{step.text}</span></li>)}</ol>
        <h3 className="help-guide-section notes"><i aria-hidden="true">!</i>Lưu ý quan trọng</h3>
        <ul className="help-guide-notes">{guide.notes.map(note => <li className={note.danger ? 'danger' : undefined} key={note.text}>{note.text}</li>)}</ul>
        {guide.permission && <p className="help-guide-permission">{guide.permission}</p>}
      </div>
    </aside>
  </div>;

  return <>
    <button
      ref={triggerRef}
      className="help-guide-trigger"
      type="button"
      aria-label="Hướng dẫn trang này"
      title="Hướng dẫn trang này"
      aria-expanded={open}
      aria-controls="admin-help-guide"
      onClick={() => setOpen(true)}
    >?</button>
    {layer && createPortal(layer, document.querySelector('.studio-shell') ?? document.body)}
  </>;
}
