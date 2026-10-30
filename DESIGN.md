# Design system (v2)

This describes the v2 interface as built. The reference page is `/v2/tenders`; every other page migrated to v2 should look and behave like it. v1 pages under `app/(v1)/` are not covered and do not follow these rules.

Every token and primitive below is rendered live at `/v2/design` (Admin group in the sidebar). Look there before building anything.

The feel to aim for: calm, dense, fast. A working tool for people who scan hundreds of tenders a day. Nothing decorative, nothing that makes a frequent action slower.

## Where things live

| Path | What |
|---|---|
| `app/(v2)/v2.css` | All tokens, utilities (`press`, `edge`, `type-*`), animation theme values, overlay motion classes, media-query fallbacks |
| `app/(v2)/layout.tsx` | v2 root layout (fonts, boot script, providers, shell) |
| `components/v2/ui/` | Primitives: `button`, `field`, `calendar`, `overlay`, `sheet`, `page` |
| `components/v2/shell/` | Sidebar shell and `nav-items.ts` |
| `components/v2/data-table/` | Generic table, column filters, chips, pagination, and `cells.tsx`, the cell helpers any page can use |
| `components/v2/<page>/` | One folder per page: `columns.tsx`, `cells.tsx`, view, Redux hook |
| `components/v2/design/` | The `/v2/design` showcase |

## Before writing a class string

