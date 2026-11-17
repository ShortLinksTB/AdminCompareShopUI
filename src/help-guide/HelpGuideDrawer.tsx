import { useEffect, useRef, type RefObject } from 'react';
import { helpGuides, type HelpGuide } from '../helpGuideContent';
import './help-guide.css';

export function getHelpGuide(pathname: string): HelpGuide | undefined {
  if (pathname === '/banned-items/new') return helpGuides['/banned-items'];
  const exactMatch = (helpGuides as Record<string, HelpGuide>)[pathname];
  if (exactMatch) return exactMatch;
  if (/^\/products\/[^/]+\/?$/.test(pathname)) return helpGuides['/products/:id'];
  return undefined;
}

type HelpGuideDrawerProps = {
  pathname: string;
  open: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
};

export function HelpGuideDrawer({ pathname, open, triggerRef, onClose }: HelpGuideDrawerProps) {
  const guide = getHelpGuide(pathname);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open || !guide) {
      if (wasOpen.current) {
        wasOpen.current = false;
        triggerRef.current?.focus();
      }
      return;
    }

    wasOpen.current = true;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = document.querySelectorAll<HTMLElement>('#admin-help-guide button:not([disabled])');
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [guide, onClose, open, triggerRef]);

  if (!open || !guide) return null;

  return <div className="studio-help-backdrop">
    <button className="studio-help-scrim" type="button" aria-label="Đóng hướng dẫn bằng lớp phủ" onClick={onClose} />
    <aside id="admin-help-guide" className="studio-help-drawer" role="dialog" aria-modal="true" aria-labelledby="admin-help-title">
      <header className="studio-help-head">
        <div><span className="studio-help-eyebrow">{guide.eyebrow}</span><h2 id="admin-help-title">{guide.title}</h2></div>
        <button ref={closeRef} className="studio-help-close" type="button" aria-label="Đóng hướng dẫn" onClick={onClose}>×</button>
      </header>
      <div className="studio-help-body">
        <section aria-labelledby="admin-help-steps-title">
          <h3 id="admin-help-steps-title"><span aria-hidden="true">?</span>Hướng dẫn sử dụng</h3>
          <ol className="studio-help-steps">{guide.steps.map((step, index) => <li key={`${index}-${step}`}><b aria-hidden="true">{index + 1}</b><span>{step}</span></li>)}</ol>
        </section>
        <section aria-labelledby="admin-help-notes-title">
          <h3 id="admin-help-notes-title"><span aria-hidden="true">!</span>Lưu ý quan trọng</h3>
          <ul className="studio-help-notes">{guide.notes.map((note, index) => <li className={note.danger ? 'danger' : undefined} key={`${index}-${note.text}`}>{note.text}</li>)}</ul>
        </section>
        {guide.permission && <p className="studio-help-permission">{guide.permission}</p>}
      </div>
    </aside>
  </div>;
}
