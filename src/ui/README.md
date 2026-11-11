# Admin Studio shared components

The reference page is the in-repository route `/studio-components` (requires `settings.manage`). This keeps examples on the real Vite application shell and avoids adding Storybook configuration or dependencies in the foundation rollout.

Components live in `index.tsx` and use tokens from the nearest `.studio-shell`:

| Component | API / states |
| --- | --- |
| `Button` | `tone`: primary, secondary, cool, danger, ghost; `size`: md, sm; forwards native button props. |
| `Pill` | `tone`: ok, warn, bad, info, neutral. |
| `FilterChips` | `items`, controlled `value`, `onChange`; exposes pressed state and optional counts. |
| `Card` | Section wrapper with native section attributes. |
| `Toolbar` | Flexible wrapping toolbar container. |
| `DataTable` | Horizontally scrollable native table wrapper. |
| `Checkbox` | Controlled checkbox using Studio theme tokens; supports checked, indeterminate, focus-visible, hover, and disabled states. |
| `TableFooter`, `Pager` | Three aligned footer regions and controlled page navigation. |
| `RowMenu` | Native disclosure menu; caller supplies actions. |
| `Modal`, `Drawer`, `Lightbox` | Controlled `open`, `onClose`; Escape, backdrop, scroll lock, focus trap, focus restore. |
| `Switch` | Controlled accessible checkbox switch. |
| `Field` | Labelled native input; forwards input props. |
| `Kbd` | Keyboard shortcut label. |
| `Toast` | Status announcement with optional dismiss action. |
| `EmptyState`, `ErrorState`, `Loading` | Empty, alert, and status/skeleton presentations. |
| `PageHeader` | Optional eyebrow/description/actions with title. |

Use these primitives rather than defining page-local styles for their control families. They support both themes through Studio CSS variables. Reduced-motion preferences disable transitions and skeleton animation.
