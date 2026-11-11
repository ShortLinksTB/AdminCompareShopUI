import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "cool" | "ghost" | "danger";
    size?: "sm" | "md";
  }
>(function Button(
  { variant = "secondary", size = "md", className = "", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`studio-button is-${variant} is-${size} ${className}`}
      {...props}
    />
  );
});
export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return <span className={`studio-pill is-${tone}`}>{children}</span>;
}
export function FilterChips({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string; count?: number }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="studio-filter-chips" role="group" aria-label="Filters">
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span>{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <section className={`studio-card ${className}`} {...props} />;
}
export function Toolbar({
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="studio-toolbar" {...props}>
      {children}
    </div>
  );
}
export function DataTable({
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="studio-table-scroll" {...props}>
      <table className="studio-table">{children}</table>
    </div>
  );
}
export function DataTableFooter({
  left,
  middle,
  right,
}: {
  left: ReactNode;
  middle: ReactNode;
  right: ReactNode;
}) {
  return (
    <div className="studio-table-footer">
      <div>{left}</div>
      <div>{middle}</div>
      <div>{right}</div>
    </div>
  );
}
export function Pager({
  page,
  pages,
  onPageChange,
}: {
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav className="studio-pager" aria-label="Pagination">
      <Button
        size="sm"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        ‹
      </Button>
      <span>
        Page {page} of {pages}
      </span>
      <Button
        size="sm"
        aria-label="Next page"
        disabled={page >= pages}
        onClick={() => onPageChange(page + 1)}
      >
        ›
      </Button>
    </nav>
  );
}
export function RowMenu({
  label = "Row actions",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="studio-row-menu" ref={ref}>
      <Button
        ref={triggerRef}
        variant="ghost"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ⋮
      </Button>
      {open && <div role="menu">{children}</div>}
    </div>
  );
}
function useDialog(
  open: boolean,
  onClose: () => void,
  ref: React.RefObject<HTMLElement | null>,
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab" && ref.current) {
        const items = [
          ...ref.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ),
        ].filter((item) => item !== ref.current);
        if (!items.length) return;
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault();
          items.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
          event.preventDefault();
          items[0].focus();
        }
      }
    };
    document.body.classList.add("studio-dialog-open");
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => {
      document.body.classList.remove("studio-dialog-open");
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, ref]);
}
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(open, onClose, ref);
  if (!open) return null;
  return (
    <div
      className="studio-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="studio-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={ref}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <Button variant="ghost" aria-label="Close dialog" onClick={onClose}>
            ×
          </Button>
        </header>
        <div className="studio-modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}
export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(open, onClose, ref);
  if (!open) return null;
  return (
    <div
      className="studio-overlay studio-overlay-end"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="studio-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={ref}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <Button variant="ghost" aria-label="Close drawer" onClick={onClose}>
            ×
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  const id = useId();
  return (
    <label className="studio-switch" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true" />
      {label}
    </label>
  );
}
export function Field({
  label,
  hint,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <label
      className={`studio-field${error ? " has-error" : ""}`}
      htmlFor={inputId}
    >
      <span>{label}</span>
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
        }
        {...props}
      />
      {error ? (
        <small id={`${inputId}-error`}>{error}</small>
      ) : hint ? (
        <small id={`${inputId}-hint`}>{hint}</small>
      ) : null}
    </label>
  );
}
export function SelectField({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <label className="studio-field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} {...props}>
        {children}
      </select>
    </label>
  );
}
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="studio-kbd">{children}</kbd>;
}
export function Toast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  return (
    <div className="studio-toast" role="status" aria-live="polite">
      {message}
      <button aria-label="Dismiss notification" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="studio-state">
      <strong>{title}</strong>
      {children}
    </div>
  );
}
export function ErrorState({
  title = "Something went wrong",
  onRetry,
}: {
  title?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="studio-state is-error" role="alert">
      <strong>{title}</strong>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  );
}
export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="studio-loading" role="status" aria-label={label}>
      <span />
      <span />
      <span />
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="studio-page-header">
      <div>
        {eyebrow && <span className="studio-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="studio-page-actions">{actions}</div>}
    </header>
  );
}
export function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    drag.current = null;
    onClose();
  };
  useDialog(true, close, ref);
  return (
    <div
      className="studio-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      ref={ref}
      tabIndex={-1}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onWheel={(event) => {
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - bounds.left - bounds.width / 2;
        const y = event.clientY - bounds.top - bounds.height / 2;
        const next = Math.min(
          4,
          Math.max(1, scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15)),
        );
        setPan((previous) =>
          next === 1
            ? { x: 0, y: 0 }
            : {
                x: x - ((x - previous.x) * next) / scale,
                y: y - ((y - previous.y) * next) / scale,
              },
        );
        setScale(next);
      }}
      onPointerDown={(event) => {
        if (scale <= 1) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          panX: pan.x,
          panY: pan.y,
        };
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointerId === event.pointerId)
          setPan({
            x: drag.current.panX + event.clientX - drag.current.x,
            y: drag.current.panY + event.clientY - drag.current.y,
          });
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId === event.pointerId) drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <Button aria-label="Close image preview" onClick={close}>
        ×
      </Button>
      <img
        src={src}
        alt={alt}
        draggable="false"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
        }}
      />
      <span>{Math.round(scale * 100)}%</span>
      <p>Scroll to zoom · drag to move</p>
    </div>
  );
}