1. Is there a primitive? Check the tables under [Components](#components) and `/v2/design`.
2. Is there a utility? `press`, `edge`, `hairline`, `card`, `type-*` (see [Utilities](#utilities)).
3. Is it one of the [patterns](#patterns) that are written out by hand on purpose? Copy that string exactly.
4. Only then write new classes, from tokens. If the same string turns up a third time, move it into `components/v2/ui` and add it to this file and the showcase.

Do not restyle a primitive through `className`. Pass `className` for placement only (width, margin, `self-start`). If a primitive lacks a variant, add the variant.

## Ground rules

1. **UI only.** Database, server actions, API routes and Redux slices are not changed for v2. A page loads and patches data exactly as its v1 version does.
2. **No v1 components.** Nothing from `components/` outside `components/v2` is imported into v2. Non-UI code in `lib/` (slices, formatters, option lists, `cn`) is shared.
3. **Tables stay tables.** Every column a user can see is shown as a column, and every column with a server-side filter gets a filter control.
4. **No business logic in the table.** `DataTable` knows nothing about tenders. What a cell shows, which buttons and dialogs it carries, how a column filters, how columns merge: all of that is in the page's column definitions.
5. **Icons are `lucide-react` only.** No emoji, no hand-drawn SVG.
6. **Sans-serif only.** Geist for text, Geist Mono for identifiers. Never a serif face.

## Colour

Tokens are CSS variables on `:root`, redefined under `.dark`, and exposed to Tailwind through `@theme` (so `bg-surface`, `text-ink-2`, `border-line` and so on). Use the token, never a raw hex value in a component.

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | `#f5f5f7` | `#111113` | Page background |
| `surface` | `#ffffff` | `#1a1a1d` | Table, cards, inputs |
| `raised` | `#ffffff` | `#242428` | Popovers, dialogs, sheet |
| `sunken` | `#f0f0f3` | `#151517` | Inset areas, inline chips, segmented wells |
| `rail` | `#ebebef` | `#0c0c0e` | Sidebar |
| `ink` | `#1d1d1f` | `#f5f5f7` | Primary text |
| `ink-2` | `#55555a` | `#b4b4ba` | Secondary text, column headers |
| `ink-3` | `#8a8a8f` | `#7c7c84` | Tertiary text, placeholders, idle icons |
| `line` | black 8% | white 9% | Hairlines |
| `line-strong` | black 16% | white 20% | Control outlines |
| `hover` | black 4.5% | white 6% | Hover fill |
| `accent` | `#0068d6` | `#2f8fff` | Primary action, active state, focus ring |
| `accent-ink` | `#0058b8` | `#6ab0ff` | Accent-coloured text |
| `accent-soft` | accent 10% | accent 16% | Selected fills, filter chips |
| `good` / `good-soft` | `#1f7a36` | `#4cd471` | Yes, completed, post-participation |
| `bad` / `bad-soft` | `#c4001a` | `#ff6961` | No, failed, destructive |
| `warn` / `warn-soft` | `#9a4a00` | `#ffb340` | Attention, rate-limited, variable price |

### Companion palettes

Four tinted families for things that speak to the user rather than belong to a page. Pip's bubbles and chat use `apricot`. Notifications Pip says use `mint` (success), `butter` (warning), `rose` (error) and `apricot` (info, loading). Each family has the same four tokens.

| Family | Light surface / line / soft / ink | Dark surface / line / soft / ink |
|---|---|---|
| `apricot` | `#ffead6` `#f5b47a` `#ffd9b5` `#8a4310` | `#36220f` `#7a4a1f` `#4a2e14` `#ffc48f` |
| `butter` | `#fff3c4` `#f0cf5c` `#ffe792` `#6b4d00` | `#332b0d` `#6b5a1f` `#463a12` `#ffe08a` |
| `mint` | `#dcf5ed` `#9fdcc9` `#c3ecdf` `#0b5e4e` | `#10332a` `#2f6b5a` `#174a3d` `#8fe8d1` |
| `rose` | `#ffe3e8` `#ffa3b3` `#ffccd6` `#a3112e` | `#3a1820` `#7a2e3f` `#4d1f2a` `#ff9fb2` |

- `-surface` is the panel background, `-line` its outline (`border-*-line`, or `0 0 0 1px var(--*-line)` ahead of `--shadow-pop`), `-soft` a stronger fill inside it (the user's own message), `-ink` tinted text (a status line).
- Never page chrome, tables or controls. Buttons inside a companion panel keep the normal accent.
- `butter`, `mint` and `rose` mean status only in Pip's notifications, and there always with an icon and words. On pages, status stays `good`, `bad` and `warn`.

Rules:

- One accent. Blue marks what is interactive-and-selected or the single primary action in a view. It is not used for decoration.
- Status colour is reserved for status. Green, red and amber appear only where the data means yes, no or caution.
- Status always comes with a word. A badge reads "Yes", "Failed", "Post"; colour alone never carries the meaning.
- Surfaces are separated by a one-step change in tone plus a hairline, not by heavy shadows.

### Theme

The theme is a `dark` class on `<html>`, stored in `localStorage.theme`. v1 uses the same key, so the choice follows the user between shells. An inline boot script in `<head>` applies it before first paint. Every component must be checked in both themes.

## Typography

Base size is `0.8125rem` (13px) at line-height 1.45: the product is dense by design. Sizes are in `rem` so the layout scales with the user's text-size setting.

| Role | Class | Size | Weight | Tracking |
|---|---|---|---|---|
| Page title | `type-display` | `1.375rem` | 600 | `-0.022em` |
| Stat value | `type-stat` | `1.125rem` | 600 | `-0.015em` |
| Dialog and sheet title | `type-title` | `0.9375rem` | 600 | `-0.01em` |
| Body, cells, controls | `text-md` | `0.8125rem` | 400 (500 for emphasis) | 0 |
| Column header, small control | `text-xs` | `0.75rem` | 500 | 0 |
| Field label, group label, badge | `type-label` | `0.6875rem` | 500 | `+0.02em` (badge `+0.01em`) |
| Text under a column header, avatar initials | `text-3xs` | `0.625rem` | 400 | 0 |

- Use the class, never `text-[...]`. `type-*` set size, weight and tracking together; `tracking-*`, `leading-*` and `font-*` placed beside them still override. `text-md` and `text-3xs` are bare sizes.
- Body text inherits `text-md` from `<body>`; only controls that reset their font need the class.

- Tracking tightens as text grows and opens slightly for the smallest sizes. Do not apply one letter-spacing value across sizes.
- Hierarchy comes from weight and tone (`ink`, `ink-2`, `ink-3`) before size.
- Numbers, counts and dates use `tabular-nums` so columns of figures line up.
- Reference numbers and other identifiers use Geist Mono.
- Labels are sentence case. No all-caps labels.
- Numbers are formatted with `toLocaleString("en-IN")`; dates with the helpers in `lib/format-ist.ts`.

## Shape, depth and materials

- Radius: `rounded-md` (6px) for small controls and menu items, `rounded-lg` (8px) for buttons and inputs, `rounded-xl` (12px) for cards, popovers and the table container, `rounded-2xl` (16px) for dialogs. Badges use `0.3125rem`.
- Outlines are drawn with `box-shadow`, not `border`, so they do not change an element's size: `edge` (inset, `line-strong`) for controls, `hairline` (outer, `line`) for resting tiles and pills, `card` (hairline plus a 3px soft drop) for the table container and the active nav item.
- Shadows: `--shadow-pop` for anchored popups, `--shadow-sheet` for dialogs and the sheet. Larger surfaces get the deeper shadow. Flat content gets none.
- `edge`, `hairline` and `card` each set the whole `box-shadow`; do not combine one with a `shadow-*` class on the same element.
- Translucency is for chrome that content scrolls under: the sticky table header uses `.glass` (`backdrop-filter: blur(20px) saturate(180%)`). Never stack one translucent layer on another.
- Edge shadows appear only when there is something underneath. The pinned-column shadow shows only once the table is scrolled horizontally.
- A modal task (dialog, sheet) dims the page with `--scrim`. Popovers and menus do not.

## Motion

Motion exists to confirm an action or keep the user oriented. If it does neither, it is removed.

**Tokens**

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Anything entering or responding |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Movement between two on-screen positions |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Reserved for edge panels driven by CSS |
| `--dur-press` | 120ms | Press feedback |
| `--dur-pop` | 150ms | Popovers, menus, selects, tooltips, chips |
| `--dur-dialog` | 220ms | Dialogs and scrim |

**Rules**

- Feedback lands on pointer-down. Every pressable element carries `press` (scale to 0.97 while held, 120ms, skipped when disabled or under reduced motion). `Button`, `IconButton`, `Select`, `StatTile` and `Pill` already have it.
- Animate `transform` and `opacity` only. Never `width`, `height`, `padding` or `margin`; never `transition: all`. This is why the sidebar collapses instantly: animating its width re-laid out the table every frame.
- Anchored popups (`.pop`) scale from their trigger with `transform-origin: var(--transform-origin)`, entering from `scale(0.97)` and opacity 0. Dialogs (`.dlg`) are not anchored and stay centre-origin, entering from `scale(0.96)`.
- Nothing enters from `scale(0)`.
- Exit is faster than enter (popups 100ms out, dialogs 140ms out).
- Use CSS transitions (through Base UI's `data-starting-style` / `data-ending-style`), not keyframes, for anything a user can interrupt. Keyframes are only for constant motion: the progress bar, the spinner, skeleton pulse.
- No easing-in on UI. No animation on keyboard-initiated actions or on things done dozens of times a day: sorting, paging, filtering and row updates do not animate. A loading page dims its rows and shows a thin progress bar; rows never stagger in.
- Hover effects sit behind `@media (hover: hover)`, which Tailwind's `hover:` variant applies. Hover background is `not-disabled:hover:bg-hover`.
- Tooltips wait 500ms; once one is open, neighbours open instantly with no transition.

**Gestures**

Springs (`motion`) are used only where a gesture exists. Today that is the sheet (`components/v2/ui/sheet.tsx`):

- Critically damped spring (`bounce: 0`, `duration: 0.4`). A panel that just arrived does not overshoot.
- It enters and leaves along the same edge.
- It is dragged by its header with pointer capture and can be grabbed mid-animation.
- Dismissal is decided by where the gesture is heading, not where it was released: release offset plus projected momentum (`(v / 1000) * d / (1 - d)`, `d = 0.998`) past half the panel width dismisses. A quick flick is enough; a slow short drag snaps back.
- Dragging past the open edge rubber-bands (`dragElastic` 0.06) instead of stopping dead.

## Utilities

Defined with `@utility` in `v2.css`. Their names are deliberately not Tailwind prefixes: `cn` runs `tailwind-merge`, which would read a custom `text-body` or `shadow-card` as a colour and drop it next to `text-ink`.

| Class | What it is |
|---|---|
| `press` | Press feedback for anything clickable |
| `edge` | Control outline: inset 1px `line-strong` |
| `hairline` | Resting surface outline: 1px `line` |
| `card` | `hairline` plus a soft drop |
| `type-display`, `type-stat`, `type-title`, `type-label` | Type roles, see Typography |
| `no-scrollbar` | Hides the scrollbar of a scroller |
| `thumb-scrollbar` | Scrollbar reduced to a 6px thumb, for small scrollers such as table cells |
| `.pop`, `.dlg`, `.scrim`, `.glass` | Overlay surfaces and their enter/exit motion; used inside `ui/overlay.tsx` |

**Stacking.** Use the names, as `z-(--z-popup)`. A plain `z-10` is fine only inside an element that already makes its own stacking context.

| Token | Value | Layer |
|---|---|---|
| `--z-pinned` | 10 | Pinned table cells |
| `--z-header` | 20 | Sticky table header |
| `--z-header-pinned` | 30 | Pinned header cells |
| `--z-rail` | 30 | Sidebar |
| `--z-progress` | 40 | Table progress bar |
| `--z-assistant` | 45 | Pip (assistant orb and chat card); dialogs and sheets cover it |
| `--z-modal` | 50 | Dialog, sheet and their scrim |
| `--z-popup` | 60 | Popover, menu, select |
| `--z-tip` | 70 | Tooltip |

**Opacity.** Disabled is `opacity-50`. Pending or loading (a change being saved, rows being refetched) is `opacity-60`. No other values.

**Icon sizes.** `size-3` inside controls 24px or smaller (sort arrow, chip remove), `size-3.5` in buttons and small icon buttons, `size-4` in 32px icon buttons, nav, list and menu rows, `size-5` in empty states and drop zones.

**Spacing.** Tailwind's scale, no arbitrary values. Page padding `p-4`, gap between page blocks `gap-3`, gap between controls in a row `gap-2`, between an icon and its label `gap-1.5`, form fields `gap-3`, table cell `px-3 py-2`, dialog body `px-5 py-3`.

**Durations.** `duration-(--dur-press)`, `duration-(--dur-pop)`, `duration-(--dur-dialog)`. No `duration-150`.

## Accessibility

- Every focusable element shows a 2px accent `:focus-visible` ring.
- Icon-only buttons use `IconButton`, which requires a `label` (it becomes both `aria-label` and tooltip text).
- Toggle buttons set `aria-pressed`; the current nav item and page set `aria-current`; sortable headers set `aria-sort`.
- Menus, selects, popovers, dialogs and tooltips are Base UI components, which supply keyboard handling and focus management. Do not hand-roll these.
- `prefers-reduced-motion: reduce`: scale and slide are removed and replaced by opacity changes; the sheet cross-fades and cannot be dragged; looping animations stop.
- `prefers-reduced-transparency: reduce`: `.glass` becomes a solid surface.
- `prefers-contrast: more`: hairlines use `line-strong` and `.glass` becomes solid.

## Layout

- A fixed left sidebar (`14.5rem`, or a `3.5rem` icon rail when collapsed) and one content area. There is no top bar; the theme toggle and account menu sit in the sidebar footer. Collapse state is stored in `localStorage["v2-sidebar"]` and applied before first paint. Ctrl+B toggles it.
- Navigation is grouped by task (Tenders, Operations, Reference, Admin) and each item is named for what it contains. Admin is shown to `admin` and `developer` roles only.
- A page fills the viewport height. Its content is a column with `1rem` padding and `0.75rem` gaps:
  1. Header row: page title with live count on the left, page actions on the right.
  2. Optional summary strip: stat tiles that double as filters, then scope controls.
  3. The table, which takes all remaining height and scrolls internally.
- The page itself does not scroll; the table does.

## Components

### Buttons (`ui/button.tsx`)

| Component | Props | Use it for |
|---|---|---|
| `Button` | `variant?: "primary" \| "secondary" \| "ghost" \| "danger"` (default `secondary`), `size?: "md" \| "sm"`, `loading?`, `icon?`, plus button attributes | Any labelled action |
| `IconButton` | `label` (required), `size?: "md" \| "sm"`, plus button attributes | An icon-only action; `label` is its accessible name and tooltip |

- `primary`: one per view or dialog, for the main action. `ghost`: cancel and low-emphasis. `danger`: stop or destroy. `md` is 32px, `sm` is 28px.
- `loading` shows a spinner in place of the icon and disables the button.
- Labels say what happens: "Save website", "Queue analysis", "Parse 3 files". Not "OK" or "Submit".

### Fields (`ui/field.tsx`)

| Component | Props | Use it for |
|---|---|---|
| `Input` | input attributes | One line of text, a number, a date, a file |
| `Textarea` | textarea attributes | Several lines |
| `Field` | `label`, `children`, `className?` | A small label above one control |
| `Checkbox` | `checked`, `onChange(checked)`, `children`, `disabled?` | One on/off option with its label |
| `CheckMark` | `checked` | The box alone, inside a row that is already a checkbox or menu item |
| `Choice` | `label`, `options: { value, label }[]`, `value`, `onChange(value \| null)`, `allowClear?` | Picking one of up to about five options that fit on a line: yes/no, presets |
| `Badge` | `tone?: "neutral" \| "accent" \| "good" \| "bad" \| "warn"`, `title?` | A status word |
| `Dash` | none | Every empty value. Never a blank cell |

- Native inputs are used where the platform has a good one (`type="file"`, `type="number"`). Dates are the exception: never `type="date"`, always `DatePicker`.
- More than about five options, or options that do not fit on a line: use `Select`, not `Choice`.

### Dates (`ui/calendar.tsx`)

Built on `react-day-picker`, styled only with v2 tokens (its stylesheet is not imported).

| Component | Props | Use it for |
|---|---|---|
| `DatePicker` | `value` (`yyyy-MM-dd` or `""`), `onChange(value)`, `min?`, `max?`, `placeholder?`, `label?`, `disabled?` | One date: a field-shaped button that opens a calendar. Pressing the selected day clears it |
| `DateRange` | `from`, `to` (`yyyy-MM-dd` or `""`), `onChange(from, to)` | A From/To pair of `DatePicker`s; each end limits the other, and either end may stay empty |
| `Calendar` | every `react-day-picker` prop | The month grid alone, when a picker needs a different shell |

- Today is outlined; the selected day is filled with `accent`.
- Dates are shown as `d MMM yyyy` and passed around as `yyyy-MM-dd` strings.

### Page (`ui/page.tsx`)

| Component | Props | Use it for |
|---|---|---|
| `Page` | div attributes | The frame of every page: full height, `p-4`, `gap-3` column |
| `PageHeader` | `title`, `meta?`, `actions?` | Title with a live figure beside it, page actions on the right |
| `StatTile` | `label`, `detail?`, `value` (null while unknown), `selected?`, `onClick?` | A headline number; with `onClick` it toggles a filter |
| `Pill` | `selected`, `onClick`, `count?`, `children` | A row of quick filter toggles |
| `Skeleton` | `className` (its size) | First-load placeholder |
| `EmptyState` | `icon`, `tone?: "neutral" \| "bad"`, `title`, `description?`, `action?` | Nothing to show, or could not load |

### Overlays (`ui/overlay.tsx`, `ui/sheet.tsx`)

| Component | Use it for |
|---|---|
| `Tip` | A visual label for a control that already has an accessible name |
| `Popover` | A panel anchored to its trigger: column filters, date window, full cell text |
| `Menu` | A list of actions or toggles: upload, exclusions, columns, account |
| `Select` | Picking one value from a short list |
| `Combobox` | Picking one value from a list too long to scan (item codes): type to narrow it |
| `Dialog` | A short modal task with a clear outcome |
| `Sheet` | Long read-only content beside the table (agent report) |

Props:

| Component | Props |
|---|---|
| `Tip` | `label`, `side?`, `children` (one element) |
| `Popover` | `trigger?`, `children`, `open?`, `onOpenChange?`, `side?`, `align?`, `anchor?`, `className?` |
| `Menu` | `trigger`, `children`, `side?`, `align?`, `className?`; children are `MenuItem` (`icon?`, `onClick?`, `disabled?`, `tone?: "bad"`), `MenuCheckItem` (`checked`, `onCheckedChange`, `closeOnClick?`), `MenuLabel`, `MenuSeparator` |
| `Select` | `label` (accessible name), `value` (null for none), `onChange`, `options: { value, label }[]`, `placeholder?`, `size?: "md" \| "sm"`, `disabled?`, `icon?` |
| `Combobox` | `label` (accessible name), `value` (null for none), `onChange`, `options: { value, label }[]`, `placeholder?`, `size?: "md" \| "sm"`, `disabled?`. Shows the first 100 matches; "Not set" clears |
| `Dialog` | `open`, `onOpenChange`, `title`, `description?`, `children?`, `footer?`, `width?` (default `32rem`) |
| `Sheet` | `open`, `onOpenChange`, `title`, `children`, `width?` (default `40vw`) |

- The assistant (`components/v2/assistant/assistant.tsx`) is mounted once in `AppShell`, not per page. It is the wobnimo `pip` mascot fixed bottom-right; clicking it or Ctrl+J opens a non-modal chat card above it. The mascot's state follows the chat (thinking, speaking, error, celebrating), the composer (listening) and inactivity (sleeping). The chat streams from `app/api/assistant/route.ts`. One component per file in `components/v2/assistant/`: `pip-orb`, `thought-bubble` (cloud, for what Pip thinks), `speech-bubble` (tail, for what Pip says), `chat-window`, `chat-thread`, `chat-message`, `chat-composer`, `chat-welcome`, `use-pip-mood`; shared motion in `pop.ts`. New pieces get their own file.
- Dialog buttons always go in `footer`: ghost "Cancel" first, primary action last. When the body is a `<form>`, give the form an `id` from `useId()` and put `type="submit" form={id}` on the primary button.
- Dialogs that edit one row open with a summary of that row (organisation and brief) so the user can see what they are changing.

### Data table (`data-table/`)

The table is controlled: rows, total, page, sort, filters and column visibility all come in as props with change callbacks. It owns only view state (column widths, scroll position).

- **Header:** one row, 40px tall. Label (with optional small provenance text under it), sort arrow, filter button. Clicking the label sorts descending, then ascending. The filter button is tinted when that column has an active filter.
- **Filter popover:** a "Contains" search box, then the column's typed control: multi-select list (options fetched when the popover opens), date range with optional presets, yes/no, or a custom control supplied by the column. "Clear" removes that column's filters.
- **Filter bar:** every active filter is a chip above the table, including filters that live outside the columns, passed in as `extraChips`. A filter the user cannot remove is shown as a chip without a remove button. Nothing narrows the list invisibly.
- **Cells:** text is capped at three lines by `Clamp`. Longer text scrolls inside the cell; a bare scroll thumb (`thumb-scrollbar`: no arrow buttons, no track) shows while the cell is hovered, in a gutter that is always reserved so text does not rewrap. A cell is a live scroller only while hovered, always on touch screens; a scroller in every cell makes table scroll choppy. No ellipsis, no click-to-expand popover. A per-item list (one block per costing item: ERP items, item-wise ranks) uses `Clamp lines="fill"` inside a `flex h-full flex-col` parent: it takes the full height the other cells give the row (at least three lines) and scrolls past that, without making the row taller. Cells carry `h-px` so that height can be filled.
- **Pinned columns:** sticky to the left, capped at half the table's width (`MAX_FROZEN_SHARE`); beyond that the rightmost pinned columns scroll with the rest.
- **Rows** are virtualised, so a 500-row page scrolls smoothly.
- **Row groups:** pass `groupBy` and consecutive rows with the same key form one group. A column marked `spanGroup` draws one cell for the whole group, from its first row (the docket number on the participation pages). Groups are the unit of virtualisation, so a spanning cell is never cut from its rows. The table still knows nothing about what the key means.
- **Column resize:** drag the header edge (pointer capture, 50px minimum). Widths are not persisted.
- **States:** skeleton on first load only; progress bar plus dimmed rows on later loads, with the old rows kept in place; an error state with "Try again"; an empty state that offers to reset column filters.
- **Footer:** range and total, rows per page (10, 25, 50, 100, 500), first/previous/window of five/next/last.

### Column definitions

A page describes its table as `DataTableColumn<Row>[]` (see `data-table/types.ts`). Per column: `id`, `header`, `width`, `frozen`, `hidden`, `sortable`, `search`, `filter`, `extraFilters`, `badges`, `spanGroup`, and either `text` (plain text for the default capped, scrollable cell) or `cell` (a renderer).

- A stack (`ColumnStack`) may pass `cell`: when it returns something for a row, that replaces the member list in that row's cell; `null` keeps the members. Used when a row's data has a different shape (item-wise ranks).
- A cell that edits data is its own small component: it dispatches the existing thunk, tracks its own pending state, shows a toast on success or failure, and owns any dialog it opens. The page holds no per-row dialog state.
- Editing in place is preferred for one-field changes (decision toggles, selects, remarks). A dialog is used when the change needs context or more than one input.
- A change shows immediately as pending and reverts with an error toast if the server refuses it.
- Edit affordances are small ghost icon buttons that are always visible, not revealed on hover.
- When the same field is edited in more than one place (a table cell and a sheet), describe it once in a field registry and render both from it: see `components/v2/pre-participation/fields.ts` and `FieldEditor` in its `cells.tsx`. The registry holds the label, the control kind, the choices, the lock and validation rules and the thunk that saves it.
- A sheet that shows every field of a row saves each field on its own, exactly as its table cell does. No "Save all": a half-saved row is worse than a visible per-field failure.

### Cell helpers (`data-table/cells.tsx`)

These know nothing about any page's rows. A page's own `cells.tsx` builds on them.

| Component | Props | Use it for |
|---|---|---|
| `Clamp` | `children`, `lines?: 2 \| 3 \| 4 \| "fill"` (default 3; `fill` takes the row's height, needs a flex column parent), `className?`, `title?` | Any cell content that can run long. Never write the `max-h-[3lh] overflow-hidden ...` string by hand |
| `StackedCell` | `primary`, `secondary?` | Two related values in one column (organisation over department) |
| `Chips` | `items: string[]` | A list of short values, one tag per line |
| `CellAction` | `children`, `action?`, `pending?` | Content with an always-visible `IconButton size="sm"` at its trailing edge; `pending` dims it while saving |

A column with plain text needs none of these: give it `text` and the table renders `Clamp` or `Dash` itself.

### Patterns

Written out by hand where they occur, because each has fewer than three uses or differs each time. Copy the string exactly.

| Pattern | Classes |
|---|---|
| Popover panel | `flex w-72 flex-col gap-3`, opening with `<h3 className="font-semibold">` |
| Form stack (dialog body) | `flex flex-col gap-3` of `Field`s |
| Two fields side by side | `grid grid-cols-2 gap-2` |
| List row (files, documents) | `<li className="flex items-center gap-2 border-b py-1.5 last:border-b-0">`: `size-4 text-ink-3` icon, `min-w-0 flex-1 truncate` name, trailing actions |
| Per-item list in a cell | `<div className="flex h-full flex-col">` > `<Clamp lines="fill" className="flex flex-col gap-1.5">` of `flex shrink-0 flex-col` blocks: `font-medium` item name, `text-xs text-ink-2 tabular-nums` figures |
| Inline tag inside a cell | `rounded-[0.3125rem] bg-sunken px-1.5 py-px text-xs` |
| Row summary at the top of a dialog | `mb-3 rounded-lg bg-sunken px-3 py-2` |
| Selected fill | `bg-accent-soft text-accent-ink` |
| Hover fill | `not-disabled:hover:bg-hover` |

## Feedback

- **Status:** progress bar while a page loads; "n matching" beside the title updates live.
- **Toasts are said by Pip.** Call sonner's `toast.*` as usual; when signed in, Pip renders them as speech bubbles (`notice-stack.tsx`, `notice-bubble.tsx`) and reacts with its face, and the sonner `Toaster` only shows on the sign-in pages. Up to three at once, newest nearest Pip; 4s, errors 6s, held while hovered, loading until it settles, a click sends one away. Bubbles are words only: no icon, no close button; the colour and Pip's face carry the tone. Try them at `/v2/design`.
- **Pip's voice.** Toast text never goes inline: it comes from `say` in `lib/pip-says.ts`, first person and one plain sentence ("I've set APM to YES.", "I couldn't save the price."). A failure is a `say.couldNot(...)` or `say.notSaved(...)` title passed to `toastError`, which puts the reason underneath. Add a new line to `say` rather than writing a one-off string.
- **Completion:** a success toast naming what changed ("I've set APM to YES.", "I've saved the website.").
- **Warning:** before a bulk action, a dialog states how many rows it affects.
- **Error:** a toast with the server's message; the control returns to its previous value. Always go through `toastError` / `describeError` (`ui/errors.ts`), never `err.message`: they turn "signed out", "page out of date after a deploy" and "no connection" into what the user should do next.

Long-running work (export, bulk AI analysis) reports progress and, where it can be interrupted, turns its button into a Stop control.

## Writing

- Sentence case everywhere.
- Name things by what they contain or do.
- Say what is true now: "No tenders match these filters", "Assignment is locked once a person is allocated".
- Avoid jargon the user did not bring. Keep domain terms users already use (APP, APS, APM, EMD, GeM).

## Adding a page to v2

1. Create `app/(v2)/v2/<page>/page.tsx` rendering a view from `components/v2/<page>/`.
2. Write a hook that wires the page's existing slices and thunks, following `components/v2/tenders/use-tenders.ts`. A page that holds all its rows in the browser skips this: `useClientTable` (`data-table/use-client-table.ts`) filters, sorts and pages them, and `ClientTablePage` (`data-table/client-table-page.tsx`) is the whole view for a page that is only a header and a table.
3. Write `columns.tsx` for the page. Plain-text columns need only `text`; build the rest from `data-table/cells.tsx` and `ui/`. Add a page `cells.tsx` only for cells that edit data or are specific to this page.
4. Compose the view: `Page` > `PageHeader` > optional strip of `StatTile` and `Pill` > `DataTable`. First load renders `Page` with `Skeleton` blocks; add the same to the route's `loading.tsx`.
5. Set `v2: true` and the new `href` on the page's entry in `components/v2/shell/nav-items.ts`.
6. Check light and dark, keyboard-only use, and reduced motion.
7. If the page needed a new primitive or variant, add it to `components/v2/ui`, to this file and to `components/v2/design/showcase.tsx`.
