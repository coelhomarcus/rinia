# UI scale

The application uses a compact control scale inspired by shadcn/Base UI, in a light and a dark theme built from the same semantic tokens.

| Component | Sizes | Standard classes |
| --- | --- | --- |
| Button | xs / sm / md / lg / xl | `h-5` / `h-6` / `h-7` / `h-8` / `h-10` |
| Icon button | xs / sm / md / lg / xl | `size-5` / `size-6` / `size-7` / `size-8` / `size-10` |
| Input, Select, Combobox | sm / md / lg | `h-7` / `h-8` / `h-10` |
| Icons in controls | default | `size-4` |

Use `controlScale` and `controlTokens` from `control-scale.ts` for shared primitives. Related controls use `gap-2`, sections use `gap-4`, and major blocks use `gap-6`. Compact cards use `p-4`; standard cards and dialogs use `p-6`.

All new UI must keep the existing semantic color tokens and visible focus rings. Arbitrary spacing or radius values should be reserved for a documented, component-specific visual requirement.

## Composition patterns

- Group a label and its control with `gap-2`, and stack fields with `gap-4`. Input, Select, Checkbox, and Textarea render their own label, description, and error.
- Use `ToggleGroupRoot` and `ToggleGroupItem` for mutually related formatting or filter controls instead of styling independent buttons as a group.
- Keep overlays and menus on the Base UI primitives so focus management, Escape, portals, and keyboard navigation remain consistent.
- Use `Sheet` for controlled side panels such as Issue Peek. It owns the backdrop, viewport, dialog title, focus handling, and mobile full-screen behavior.
- Use `data-icon="inline-start"` and `data-icon="inline-end"` for Button icons. Standalone utility buttons use `data-icon` on the icon itself.

## Palette and surfaces

The palette lives in `styles/palette.css`. Both themes come from one LCH recipe: a near-neutral base gray, an indigo accent (hue 288) and a contrast level. Every surface, border and text color is a step in lightness from the base, so the two themes keep the same order:

| Step | Token | Light | Dark |
| --- | --- | --- | --- |
| Sidebar, app background | `--bg-canvas` | `#efeff0` | `#09090a` |
| Content panel | `--bg-surface-1` | `#f9f9fa` | `#121213` |
| Cards | `--bg-layer-1` | `#ffffff` | `#191a1b` |
| Secondary controls | `--bg-layer-2` | `#ffffff` | `#1b1c1d` |
| Menus, popovers, tooltips, toasts | `--bg-menu` (`bg-menu`) | `#ffffff` | `#202122` |
| Accent | `--bg-accent-primary` | `#6d78d5` | `#5e6ad2` |
| Danger | `--bg-danger-primary` | `#f34e52` | `#f34e52` |

- Menus and popovers use `overlayChrome` or `bg-menu` with `shadow-overlay-200`, and their highlighted item `bg-menu-hover`. Dialogs use `bg-layer-1` (or `bg-menu` for the command palette), `rounded-xl` and `shadow-overlay-100`; their backdrop is a plain `bg-overlay`, without blur.
- Theme shadows are runtime variables (`--elevation-low`, `--elevation-medium`, `--elevation-high`) behind `shadow-raised-*` and `shadow-overlay-*`. Tailwind's own `shadow-sm`/`shadow-lg`/`shadow-xl` are switched off by the token set and draw nothing.
- Status colors are fixed LCH points shared by both themes; only their text variants (`text-danger-primary`, `text-success-primary`, `text-warning-primary`) move, darker on light and lighter on dark. Badges are neutral chips with a hairline edge, and only the text carries the status color.
- Priority bars use the muted text color; urgent is the only priority drawn in color.

## Buttons

- Every button is a pill (`rounded-full`) in a 500 weight; an icon-only button is a circle the height of its size.
- `primary` fills with the accent and white text; `primary-destructive` fills with `--bg-danger-primary`. `secondary` is a raised control: `bg-layer-2`, a 0.5px alpha edge (`--border-control`, darker on hover) and `--elevation-low`. `tertiary` is text that gains a translucent fill on hover.
- `secondary-destructive` and `tertiary-destructive` keep the danger color in the text and tint only on hover.
- Disabled buttons drop to 60% opacity.

## Feedback

- `Alert` is the one card for a message about a form or panel: a neutral surface, the tone (`error`, `warning`, `success`, `info`) only in its icon, an optional `title`, and `actions` at the end. Do not tint a whole block or its text yellow, red or green.
- `InlineNotice` is one line next to the thing it is about, such as a change that did not sync or a field that did not save. It also fits inside a settings row's description.
- Toasts confirm actions that leave the screen; an `Alert` stays where the result happened, such as "Profile saved" under the form.
- A control that changed state shows it in place: the copy button turns into a check, a loading button keeps its width.

## Contrast

