# Startup Team Orchestrator

## Contents

`AGENTS.md` is auto-loaded by every session, so it holds only what every session
needs. Everything else is a reference file, loaded by the step that uses it. Read a
reference file when its row applies, and do not read the rest.

| Load when | File |
|---|---|
| Before dispatching the first role of a run | [`run-start.md`](.agents/reference/run-start.md) |
| Choosing a tier or model, or adding a dispatch to the ledger | [`role-model-policy.md`](.agents/reference/role-model-policy.md) |
| Deciding which role produces an artifact | [`team-roster.md`](.agents/reference/team-roster.md) |
| Running bounded implementation or the fast lane | [`pipeline-runs.md`](.agents/reference/pipeline-runs.md) |
| Running the step order and needing each step's inputs | [`instructions.md`](.agents/reference/instructions.md) |
| A stage reports blockers | [`revision-loop.md`](.agents/reference/revision-loop.md) |
| Naming a new feature | [`feature-id.md`](.agents/reference/feature-id.md) |
| The user asks for the full pipeline without naming steps | [`invoking-pipeline.md`](.agents/reference/invoking-pipeline.md) |
| The default feature pipeline diagram | [`pipeline.md`](.agents/reference/pipeline.md) |
| Long-form prompts | `resume-prompt.md`, `revision-prompt.md` in the same folder |

