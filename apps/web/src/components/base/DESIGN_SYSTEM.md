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

## Feedback

- `Alert` is the one card for a message about a form or panel: a neutral surface, the tone (`error`, `warning`, `success`, `info`) only in its icon, an optional `title`, and `actions` at the end. Do not tint a whole block or its text yellow, red or green.
- `InlineNotice` is one line next to the thing it is about, such as a change that did not sync or a field that did not save. It also fits inside a settings row's description.
- Toasts confirm actions that leave the screen; an `Alert` stays where the result happened, such as "Profile saved" under the form.
- A control that changed state shows it in place: the copy button turns into a check, a loading button keeps its width.

## Contrast

- Text: primary, secondary and tertiary pass 4.5:1 on every surface of both themes; placeholder text and icons drawn without a label keep at least 3:1.
- The light theme uses pure neutral grays only. White cards sit one step above the page (`--bg-surface-1`) and the sidebar one step below it (`--bg-canvas`); the card edge comes from `--border-subtle`.
- Colors people choose, such as a state's color, go through a class that caps their lightness on the light theme (`.state-icon`), so a pale yellow still reads. Do not paint a chosen color straight onto an icon that stands alone.

## Motion

- Use the motion tokens: `--motion-enter` (200ms) and `--motion-ease-enter` for things that arrive, `--motion-exit` (120ms) for things that leave. `motion.ts` mirrors them for timers.
- Hover and color changes take `duration-150`. New content in place (alerts, notices, list items) uses `animate-enter`; overlays use `overlay-motion`.
- Pressed controls give way: buttons scale to 0.97, icon buttons and checkboxes to 0.9, always behind `motion-safe:` and never while disabled.
- Navigation that only switches a list's filter does not run a view transition; the list animates its own rows.

## Rich text

`RichTextEditor` is a shared Tiptap composition. Editable instances use a sticky top toolbar, a selection BubbleMenu, and `/` commands. Documents, descriptions, and comments opt into the `document`, `description`, or `comment` variant. Read-only instances do not mount editing controls and must keep task list controls inert.

Project icon selection is a searchable, keyboard-navigable palette. Persist semantic project icon keys, not Lucide component names, so the visual catalog can evolve without invalidating stored projects.

## What belongs here

The building blocks are the components the app imports and the ones shown on `/__design-system`: buttons, inputs, select, checkbox, badges, tooltips, sheets, and the layout around them.

Payment icons, social icons, marketing navigation, carousels, device mockups, rating badges, and the other UntitledUI leftovers are not part of this system.
