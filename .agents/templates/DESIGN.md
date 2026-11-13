# DESIGN.md — <product name>

The approved design baseline for this product. Roles treat this file as policy: the
Designer composes inside it, the Frontend Engineer implements it, and a change to it is
a product-owner decision, not a per-feature improvisation.

Copy this file to the product root and replace every `<placeholder>`. Sections with no
decision yet say `TBD — <who decides>` rather than being deleted, so the gap is visible.

## Product voice in one line

<How the interface should feel, in one sentence. e.g. "Calm and dense: a working tool for
people who use it all day, not a brochure.">

## Typography

| Role | Family | Size | Weight | Line height | Tracking |
|---|---|---|---|---|---|
| Display | <family> | <px/rem> | <weight> | <ratio> | <em> |
| Heading 1 | | | | | |
| Heading 2 | | | | | |
| Body | | | | | |
| Label / caption | | | | | |
| Numeric / tabular | | | | | |

Rules: one family unless a second is named here. No size outside this table. Numbers in
tables and money use the numeric role with `font-variant-numeric: tabular-nums`.

## Spacing and layout

- Spacing unit: `<4px>`; allowed steps: `<4, 8, 12, 16, 24, 32, 48, 64>`.
- Content max width: `<px>`; gutters: `<px>` at 375px, `<px>` at 1280px.
- Grid: `<columns and gap, or "single column with a max width">`.
- Radii: `<sm/md/lg values>`; elevation: `<the two or three shadows in use, with values>`.

## Colour

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--surface` | `<hex>` | `<hex>` | Page background |
| `--surface-raised` | | | Cards, sheets |
| `--text` | | | Primary text |
| `--text-muted` | | | Secondary text, helpers |
| `--border` | | | Dividers, input borders |
| `--accent` | | | Primary action, focus ring |
| `--accent-contrast` | | | Text on accent |
| `--success` `--warning` `--danger` `--info` | | | Status tones |

Rules: a raw hex outside this table is a review finding. Text and background pairs meet
WCAG AA (4.5:1 body, 3:1 large). Colour is never the only signal; every status pairs with
an icon and a word.

## Status tones

| Status | Tone token | Icon | Weight |
|---|---|---|---|
| Settled / informational | `--info` or plain text | <icon> | plain |
| In progress | `--info` | <icon> | outline |
| Needs the user to act | `--warning` | <icon> | strong |
| Failed | `--danger` | <icon> | strong |
| Succeeded | `--success` | <icon> | plain |

## Components

- Component library: `<shadcn/ui, Radix, none — hand-rolled>` at `<version>`.
- Icon set: `<Lucide>` at `<stroke width, sizes>`.
- Every interactive element has `:hover`, `:focus-visible`, `:active`, `:disabled`, and a
  loading state. Focus is visible against every surface token and never removed.
- Overlay (modal, dialog, sheet, popover): title in the header on the same line as the
  close control, header holds no description, a divider separates header from body.

## Motion

| Purpose | Duration | Easing | Property |
|---|---|---|---|
| State change (hover, toggle, focus) | `<120–160ms>` | `<ease-out or a specific cubic-bezier>` | `opacity`, `transform` |
| Entrance (overlay, menu) | `<180–240ms>` | | |
| Exit | `<shorter than entrance>` | | |
| Page or route change | `<if any>` | | |

Rules: animate `transform` and `opacity` only. Honour `prefers-reduced-motion` by removing
translation and keeping a cross-fade. A spinner appears only after `<400ms>`; a skeleton
is preferred for known layouts.

## Breakpoints

| Name | Width | Layout change |
|---|---|---|
| Base (mobile) | `<375px>` | |
| Tablet | `<768px>` | |
| Desktop | `<1280px>` | |

Mobile is required for every surface. A layout that only works at desktop is not approved.

## Accessibility baseline

- WCAG `<AA>` target; keyboard path through every flow, in reading order.
- Focus moves to the first meaningful element on route change and into overlays on open,
  and returns to the trigger on close.
- Every icon-only control has an accessible name. Every form field has a visible label,
  not only a placeholder.
- Live regions announce validation errors and long-running results.

## What this baseline refuses

- `<List the local inventions you do not want: custom date pickers, a second button
  style, colour-only status, decorative gradients, three competing card shadows.>`
