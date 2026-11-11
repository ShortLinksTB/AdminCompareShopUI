# Admin Studio UI contract

The shared library lives in `src/ui/index.tsx`. The authenticated component reference is available at `/studio/components`. This keeps the real application shell, route guard, fonts, and build in use without adding Storybook to this rollout.

| Component | Contract |
| --- | --- |
| `Button` | Native button props plus `tone` (`primary`, `secondary`, `cool`, `danger`, `ghost`) and `size` (`sm`, `md`). |
| `Pill` | `tone` (`ok`, `warn`, `bad`, `info`, `neutral`) and inline content. |
| `FilterChips` | `items` (`value`, `label`, optional `count`), selected `value`, and `onChange(value)`. |
| `Card` | Content and optional `className`. |
| `Toolbar` | Content slot for shared search, filters, and actions. |
| `Search` | Controlled `value`, `onChange(value)`, optional placeholder, and native input props. |
| `DataTable` | Native table props and children; wraps the table in a horizontal scroll region. |
| `TableFooter` | Left summary, centered range summary, and right pager/action slot. |
| `Pager` | `page`, `pages`, and `onChange(page)`; disables navigation at bounds. |
| `RowMenu` | Native action content in a disclosure menu and optional accessible `label`. |
| `Modal` | `open`, `onClose`, `title`, content, optional footer; Escape, backdrop close, scroll lock, focus trap, and focus restore. |
| `Drawer` | `open`, `onClose`, `title`, and content; follows the same dialog keyboard/focus contract. |
| `Switch` | Controlled `checked`, `onChange(checked)`, and accessible `label`. |
| `Field` | `label`, form control content, optional hint. `Input` and `Select` provide shared field styling. |
| `Kbd` | Keyboard key content. |
| `Toast` | `message` and `onDismiss`; status announcement and automatic dismissal after 3.2 seconds. |
| `EmptyState` | Required title and optional explanation/action content. |
| `ErrorState` | Optional title and `onRetry`; retry control appears when provided. |
| `Loading` | Optional accessible status label. |
| `PageHeader` | Optional eyebrow, description, and action with required title. |
| `Lightbox` | Image `src`, `alt`, and `onClose`; Escape close, scroll zoom from 1× to 4×, pointer drag to pan. |

All components use the Studio theme variables and visible keyboard focus. The shell applies the dark/light token set, respects system color preference until a user theme choice exists, and safely tolerates unavailable local storage.
