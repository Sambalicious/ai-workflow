# Stage 1 comparison: two roles, two fresh sessions

Both arms read only their own role file and the PRD, scoped to acceptance-criteria
groups 3, 5, 7 and 9 plus the cross-cutting criteria that constrain them. Same model,
same PRD, no shared context, no sight of the other arm or of `docs/proposals/`.

| | Arm A — Gherkin | Arm B — spec |
|---|---|---|
| Method file | `.agents/gherkin.md` | `.agents/spec-writer.md` |
| Output | 5 `.feature` files | 4 spec files |
| Units | 96 scenarios | 80 cases (108 runnable with parameter tables) + 2 manual checks |

## The headline: arm A has no criterion traceability at all

**Zero `@AC…` tags.** The Gherkin role asks for path tags (`@happy`, `@sad`, …) and
nothing else. So:

- An AC × path matrix **cannot be built for arm A**. Its files are organised by group, not
  by criterion.
- The traceability we saw in shoopa (`@S01_001 @AC01_03`) does not come from this role.
  It comes from shoopa's local `gherkin-spec.md` convention and its per-epic
  `validate-specs.mjs`. At the factory level, Gherkin never had the spine.

That reverses part of my original argument. I claimed "the IDs are the durable part" and
proposed replacing Gherkin with something that keeps them. The truth is closer to: the IDs
were always a project convention, and only the spec format makes them structural.

## Coverage by group and path

`A/B` = scenarios (A) over cases (B). `—` means the arm produced none.

| Group | happy | sad | validation | boundary | permission | duplicate | empty | concurrent | manual |
|---|---|---|---|---|---|---|---|---|---|
| 3 Pricing escalation | 5/7 | 3/3 | 3/4 | 4/6 | 2/1 | 2/3 | 1/1 | 2/— | —/1 |
| 5 Payment confirmation | 6/5 | 7/3 | 3/4 | 3/5 | 2/1 | 2/5 | 1/1 | 3/— | —/1 |
| 7 Accurate answers | 8/5 | 5/4 | 2/3 | 5/4 | 1/— | 1/2 | 1/1 | 1/— | 1/— |
| 9 Buyer confirmation | 3/4 | 4/2 | —/1 | 1/2 | 1/1 | 2/1 | 2/1 | 2/— | —/— |
| Compliance (A only) | 2/— | 1/— | —/— | 2/— | —/— | 1/— | 1/— | 1/— | —/— |

Totals excluding concurrency and manual: **A 63, B 58**.

## What the numbers say

1. **No sad-path collapse.** The review's worst case — a table that enumerates only happy
   paths — did not happen. B produced 58 failure-ish cases against A's 63, and it beat A on
   `boundary` and `duplicate` in group 5.
2. **B's real gap is concurrency.** A wrote 8 concurrent scenarios; B declared concurrency
   manual (2 checks) or absent. B's own Coverage rows admit it. This is the one path type
   where the table lost ground, and it is fixable in the role.
3. **A's numbers are self-reported; B's are machine-checked.** A's TL;DR counts matched its
   body here, but nothing enforces that. B's counts come from the checker, and its closure
   is verified rather than claimed.
4. **Both arms split groups the same way** (one file per group), and both inlined or
   factored cross-cutting criteria without prompting. That is the roles agreeing, not luck.

## Defects in the role file this run exposed

1. **AC numbering is unspecified.** B wrote `AC3_01`; production convention is `AC03_01`.
   B also invented `AC11_nn` for the PRD's unnumbered cross-cutting section. Two writers
   will produce incompatible IDs. The role must pin zero-padding and say what to do with an
   unnumbered section.
2. **Concurrency is a suggestion.** Instruction 3 asks "what if the action is repeated", not
   "what if two actors touch this at once". Make the concurrent question explicit and forbid
   a blank Coverage row when the PRD describes a shared resource.
3. **Per-rule minimum is weaker than per-criterion.** A rule can carry one non-happy case
   for a criterion with five sub-bullets. Require one non-happy case per criterion, not per
   rule.

None of these are reasons to abandon the format. All three are one-paragraph changes, and
all three are exactly what a stage-1 comparison exists to find.

## Verdict

**Conditional pass.** The spec format did not lose sad-path coverage; it lost concurrency,
and it gained traceability that Gherkin never had at the factory level. Stage 2 should not
start until the three role defects are fixed and one re-run confirms concurrency cases
appear.

## Limitations

- One model (the worker tier) authored both arms. A stronger model might extract more from
  either role; the comparison controls the format variable, not the model.
- One epic, four groups. EPIC-0005 is conversational; no form-validation-heavy epic has been
  run.
- Two arms, not two repeated runs, so intra-role variance is unmeasured.
- The arm B output was written by an agent that could run the checker, which arm A had no
  equivalent of. That is a property of the method, not noise. It is also the point.