- Text: primary, secondary and tertiary pass 4.5:1 on every surface of both themes; placeholder text and icons drawn without a label keep at least 3:1.
- Both themes use near-neutral grays with a trace of the base hue. White cards and controls sit one step above the page (`--bg-surface-1`) and the sidebar one step below it (`--bg-canvas`); the card edge comes from `--border-subtle`.
- The placeholder color sits a little above the generated faint label so it keeps 3:1 on the content panel.
- Colors people choose, such as a state's color, go through a class that caps their lightness on the light theme (`.state-icon`), so a pale yellow still reads. Do not paint a chosen color straight onto an icon that stands alone.

## Motion

The interface answers at once and lets go gently. The tokens live in `globals.css`, and `motion.ts` mirrors them for timers.

| Token | Value | Used for |
| --- | --- | --- |
| `--motion-highlight-in` / `--motion-highlight-out` | 0s / 150ms | Hover and keyboard highlights: they appear instantly and fade out |
| `--motion-quick` | 100ms | Small state changes |
| `--motion-enter` / `--motion-exit` | 150ms / 100ms | Menus, popovers, selects and tooltips arriving and leaving |
| `--motion-dialog` | 200ms | Dialogs and their backdrop |
| `--motion-regular` | 250ms | Side sheets and larger panels |
| `--ease-out-quint`, `--ease-out-cubic`, `--ease-out-quad` | | Arrivals use quint; exits use cubic |

- Highlights need no classes: a zero-specificity baseline in `globals.css` gives links, buttons, rows, menu items and anything with a `hover:bg-*` or `data-highlighted:bg-*` class the instant-in, 150ms-out color transition. A component that sets its own color transition adds `hover:duration-0` (and `data-highlighted:duration-0` for menu items) to keep the instant start.
- Overlays use `overlay-motion`: a fade and a 0.97 scale from the anchor on the way in, a plain fade on the way out. Dialogs use `dialog-motion` (fade and 0.96 scale) over a `backdrop-motion` backdrop, never a blur.
- Tooltips share one `TooltipGroup` at the app root: the first waits 500ms, and once one is showing, its neighbors open at once and without animation (`data-instant`). Pass `delay` only for a tooltip that must differ.
- Two icons that trade places (copy and its check, follow and unfollow) go through `IconSwap`, which cross-fades and scales them in one slot.
- The checkbox's check draws itself as it scales in. New content in place (alerts, notices, list items) uses `animate-enter`.
- Buttons and icon buttons do not move when pressed; checkboxes still scale to 0.9, behind `motion-safe:` and never while disabled.
- Navigation that only switches a list's filter does not run a view transition; the list animates its own rows.
- Everything respects `prefers-reduced-motion`.

## Phones

Below `md` (768px) the app is a phone app, not a squeezed desktop.

- **Shell.** Content runs edge to edge on `bg-surface-1`, with no inset panel. `MobileTabBar` sits along the bottom edge with the home-indicator inset: Home, My issues, a round accent button that creates an issue, Inbox (with the unread dot), and Search (the command palette, full screen with Cancel). There is no navigation drawer.
- **Home.** `/home` is the sidebar as a page (projects, favorites, account), and `/settings` lists the settings sections. On wider screens both redirect, because the sidebar is always there.
- **Headers.** Top-level tabs show only their title. Deeper pages start with `MobileBackButton`, which goes back in history or to a fallback when opened from a link. Breadcrumbs, presence and pagers give way; a project's sections become pill tabs under its header.
- **Lists.** Issue rows wrap into two lines: status, a title of up to two lines at 15px, and the assignee; then the identifier, labels, due date and priority under the title. Pill tab rows scroll sideways with a fade at the edge. Keyboard hints (numbers, shortcuts) are hidden.
- **Menus.** Menus, selects and popovers open as bottom sheets: full width, a grabber, rows at least 44px tall, over a dim layer. This is CSS on Base UI's positioner in `globals.css`, so components need no changes. Tooltips and editor toolbars keep their anchored position.
- **Composer and dialogs.** Creating an issue takes the whole screen and rises from the bottom. Other dialogs sit at the bottom edge.
- **Gestures.** `SwipeRow` gives a row a swipe-left action on touch screens; the inbox uses it to mark notifications read or unread. Vertical scrolling stays with the browser, and a swipe never also opens the row.

## Rich text

`RichTextEditor` is a shared Tiptap composition. Editable instances use a sticky top toolbar, a selection BubbleMenu, and `/` commands. Documents, descriptions, and comments opt into the `document`, `description`, or `comment` variant. Read-only instances do not mount editing controls and must keep task list controls inert.

Project icon selection is a searchable, keyboard-navigable palette. Persist semantic project icon keys, not Lucide component names, so the visual catalog can evolve without invalidating stored projects.

## What belongs here

The building blocks are the components the app imports and the ones shown on `/__design-system`: buttons, inputs, select, checkbox, badges, tooltips, sheets, and the layout around them.

Payment icons, social icons, marketing navigation, carousels, device mockups, rating badges, and the other UntitledUI leftovers are not part of this system.
