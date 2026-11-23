# UI Prototype

Several **radically different** versions of one screen on a single route, switched by a URL search param and a floating bottom bar. Use this when the question is **"what should this look like?"** before any real build. If the question is about state or business logic, use [LOGIC.md](LOGIC.md).

The point is to spend a few thousand tokens choosing a direction, not tens of thousands building the wrong one.

## Token budget rules

1. **Cheap tier writes it.** A prototype is bulk, disposable authoring. Dispatch it on the worker tier (`.agents/skills/dispatch-worker/SKILL.md`), never the lead or advisor tier. The lead picks the question and the variant directions, then reviews screenshots.
2. **Three variants, not five.** Default to 3. Go to 4 only if the user asks. More variants add reading cost, not insight.
3. **One screen.** Prototype the single screen or section that carries the question. Not the flow, not the navigation, not the settings page.
4. **Fake data, inline.** A small hardcoded array or object per variant. No API, no MSW, no database, no auth, no loading or error states unless they are the question.
5. **Reuse what exists.** Use the project's tokens, `DESIGN.md`, and component library if present. Do not invent a design system. If the project has none, one accent colour and system fonts.
6. **No tests, no types beyond what compiles, no abstractions.** Duplicate code between variants freely; sharing code couples them and makes them converge.
7. **Look once, in batch.** Take one screenshot per variant at 375px and 1280px (Playwright), write them to `RUN_ROOT/reports/screenshots/` (or the scratchpad), and judge from those. Do not loop screenshot, tweak, screenshot.

## Process

### 1. State the question and the axes

One paragraph: what decision is this screen helping make, and for whom. Then name **3 directions that differ on the dimension that matters**, such as layout model (table vs cards vs timeline), density (dense vs spacious), or primary action placement. Variants that differ only in colour or radius are one variant. Write the directions down before any code.

If the user is around, ask them to confirm or swap a direction (one question, options with a recommendation). If not, proceed and state the assumption in the prototype's header.

### 2. Place it on one throwaway route

Put it where the real screen will live, following the project's routing convention, named so nobody mistakes it for production, for example `app/(proto)/billing-proto/page.tsx` or `src/pages/__proto__/billing.tsx`. Do not add a new top-level structure.

### 3. Build the variants

- One file per variant: `variant-a.tsx`, `variant-b.tsx`, `variant-c.tsx`, each exporting a component that takes the same fake data.
- The route reads `?v=a|b|c` (default `a`) and renders the matching variant.
- A **floating bottom bar**, fixed, small, outside the variant's own layout, with a button per variant, the active one marked, and the direction's one-line name. It updates the URL param without a full reload so a variant can be shared by link.
- Each variant must be usable enough to judge: real-looking labels, a populated state, hover and focus on the main control. Skip responsive polish beyond 375px and 1280px not breaking.

### 4. Show, don't narrate

Give the user the dev command and the three links (`?v=a`, `?v=b`, `?v=c`), plus the screenshots. One line per variant on what it optimises for and what it gives up. Do not paste code into chat.

### 5. Iterate by editing, not regenerating

Feedback like "A's layout with C's header" is an edit to one variant, not three new files. Keep the others untouched until the user picks.

### 6. Capture the answer and the prototype

When the user picks, follow the [SKILL](SKILL.md) capture rule. The decision (chosen direction, and why the others lost) goes into the design spec or the issue. The prototype goes to a throwaway branch and is deleted from the working branch. Production code is then built fresh from the chosen direction, using the real components, real data and the normal pipeline. Do not promote prototype code, which was written without types, accessibility or states.

## Anti-patterns

- Building a full flow or multiple screens "to be realistic".
- Wiring real APIs, auth or persistence.
- Variants that are the same layout with different colours.
- Sharing components across variants so they stay alike.
- Polishing the winner inside the prototype instead of rebuilding it properly.
- Running the lead or advisor tier to write throwaway markup.
- Repeated screenshot-and-tweak loops before the user has seen anything.
