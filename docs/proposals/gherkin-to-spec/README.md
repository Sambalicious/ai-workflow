# Proposal: replace Gherkin with a numbered spec table

Status: **stage 1 ready.** The proposal was reviewed by a frontier model (Opus 5.5) and
returned APPROVE WITH CHANGES with eight blocking issues. All eight are applied below and
in the artifacts. Nothing in the pipeline is wired yet.

Decided: artifact `specs/` with a **Spec Writer** role, separate from the PM; no reader
outside the pipeline reads `.feature` files, so no export path is needed.

## Decision

Replace the Gherkin Spec Writer with a **Spec Writer** that produces one Markdown spec per
functional area: a criteria table, a rules table, a cases table, and a coverage table,
keeping the ID spine (`S07_001`, `AC07_01`).

Keep: the eight path types, the adversarial derivation, QA's independence from
implementation, the revision loop, every gate.

Drop: `.feature` syntax and `Given/When/Then` per case.

## Why

- **Nothing executes the Gherkin.** No `cucumber` or `playwright-bdd` dependency in
  shoopa; QA hand-translates and cites `Scenario IDs from 08-alerts-review.feature`. The
  executable-specification promise is unfulfilled.
- **It is large.** EPIC-0002 alone: 10 files, 1,923 lines, 13,596 words, 195 scenarios,
  passed whole to Backend, Frontend, QA and review.
- **The durable part is the IDs**, not the grammar.
- **The format is not cheaper.** Measured: 8% more characters per case than Gherkin, plus
  fixed overhead for criteria and coverage — 35% larger overall, because it states things
  Gherkin only implied. See `COMPARISON.md`. The reason to move is traceability, not size.

## Target format

One file per functional area under `specs/`, named `S<nn>-<slug>.md`.

```markdown
# S07 — Accurate answers, and escalation instead of invention

## Criteria   | AC | Criterion (quoted from PRD) | Rules |
## Rules      | ID | Rule | AC | Cases |
## Cases      | ID | Path | Title | Setup | Action | Expected |
## Coverage   | Path | Cases | Not applicable because |   (all eight rows)
## Manual checks | ID | Rule | How it is run | Required result |
## Examples / ## Gaps / ## TL;DR
```

Full role: [`spec-writer.md`](spec-writer.md). Worked examples:
[`S07`](example/EPIC-0005/S07-accurate-answers-escalation.md),
[`S05`](example/EPIC-0005/S05-payment-confirmation.md). Gherkin baseline for S07:
`example/EPIC-0005/gherkin-baseline/`.

### The invariants, and the checker

[`spec-check.mjs`](spec-check.mjs) enforces what the grammar used to imply:

- every criterion maps to rules or to `Gap`, and every rule's AC exists in Criteria;
- every rule cites a case, and at least one non-happy case or `happy-only: <reason>`;
- every case proves a rule; IDs are unique and match the file's `S<nn>` prefix;
- all eight coverage rows exist, name the right cases, or carry a reason;
- every case appears under its own path's coverage row;
- Action has no `;` and no "then"; Expected has at most three assertions;
- no empty cells, no unparseable rows, manual IDs included in closure.

The last two matter most: the first version of this checker **silently skipped** rows with
a capitalised path or a backticked ID and still reported "closure holds". Parse-by-section
with unparseable rows as errors is the fix, and it is why the old drafts now fail.

## Review outcome

| # | Finding | Applied |
|---|---|---|
| B1 | Path types became a suggestion; Coverage claim unchecked | Mandatory `## Coverage` table with eight rows; checker verifies labels and completeness |
| B2 | Closure satisfied by happy-only specs | Every rule needs a non-happy case or a reasoned `happy-only:` |
| B3 | Checker silently dropped unparseable rows | Parse by section; unknown shapes are errors; empty cells rejected; manual IDs counted |
| B4 | Criteria disappeared; AC column single-valued | `## Criteria` quotes every criterion; several ACs per rule; criteria→rules closure |
| B5 | Rules listing several items partly tested | Rule states one obligation; each listed item needs a case, or the rule is split |
| B6 | "One outcome per case" contradicted by examples | Checkable form: Action one action, no `;`/`then`; Expected ≤3 assertions; examples fixed |
| B7 | Stage 1 contradicted itself and the baseline was self-authored | Stage 1 is authoring-only (below); production [5e] stays Gherkin; baseline labelled as format cost, not role behaviour |
| B8 | `spec` artifact alias collides with PM routing | Controller routing change moves forward into stage 2, with a controller test |

Case titles were added (B7) so QA can keep its convention of naming tests after the case.

## Stage 1 result: conditional pass

Two fresh sessions, same model, same PRD scope (groups 3, 5, 7, 9), each seeing only its
own role file. Results and the full matrix: [`stage1/COMPARISON.md`](stage1/COMPARISON.md).

