# Startup Team Orchestrator

## Contents

[Shared-checkout paths](#shared-checkout-paths) ·
[Run start: verify the rules before dispatching](#run-start-verify-the-rules-before-dispatching) ·
[Role](#role) ·
[Role activation policy](#role-activation-policy) ·
[Cost reporting policy](#cost-reporting-policy) ·
[Cost discipline](#cost-discipline) ·
[Role model policy](#role-model-policy) ·
[The team](#the-team) ·
[Pipeline](#pipeline) ·
[Instructions](#instructions) ·
[Handoff rules](#handoff-rules) ·
[Revision loop](#revision-loop) ·
[Feature ID format](#feature-id-format) ·
[Invoking the full pipeline](#invoking-the-full-pipeline) ·
[Output files](#output-files)

## Shared-checkout paths

For an external project, read `factory/EXTERNAL.md` from this factory checkout
before dispatch. Pass absolute `FACTORY_ROOT`, `PROJECT_ROOT`, and `RUN_ROOT` to
every role. Shared `.agents/` and `factory/` references below resolve from
`FACTORY_ROOT`; application operations and existing `features/` paths resolve from
`PROJECT_ROOT`. Target rules remain authoritative. In external runs, save new
handoff reports under `RUN_ROOT/reports/`, overriding the relative report locations
in pipeline examples below. Keep state outside source and the factory read-only.
Existing installed usage is described in the external entry.

## Run start: verify the rules before dispatching

A target project can vendor an old `.agents/` and an old copy of this file. A stale
copy silently overrides the current policy — no later step can catch it, so check it
first, every run, before any role is dispatched.

1. Resolve `FACTORY_ROOT` to an absolute path and record it in the run brief with
   `git -C "$FACTORY_ROOT" rev-parse HEAD` and `git -C "$FACTORY_ROOT" status --short`.
   Inside the factory checkout itself, that commit is this file's. A branch or a
   repository URL is not a pin.
2. Read `factory/EXTERNAL.md`, `.agents/models.json` and
   `.agents/skills/dispatch-worker/SKILL.md` from `FACTORY_ROOT`, never from a target's
   copy when the two differ.
3. When the target is not the factory, compare its `.agents/` with `FACTORY_ROOT`'s.
   `.agents/factory-version` records the commit it was
   installed from; when that differs from `FACTORY_ROOT`'s commit, the factory wins and
   the run brief says so. When the target's tier table has no `worker` row, the copy is
   stale: stop and report it rather than dispatching.
   `node scripts/agents/factory-lock.mjs --against "$FACTORY_ROOT"` lists every
   `factory/` and `scripts/agents/` file that differs, and plain
   `node scripts/agents/factory-lock.mjs` fails when the target edited one locally
   since `.agents/factory-lock.json` was written. Add it to the target's
   `agents:check`, so CI catches the edit.
4. Quote the `worker` row from `models.json` in the run brief, so the tier in use is
   visible in the artifact rather than only in a prompt.
5. After any delegate reports failure, timeout or a rate limit, check the artifact it
   was writing on disk before reporting it as missing. A provider error can arrive
   after the file landed.
6. Before accepting a worker result, run `pnpm agents:boundary` (or
   `node scripts/agents/worker-guard.mjs --base <ref>`) and send anything it lists back
   to the lead or the advisor. It checks the real diff, including untracked files,
   against the worker boundary, so a brief that quietly widens scope still fails.
7. Run `pnpm agents:stale` before the first dispatch. A branch more than 30 commits
   behind `origin/main`, or whose `.agents/models.json` differs from it, runs without
   the current policy. It also warns, without failing, when main's latest completed CI
   run is not green, and names a job annotation when a job never started.
8. A Claude dispatch runs `pnpm agents:preflight <role> --record <run>` first, then
   `pnpm agents:ledger add ...`. The ledger refuses a lead or advisor dispatch without a
   receipt younger than ten minutes, so the sequence cannot be skipped by habit.
   `<run>` is the run directory itself or the feature id that resolves under
   `features/active/` (or `RUN_ROOT` in an external run); both commands never create it.
   The project names its product remote in `.agents/remotes.json` (`productRemote`), and
   preflight warns when this branch pushes to a different one.
9. A gate runs only when its inputs exist: `pnpm agents:artifacts --run <feature> --gate
   <qa|design|security|code-review>`. A file that exists is not an input. The design
   spec must carry screen blueprints with a wireframe, a feedback matrix with pattern
   and tone, copy slots keyed `screen.element.state` with an intent — or a stated
   `None` for the slots alone — and a style basis: `Per DESIGN.md`, or the tokens
   themselves. A headline-only spec fails the design, security and code-review gates
   the same way a missing file does. The design gate also requires `design-consult.md`
   and refuses a spec that does not cover every surface and state the PRD's Surfaces
   table names. Only the highest `.rN.md` revision is read. List inherited test
   failures in `docs/ops/known-failures.md` and compare a run's report with
   `pnpm agents:known-failures --report <vitest json>` instead of re-deriving them.
10. A pull request opens only after `pnpm agents:pr-gate --run <run>` passes: it needs
   `reports/code-review-<head>.md`, the review of the exact head commit, with a `PASS`
   verdict line.

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

## Role model policy

Standing tiering for every run, in every client. Roles are assigned to tiers, not model
names. `.agents/models.json` maps each role to a tier and each tier to a model per client.

**A dispatch without an explicit model is a protocol error.** A subagent inherits the session
model when the dispatch does not name one, so a lead or advisor role silently runs on the cheap
tier and its output is worthless at the gate. Resolve the model, pass it, and record it:

1. `pnpm agents:model <role>` prints the model for this client, and exits 1 when the role, the
   tier or the client's model is missing.
2. Pass that model in the dispatch. Confirm it resolves in the client's provider list. If it
   does not, stop the run and report it; never substitute a tier without the owner's agreement,
   and never let a session default stand in for a role's tier.
3. Run `pnpm agents:preflight <role> --record <run>` first. A closed rate window stops the run; it
   is never a retry loop per agent.
4. Then add the dispatch to the run's ledger (round, role, tier, model, artifact, state) before the
   agent starts.
5. Respect the caps: at most two Claude agents running at once, one of them advisor tier;
   the lifetime dispatch budget warns rather than refusing (one ledger per ticket; a retry of
   the same role on the same artifact replaces its earlier attempt); four on the cheap tier.
   A revision is an edit, not a regenerated document. A 429 marks the entry failed and keeps
   its tier and model (`pnpm agents:ledger fail --role <r> --reason rate_limit`).

The setup, the health check for the local provider and the ledger template are in
[docs/ops/agent-models.md](docs/ops/agent-models.md).

<!-- tier-table:start (generated from .agents/models.json by npm run agents:sync; edit models.json) -->
| Tier | claude-code |
|---|---|
| lead | sonnet |
| advisor | opus |
| swarm | opencode-go/deepseek-v4.1-flash |
| worker | opencode-go/deepseek-v4.1-flash |
<!-- tier-table:end -->

Claude models run only through Anthropic (the `claude-code` client); the swarm and worker
tiers never resolve to one. That table is the only place a model name appears: resolve a
role's model with `pnpm agents:model <role>` rather than retyping one from a role
description.


- **Lead** (main session, decisions only): orchestration, Product Manager, spec
  authorship, Architect, Designer spec and review, Copywriter, SEO, DevOps, the
  design-time threat model, the QA gate, and repair-wave decisions.
  The lead does not author implementation or tests; it scopes them and reviews them.

- **Advisor**: the API contract, the design-spec consult that precedes it, the Security
  candidate review, and the fresh independent code review, plus advisor consults. The
  Designer review and the QA gate run on the lead tier; they are never optional consults,
  and independence holds because the worker tier writes the code. The design consult sits
  on the advisor tier because a weak spec is invisible to the gate that reviews against
  it — [6b] checks the build against the spec, never the spec against the product — and
  because it is the last cheap moment: after the contract publishes, a weak spec costs a
  repair wave instead of a rewritten section. Security runs on the advisor tier because
  a missed finding is silent — no cheaper gate contradicts it — and it is serialized
  before the code review so that one advisor session runs at a time.
- **Swarm** (explore, audit, check runs): in Claude Code, dispatch it through
  `delegate_task` at the swarm tier, never the built-in `Explore` agent type. The tier
  covers repo maps and searches, file inventories, and
  log and test-output triage. Swarm output is a lead; the lead or advisor tier
  confirms it before it becomes a finding or evidence. Run a single grep or
  call-site lookup in the main session directly.

Consult the `advisor` agent at four moments, passing the plan or the failing
evidence and the relevant file paths rather than the whole session:

1. The design consult: after the Designer's spec and before the API contract
   publishes, with the PRD's Surfaces table beside the spec. It asks what the spec
   leaves an engineer to invent — undeclared screens, missing states, a hierarchy
   that does not match the user's goal, copy slots with no intent. Output is
   `design-consult.md`; a weak spec returns as `BLOCKER[designer]` and is revised
   before [4]. This one is a required step, not a discretionary consult.
2. Before committing to a plan: after the PRD and again before the API contract is
   published, and before any non-trivial repair plan.
3. When the same error comes back: the same failing check after two fix attempts,
   or a second repair wave on the same finding.
4. Before calling the task done, ahead of the QA, Security, and code review gates.

Keep advisor consults to a handful per task; each one loads its context fresh. A
client's built-in advisor feature, where it has one, may replace the `advisor`
agent for consults, never for gates.

The lead checks each builder handoff against the contract, spec, and fast-check
results before passing it downstream, and sends gaps back to the same builder
session. A builder that hits a design or contract question escalates to the lead
rather than guessing.

### Authoring is worker tier

Code, tests, fixtures, refactors and mechanical edits to a document or a copy deck are authored on
the worker tier and reviewed by the lead. Decisions, product language, contracts and gates are not:
Product Manager, spec authorship, Architect, Designer spec and review, Copywriter, SEO, the API
contract, the QA gate, the Security review and the independent code review keep their lead or advisor
tier.

The test is not how important the change feels. It is whether the work needs a decision. "Rewrite this
table to match the decision already recorded" is worker work. "Decide what the table says" is lead work.

### Worker routing and metrics

The lead is the orchestrator: it plans, writes scoped sub-tasks, reviews, and
integrates. Where the client offers a worker tier (for example `delegate_task`; confirm
with `orchestrator_capabilities` first and never fall back
silently), send it bulk, clearly scoped work: implementation, tests, refactors, and
searches. Workers never plan, decide design, or touch contracts and security rules,
and never run or replace the QA, Security, or code review gates.

Dispatch with `.agents/skills/dispatch-worker/SKILL.md`. The `worker-guard`
`PreToolUse` hook (`scripts/agents/worker-guard.mjs`) blocks an `Agent` call that
starts implementation on the lead tier. Set `EVE_ALLOW_LEAD=1` for a deliberate
override, which downgrades the block to a warning. `pnpm agents:check` runs
`scripts/agents/policy.mjs`, which fails when the tier policy, this rule or the hook
wiring drifts. The `process-guard` `PreToolUse` hook
(`scripts/agents/process-guard.mjs`) blocks a Bash `pkill`, `killall`,
`kill -9 -1` or `pgrep | xargs kill`, so a session stops only the PIDs it started;
its settings entry is in `factory/EXTERNAL.md`.

- Each sub-task states goal, files in scope, acceptance check, and what not to
  touch. Pass only that and the relevant paths, not the session history.
- The lead reviews every worker result: skim the diff and checks when mechanical,
  read and re-run when not. Wrong output gets one specific rewrite request; after
  that the lead fixes it. Two failed attempts on the same problem go to the advisor.
- Implementation escalation ladder: worker, then one worker rewrite, then
  the lead, then the advisor if the lead's fix also fails. Work
  never starts above the worker tier when it fits "Workers may take". Record each
  step up in `metrics.md`. Provider blocks and outages are retried on the worker
  tier and are not failures.
- The advisor tier is the exception, not the default: architecture, high-stakes
  decisions, deep diagnosis, and the gates. Name the role and reason before calling.

- Workers may take: audits and inventories; copy changes checked by grep; mechanical
  plumbing (migration-number specs, schema markers, renames); test fixes after a UI
  change; ADR and digest drafts from a written design; bug fixes with a failing test
  first; tests written from a written spec; and features or review-finding repairs
  from a written design, committed in steps. Not to workers: contract, architecture,
  auth, RLS, secrets and truth-guard design; unclear requirements; real money, live
  keys, deploys and merges.
- A worker stops and reports when two documents disagree or the code does not match
  the design. Race and integration tests must pass twice in a row. Pull a task type
  back to the lead tier when its rewrite rate passes about 1 in 7 over ten tasks.

Keep `metrics.md` in the feature folder (or beside the task notes) and update it after
each reviewed result: `worker_tasks`; `rewrites` (with a one-line reason each);
`self_fixes`; `advisor_calls` (with a reason each); `advisor_share` =
advisor_calls / (worker_tasks + self_fixes + advisor_calls); `rewrite_rate` =
rewrites / worker_tasks. Report the tally in the final summary. These are
reports, not limits, and never justify skipping a gate.

Shared agents live in `.agents/agents/`; each client's agent files and model
settings are generated from them and `.agents/models.json` by
`npm run agents:sync`. Edit the sources, never the generated files. To add a client,
add its tier models to `.agents/models.json` and an adapter in
`scripts/agents/sync.mjs`.

Record the tier and model per role in the handoff. A cost estimate never selects a
tier, and tiering never skips or weakens a check.

### Lean orchestrator session

The orchestrator session is the largest cost line (about 41% of past spend): every
step re-reads its whole history. Keep it lean:

- One feature per orchestrator session. Start a fresh session for the next feature and
  resume from `features/active/FEAT-XXXX-slug/` and the controller run state.
- Delegate file-heavy reading, log triage, and check runs to the swarm tier and
  keep only their TL;DR in the main chat. In Claude Code that means `delegate_task`
  at the swarm tier, never the built-in `Explore` agent type; other clients use
  their own swarm-tier `explore` and `audit` agents.
- Pass roles file paths and TL;DRs, not pasted file contents or full reports.
- At each repair wave close, update the feature's `CURRENT.md` with gate status, open
  blockers, and the next step, then start a fresh session. Resume with
  `.agents/reference/resume-prompt.md`. A session reset cannot be enforced by the
  repository; the wave-close checkpoint is the record that it happened.
- At most one advisor-tier session runs at once per feature: the Security candidate review
  (step 7), then the independent code review (step 8), serialized rather than
  parallel. `pnpm agents:ledger check` enforces it — a second running advisor-tier
  dispatch is refused, consults included — so a parallel [7] and [8] fails in a script
  instead of relying on the reader. When the session limit is reached, dispatch no more
  advisor roles, record the pending gate in `CURRENT.md`, and resume after the reset. Gates
  are deferred, never waived. Lead-tier and worker-tier work may continue.

## The team

| Agent | File | Role |
|---|---|---|
| Product Manager | `.agents/product-manager.md` | Turns raw idea into a PRD |
| Spec Writer | `.agents/spec-writer.md` | Turns PRD into exhaustive spec cases |
| Architect | `.agents/architect.md` | Turns PRD into system design and key decisions |
| Product Designer | `.agents/designer.md` | Turns PRD into a design spec with blueprints, feedback matrix, and copy slots; reviews rendered screens |
| Backend Engineer | `.agents/backend-engineer.md` | Publishes the API contract first, then delivers backend implementation and tests |
| Frontend Engineer | `.agents/frontend-engineer.md` | Builds the UI against the contract in parallel with Backend, then integrates |
| QA Engineer | `.agents/qa.md` | Writes tests from spec + contract during the build; a separate QA session runs them as the gate |
| DevOps Engineer | `.agents/devops.md` | Turns architecture + API contract into infra and CI/CD config |
| Security Reviewer | `.agents/security.md` | Writes the design-time threat model on the lead tier from the architecture and contract, then reviews the actual candidate on the advisor tier against it |
| Independent Code Reviewer | `.agents/skills/code-review/SKILL.md` | Reviews the actual candidate, current QA evidence, and the security findings, after Security |
| Copywriter | `.agents/copywriter.md` | Fills the Designer's copy slots with a keyed copy deck and voice guide |
| SEO Specialist | `.agents/seo.md` | Crawl pass from architecture + design spec; metadata pass from the copy deck |
| Pentester (opt-in, advisor tier) | `.agents/pentester.md` | Attacks an authorized running candidate and reports reproduced findings |
| Growth (opt-in, lead tier) | `.agents/growth.md` | Turns PRD + architecture + design spec + backend spec into a go-to-market plan |
| Data Analyst (opt-in, lead tier) | `.agents/data-analyst.md` | Turns PRD + backend spec into a measurement and instrumentation plan |
| Release Manager (opt-in, advisor tier) | `.agents/release-manager.md` | Aggregates enabled outputs and required evidence into a go/no-go decision |

## Pipeline

### Bounded implementation runs

For an explicitly requested implementation or repair run, use
`.agents/skills/factory-loop/SKILL.md` and the local `factory/cli.mjs` controller.
Route findings at every stage. Keep one persistent run, at most three global repair
waves, and independent verification. The controller records local attestations; the
caller owns authorized execution and trustworthy evidence. The controller does not
launch agents. Split a large candidate into stacked layer PRs with
`node scripts/agents/split-layers.mjs`; it applies each layer's merge-base diff to its
own paths and fails when a layer reverts a file main moved.

Triage uses `.agents/skills/triage/SKILL.md`. Bugs may proceed with an approved bug
brief plus the existing relevant architecture, design, contracts, and full regression
scenarios. Features need discovery and an approved PRD. The bug route replaces the
new-PRD requirement only for bounded runs. Code review uses
`.agents/skills/code-review/SKILL.md` in a fresh reviewer context. No verdict
authorizes merge, deployment, or changes to the factory's own rules.

The default feature pipeline diagram is in `.agents/reference/pipeline.md`. Opt-in
branches follow the same rules; Instructions steps 4, 7, and 8 place them.

### Fast lane for small fixes

A change may use the fast lane only when all of these hold:

- It is a one-line change to user-visible text, or a change that only adds or edits one test.
- It touches no contract, schema, spec case, auth, data access, configuration, dependency, or shared module.
- It changes no layout or rendered structure.
- The author, the QA check, and the reviewer are different sessions.

Fast-lane steps:

1. The author runs the affected tests and the fast checks, and names the test files they cover.
2. The lead reads the full diff.
3. A scoped QA check runs the affected tests and their suite.
4. One fresh independent review (`.agents/skills/code-review/SKILL.md`) reads the diff and the QA output.

Skipped in the fast lane: the full QA gate session, Security candidate review, and Designer review. The controller's required QA and review tasks still apply, scoped to the change.

Escalate to the full lane when a condition fails, a check fails, or a finding reaches beyond the stated scope. Record the reason. Record `lane: fast` or `lane: full` in the handoff.

## Instructions

1. Start with the raw idea. Pass it to the Product Manager first. Do not skip this step — every downstream agent depends on the PRD.
2. Once the PRD is ready, run steps [2] (Spec Writer), [3a] (Architect), and [3b] (Designer) in parallel. Each takes only the PRD. Apply the fast-lane triggers once [3a] and [3b] are complete. Step [3f] (design consult) runs once [3b] is complete: an advisor-tier session compares the spec's surfaces, states, and copy slots with the PRD's Surfaces table, the orchestrator saves its reply as `design-consult.md`, and a weak spec comes back as `BLOCKER[designer]`. Step [3c] (Copywriter) starts once [2], [3b], and [3f] are complete, because the consult can change copy slots. Step [3d] (SEO crawl pass) starts once [3a] and [3b] are complete, in parallel with Copywriter. Step [3e] (SEO metadata pass) starts once [3c] and [3d] are complete. Steps [3c]–[3e] run in parallel with step [4]. Copy-driven spec changes go through the Revision loop, not direct edits. Before [3a] publishes, `node scripts/agents/migration-gate.mjs` checks the planned migration number and every copied function against `origin/main`; a taken number or a newer definition is a blocker.
3. Step [4] (API contract) cannot start until steps [2], [3a], [3b], and [3f] are complete. The Backend Engineer runs in contract mode: it publishes the complete API contract handoff and the spec responsibility map, and stops before implementation. The contract has one writer; later changes to it are `contract` findings routed through the Revision loop.
4. Once the contract is complete, start steps [5a]–[5e] in parallel, each in its own isolated workspace:
   - [5a] Backend Engineer implements the contract with tests.
   - [5b] Frontend Engineer builds against MSW handlers derived from the contract, then switches to the real backend at integration. It also needs the design spec, the behaviour spec, the copy deck and SEO metadata pass when those roles run, and waits for them only before using them. Once screens render against the mocks, it shares a preview URL and the orchestrator dispatches the Designer in preview mode (see Designer preview below).
   - [5c] DevOps produces infrastructure and CI/CD from the architecture, contract, and SEO crawl pass.
   - [5d] Security writes the design-time threat model from the architecture and contract, on the lead tier.
   - [5e] A QA session writes the independent tests from the spec files and contract: Playwright journeys, API integration tests, and fixtures. It writes test files only, never product code. This QA session cannot run the [6a] gate; a different QA session does.
   Only when explicitly requested, Data Analyst and Growth also start here. Data Analyst needs the PRD and contract. Growth needs the PRD, architecture, design spec, and contract.
5. Each implementer runs its fast checks (format, lint, type check, affected unit tests) and the authored [5e] specs that cover its changes against the real app before handing off. The QA gate then adds only the gaps. A failing fast check or spec is fixed by its author before handoff, not routed as a repair wave.
6. After [5a]–[5e] settle, one integration owner publishes the combined candidate. A Frontend/Backend mismatch with the contract is a `contract` or `code` finding against its owner. Then run [6a] (QA gate) and, for UI-changing work, [6b] (Designer review) in parallel. The QA gate runs the [5e] tests and the existing suites on the candidate and adds tests only for gaps. Designer review is mandatory for UI changes and covers screens and states that changed since the preview, plus any the preview did not see: it views the rendered screens with Playwright MCP at 375px and 1280px and saves `design-review.md`. Its `BLOCKER[frontend-engineer]`, `BLOCKER[copywriter]`, and `BLOCKER[designer]` findings route through the Revision loop like any other blocker.
7. After QA, run [7] (Security candidate review) first, then [8]: dispatch a fresh independent reviewer for [8] as a separate session. They are serialized, not parallel, because both run on the advisor tier and one advisor-tier session runs at a time. Security checks the actual candidate, DevOps config, and QA evidence against its threat model. The [8] reviewer takes a first pass of its own before it is shown the security table, then uses `.agents/skills/code-review/SKILL.md` with the actual candidate, approved requirements, complete contracts/spec, repository rules, and current QA evidence, treating each security finding as a check to confirm or refute rather than a conclusion to accept. Both are required gates; the implementer cannot act as either. Security and code review use different sessions, and the Security session that wrote the threat model cannot give the candidate verdict. Only when explicitly requested, Pentester runs after Security against an authorized, isolated test deployment of the candidate. Pass it the written authorization, target, security review, API contract handoff, spec, frontend spec, and synthetic accounts. Missing authorization or a production target blocks Pentester, not the rest of the run. When Pentester is enabled, the code reviewer also waits for the pentest report.
8. Finish with verification and review results and any unresolved blockers. Only when explicitly requested, invoke Release Manager after all enabled outputs and required gates, including independent code review, are ready. Pass those outputs and the role selection. Unrequested Growth, Data, and Pentest assessments are not required inputs unless an approved check requires them. Route blockers from any stage through the Revision loop, capped at 3 global revision rounds.

### Designer preview

Preview is in-task feedback for Frontend, not a gate. The Designer views the
mock-backed screens with Playwright MCP at 375px and 1280px against the design
spec, copy deck, and `DESIGN.md`, and returns findings straight to the Frontend
session. Frontend fixes them before handoff, so they do not open a repair wave. Spec
gaps found in preview are `BLOCKER[designer]` and copy gaps are `BLOCKER[copywriter]`,
routed as usual. Preview does not replace [6b] on the real candidate.

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
  every hand-off; `node scripts/agents/current-digest.mjs --feature <folder> --run
  <RUN_ROOT>` exits 1 when a section is missing or a report is newer than the digest.
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

## Revision loop

Any stage with blockers lists each one in a **Blockers** section, tagged to its owner: `BLOCKER[backend-engineer]: description`.

To resolve a round:

1. Group blockers by owner. Send each owner its blockers, its original output (TL;DR and relevant sections), and the stage's evidence. If the owner is disabled, ask the user for a decision. Never activate the owner or waive the blocker.
2. Re-run the affected owners. Save revised output as `<file>.rN.md`, where N is the round.
3. Re-run every enabled downstream consumer in dependency order, with the same suffix.
4. Re-run the affected gates: QA, Designer review (UI changes only), Security, Pentester (when enabled), fresh review, and Release Manager (when enabled, as `release-report.rN.md`). Security precedes the fresh review, which receives its findings as checks.
   - Keep each wave small. QA reruns the affected spec cases and the regression safety net, and states its selection. A full run is required when the repair touches shared code, contracts, schemas, or configuration. Designer review reruns only when rendered UI changes. Security checks the changed candidate against its existing threat model. No selection waives a required gate on the changed candidate.
5. Repeat until required gates pass and blockers are resolved, up to 3 rounds. Report `VERIFIED` without a release assessment. Report a release verdict only when one ran.

If 3 rounds end with blockers left, stop and surface them to the user.

**Downstream reruns:** every consumed artifact is a task dependency. A changed artifact invalidates its producer and every transitive consumer, which rerun in dependency order. This includes Copywriter and SEO, and Growth, Data Analyst, and Pentester only when enabled. A candidate change invalidates candidate-specific verification, review, and release evidence. Keep unaffected artifacts explicitly: filenames never prove freshness. The controller computes this closure.

**Re-run prompt:** `.agents/reference/revision-prompt.md`.

## Feature ID format

Every idea is assigned a stable key: `FEAT-XXXX` where `XXXX` is a zero-padded 4-digit number auto-incremented from the highest existing feature.

**How to derive the next ID:**
1. List all folders under `features/active/` AND `features/completed/` that match the pattern `FEAT-XXXX-*`.
2. Extract the highest number found across both directories. If no features exist yet, start at `0001`.
3. Increment by 1 and zero-pad to 4 digits.

**Folder name format:** `FEAT-XXXX-short-slug`
- `FEAT-XXXX` — the auto-incremented ID
- `short-slug` — 2–4 lowercase hyphen-separated words derived from the idea

Examples: `FEAT-0001-water-intake-tracker`, `FEAT-0002-ai-git-diff-cli`, `FEAT-0003-habit-streak-app`

**Feature lifecycle:**
- Active features live under `features/active/FEAT-XXXX-slug/`
- Completed features (deployed to production) live under `features/completed/FEAT-XXXX-slug/`
- Use the `/complete-feature` skill to move a feature from active → completed

## Invoking the full pipeline

Prompt to run the complete pipeline with enabled defaults:

```
I have a product idea. Run the full startup team pipeline on it.

Idea: [your idea here]

Steps:
1. Derive the next FEAT-XXXX ID from features/active/ and features/completed/, plus a 2–4 word slug. Create features/active/FEAT-XXXX-slug/.
2. Follow AGENTS.md Instructions steps 1–8 in order, using the enabled defaults. The pipeline diagram is in .agents/reference/pipeline.md.
3. Invoke the Copywriter and the SEO Specialist only when their fast-lane triggers apply.
4. Route blockers through bounded repairs and report verification results and remaining blockers, not release approval.

Use AGENTS.md role defaults. Save enabled agents' outputs under features/active/FEAT-XXXX-slug/ and give me the verification summary.
```

To enable one role, add an explicit request such as: "Also run Growth to produce
a go-to-market plan. Keep Data Analyst and Release Manager disabled." For a
pentest, include the authorization and target: "Also run Pentester against
https://staging.example.com, authorized techniques: [...], window: [...]."

## Output files

The output folder layout is in `.agents/reference/output-files.md`.


Create only enabled outputs and needed revisions. QA, Security, and independent
code-review reports supply the default verification evidence. `release-report.md`
is a go/no-go summary only when Release Manager ran; its absence is not approval.
Reference ideas by their ID (e.g. "continue FEAT-0002") to resume or hand off work.