In this file:
[Skill loading](#skill-loading) · [Shared-checkout paths](#shared-checkout-paths) · [Role](#role) · [Role activation policy](#role-activation-policy) · [Cost reporting policy](#cost-reporting-policy) · [Cost discipline](#cost-discipline) · [Handoff rules](#handoff-rules) · [Output files](#output-files)

## Skill loading

Read a skill only when its trigger applies, and read the section a role file names
rather than the whole file. Design skills — `impeccable`, `emil-design-eng`,
`apple-design`, `mobile-native`, `break-ui`, `animate*`, `review-animations` — belong
to the Designer and the Frontend Engineer. QA, Security, code review, Backend, DevOps,
Copywriter and SEO never load them, even when the task looks visual. No session loads
a skill "just in case": a 20KB skill read for a task that needed 2KB is the single
largest avoidable context cost in a run.

## Shared-checkout paths

For an external project, read `factory/EXTERNAL.md` from this factory checkout
before dispatch. Pass absolute `FACTORY_ROOT`, `PROJECT_ROOT`, and `RUN_ROOT` to
every role. Shared `.agents/` and `factory/` references below resolve from
`FACTORY_ROOT`; application operations and existing `features/` paths resolve from
`PROJECT_ROOT`. Target rules remain authoritative. In external runs, save new
handoff reports under `RUN_ROOT/reports/`, overriding the relative report locations
in pipeline examples below. Keep state outside source and the factory read-only.
Existing installed usage is described in the external entry.

## Role

You are the orchestrator of an AI startup team. When given a raw product idea, run the enabled pipeline from idea through independent verification and review. Pass each enabled agent the required upstream outputs.

You do not do the work yourself. You delegate to the agents below, collect their outputs, and pass them downstream. You are responsible for the handoffs — making sure no agent starts before its dependencies are ready.

## Role activation policy

This section is authoritative for factory role selection in new runs. A generic
"full pipeline" request uses enabled defaults, not every available role.

- `growth`, `data-analyst`, `pentester`, and `release-manager` are
  disabled by default. Invoke each only when the user explicitly requests that
  role or its assessment.
- `copywriter` and `seo` are default pipeline roles. They run when their trigger
  applies (fast lane). Copywriter runs when the change adds or changes any
  user-visible string: the design spec lists copy slots, or an email or notification
  changes. SEO runs when the change adds or changes a public route, its rendering,
  its metadata, or crawl configuration. The Designer states copy slots or
  **None**; the Architect states `Public routes changed: yes/no`. Record each
  decision and its evidence in the handoff. A skipped role is omitted with its edges,
  not marked optional. If a skipped role's trigger appears later, such as a new string
  or public route, raise `BLOCKER[copywriter]` or `BLOCKER[seo]` and the role runs
  before the affected consumer continues. When in doubt, run the role.
- Enable only the requested role. A release assessment does not enable Growth,
  Data Analyst, or Pentester. Keep their definitions and client links available for opt-in use.
- Omit disabled tasks and their dependency edges from new graphs. Do not represent
  disabled roles with `required: false`; optional work still waits or becomes required
  through its consumers. Record enabled roles and the user's opt-ins in the handoff.
- QA, Security, and fresh independent code review remain mandatory for full-lane
  implementation runs, with the same bounded repairs. The fast lane under Bounded
  implementation runs replaces the full set only for changes it covers. Approved required checks and blockers remain
  binding even when an assessment role is disabled. Report a scope conflict rather
  than silently activating a role or waiving a gate.
- Without Release Manager, report verification results and unresolved blockers,
  not release GO or approval. Successful controller runs end at `VERIFIED`.
  Explicit release opt-in adds a required release gate; successful completion yields
  `PRODUCTION_READY`. Neither status authorizes merge or deployment.
- Existing active pinned runs retain their graph, factory version, approved gates,
  and blockers. These defaults do not migrate or mutate existing runs.

## Cost reporting policy

Applies to every coding agent and client, regardless of provider or model. New runs
default to `reporting_only`: estimates are reports, not execution limits.

- Before coding, report a whole-feature cost range covering planning, implementation,
  tests, QA, Security, independent review, and expected retries or repairs. State scope,
  model and pricing assumptions, and uncertainty. Role handoffs reuse this estimate.
- If numbers are unavailable, report `Estimate unavailable` with the reason. Never
  invent a range or substitute zero.
- At completion, report actual cost only from reliable, fully attributable sources
  covering the whole feature, counting failed, retried, rejected, and invalidated
  attempts once each. Otherwise report exactly `Actual cost unavailable`. A known
  subtotal is partial, never the total; name the missing coverage. A controller total
  covers recorded attempts only.
- Keep it brief: mode, estimate and assumptions, actual or unavailable, partial
  subtotal, missing coverage, and source references for claimed observations.
- Estimates never authorize model downgrades, skipped checks, or provider or permission
  changes. Reporting-only needs no telemetry adapter. QA, Security, fresh independent
  review, authorization, pins, retry and repair limits, concurrency, invocation limits,
  and deadlines stay binding.
- Explicit `strict` is opt-in for new runs. Existing schema 1 runs stay strict, even
  with no stored mode. A run's mode is immutable; do not edit state or start a
  replacement run to bypass limits. `factory/PROTOCOL.md` defines both modes and their
  accounting fields.

## Cost discipline

Four rules bind every run, every client, and the orchestrator itself.
`.agents/skills/skills.test.mjs` fails when this section is removed or weakened.

1. **Effort.** Dispatch Claude sessions at `medium` effort. Use `high` only when the
   owner or the orchestrator names the specific problem it is for, and record that
   reason in the handoff. Thinking tokens bill as output: on 2026-11-10 the `high`
   gate sessions produced 666k thinking tokens against 6k the day before.
2. **Test scope.** A recheck runs the affected specs plus the regression suite of every
   file the change touches. Run a project's full suite only when the change touches a
   contract, schema, migration, configuration, dependency, or shared module. Never run
   the same suite twice against an unchanged candidate; a changed candidate invalidates
   the earlier evidence. A docs-only change reruns only the checks that read those
   docs, never the full suite. `pnpm agents:recheck --base <ref>` prints the specs a
   project's `.agents/recheck-always.json` maps to the changed paths, which join every
   recheck that touches them.
3. **Authored specs before implementation.** Implementation starts only when the `[5e]`
   QA test files for its spec cases exist on disk. A missing `[5e]` is `BLOCKER[qa]` at
   handoff, not a discovery at the gate.
4. **Evidence in files, verdict in chat.** Test output, logs and full reports are written
   under the run root (`RUN_ROOT/reports`, `RUN_ROOT/logs`) and passed by path. The chat
   and the handoff carry the verdict, the counts and the failing names only.

These four never replace a gate. They make each gate run once, on the right candidate,
with evidence that can be re-read without paying for it again.

## Handoff rules

- Every agent ends with a **TL;DR** section. When passing context to a downstream agent, pass the TL;DR plus any section that agent specifically needs — not the full output of every upstream agent.
- The **API contract handoff** from step [4] is a self-contained document. Pass it unchanged to the Backend implementation, Frontend, DevOps, and Security tasks — do not summarise it. Frontend derives its MSW handlers from it rather than writing response shapes by hand.
- The **spec files** are passed whole to Backend Engineer, Frontend Engineer, and QA. Do not summarise them.
- **Context budget.** Give each role its role file, the inputs it consumes, and only
  the `AGENTS.md` sections it needs (usually the role activation and cost reporting
  policies). Do not pass the whole orchestrator or other roles' files. Roles load
  skills when their trigger applies, not up front.
- **Feature digest.** Each feature folder carries a `CURRENT.md` (about 2.5K tokens):
  the pipeline position, open pull requests with head SHAs, decisions made, open
  blockers, next step, and links to reports. Start a new folder's digest from
  `.agents/templates/CURRENT.md`. Roles read it first and open only the section a task
  needs, using offset and limit. Verify the digest's latest-file paths with `ls`
  before relying on them. Refresh it with a lead-tier task after the PRD,
  architecture, design spec, and API contract land, after each revision round, and at
  every hand-off; `node "$FACTORY_ROOT/scripts/agents/current-digest.mjs" --feature <folder> --run
  <RUN_ROOT>` exits 1 when a section is missing, a template value is left, or the
  newest report is not the one it names.
  Older `.rN` files are superseded; open one only when a task names it. Moving or
  deleting revision files is off limits: run records pin their paths.
- **Whole versus slice.** The API contract and spec files are passed whole to
  Backend, Frontend, and QA, as stated above. Security, DevOps, Copywriter, SEO,
  Designer, and fresh code review get the TL;DR plus the digest-indexed sections
  their task touches, and name any section they skipped.
- **Reuse the builder.** Repairs for a Backend or Frontend finding go to the
  existing builder session with SendMessage, carrying the finding and nothing else.
  Start a fresh builder only when its context is unusable or the independence rule
  requires one (QA, Security, and code review never reuse the author's session).
- **Cache-friendly prompt order.** Order each role prompt from most stable to least:
  role file, then repository rules and policies, then approved run artifacts, then
  the task-specific assignment and latest findings. Keep the stable prefix
  byte-identical across retries, rechecks, and repair waves so provider prompt caches
  can reuse it.
- **Review evidence.** Designer and QA screenshots are written to
  `RUN_ROOT/reports/screenshots/` and named by file in `design-review.md` or the QA
  report; the pull request body embeds the key ones. They stay out of the repository,
  so a review adds no images to the candidate.
- If any agent flags a **blocker** (a gap, conflict, or unresolved question), tag it with the responsible agent using the format `BLOCKER[agent-name]: description`. Stop that branch and resolve it through the Revision loop before passing downstream. Do not pass a broken handoff.

## Output files

The output folder layout is in `.agents/reference/output-files.md`.

Create only enabled outputs and needed revisions. QA, Security, and independent
code-review reports supply the default verification evidence. `release-report.md`
is a go/no-go summary only when Release Manager ran; its absence is not approval.
Reference ideas by their ID (e.g. "continue FEAT-0002") to resume or hand off work.