- **Arm A (Gherkin) produced zero criterion tags.** The role asks for path tags only, so an
  AC × path matrix cannot be built for it. The `@AC…` spine in shoopa comes from that
  project's own `gherkin-spec.md` and `validate-specs.mjs`, not from the factory role.
- **No sad-path collapse:** 63 non-happy scenarios in A against 58 non-happy cases in B,
  with B stronger on boundary and duplicate in the payment group.
- **B's one real gap is concurrency:** 8 concurrent scenarios in A; B declared races manual
  or absent.
- **B's numbers are machine-checked; A's are self-reported.**

Three role defects found and fixed: zero-padded AC numbering with a rule for unnumbered PRD
sections, an explicit concurrency question that forbids a blank Coverage row on a shared
resource, and a per-criterion minimum (not just per-rule) for non-happy coverage — now
enforced by the checker.

## What changes

About 70 mentions of `gherkin` across 20 files. Mechanical except the controller.

| Area | Files | Size |
|---|---|---|
| Role | `.agents/spec-writer.md` (new), `.claude/agents` symlink | new file + link |
| Model policy | `.agents/models.json` role entry, `agents:sync` | 2 lines + regenerate |
| Orchestrator | `AGENTS.md` team table, steps [2]/[4]/[5b]/[5e], fast-lane trigger | ~9 passages |
| Consumers | `qa.md` (15), `backend-engineer.md` (10), `frontend-engineer.md` (9), `copywriter.md` (6), `release-manager.md` (3), `pentester.md` (2) | vocabulary |
| Rules/skills | `rules/03-handoff-integrity.md`, `factory-loop` (5), `triage` (3), `code-review` (3), `dispatch-worker` (1) | vocabulary |
| Reference | `output-files.md`, `pipeline.md`, `resume-prompt.md`, `revision-prompt.md` | paths and diagram |
| Controller | `factory/controller.mjs` `ROLES` + artifact aliases, `PROTOCOL.md`, tests | 2 code edits, reviewed |

## Staged migration

**Stage 1 — parallel authoring, no consumer changes.** `.agents/spec-writer.md` exists
beside `.agents/gherkin.md`; `specs/` is listed in `output-files.md` as optional; the
checker runs as a test. Run the **real** `gherkin.md` and the **real** `spec-writer.md` in
separate fresh sessions on the same PRD. Also run one spec-only QA derivation off the
critical path. Production `[5e]` stays on Gherkin throughout.
*Gate:* an AC × path-type matrix (not a case count) where every cell Gherkin fills is
filled by the spec too, plus the checker green. Rollback: delete two files.

**Stage 2 — switch consumers, and fix routing in the same PR.** QA, Backend, Frontend,
Copywriter, Pentester and Release Manager take specs. `AGENTS.md` step [2] becomes the Spec
Writer; step [4]'s responsibility map is renamed. `factory/controller.mjs:359` aliases
`spec` to the PM today, so a spec finding would route to the wrong owner — give specs their
own artifact kind and a controller test.
*Gate:* one full-lane run with the QA gate and independent review finding no coverage
regression. Rollback: revert `AGENTS.md` and the alias map.

**Stage 3 — delete.** Remove `gherkin.md`, rename the model role, regenerate client files,
update guard-test fixtures, `npm run skills:sync` the installs.
*Gate:* `npm test`, `agents:test`, `agents:check` green; no new run writes `.feature`.

Do not compress stages 1 and 2: stage 1 exists to discover whether a table loses cases the
grammar caught.

## Risks

| Risk | Mitigation |
|---|---|
| Sad-path coverage drops without the grammar's forcing function | Coverage table + non-happy rule + path-type precedence order in the role |
| Writers under-enumerate inside one long cell | Action/Expected bounds, enforced by the checker |
| Two writers produce incomparable specs | Path precedence order; AC numbering by PRD position; rerun the same PRD twice and diff in stage 1 |
| QA drifts toward implementation | QA still receives spec + contract only; independent tests unchanged |
| Controller routes spec findings to the PM | Stage 2 changes the alias map with a test |
| Bad role file ships and propagates | It has been reviewed; stage 1 gates on the AC × path matrix before any consumer switches |

## Verification

Every stage: `npm test`, `npm run agents:test`, `npm run agents:check`, and the checker on
every spec in the epic. Stage 1 adds the matrix comparison and the double-authoring check.
A regression test I would add before stage 2: seed defects (unsigned webhook accepted,
non-owner override, invented delivery fee, stale price, ignored take-over, underpayment
marked paid) and compare which derived tests catch them.

## Next step

Stage 2 stays blocked until one re-run with the corrected role shows concurrency cases
where the PRD has a shared resource. After that: switch QA and the other readers, and fix
the `spec` artifact alias that routes to the PM, in the same PR with a controller test.
