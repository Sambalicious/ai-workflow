# Role model policy

Read this when: choosing a tier or model, or adding a dispatch to the ledger. Referenced from [AGENTS.md](../../AGENTS.md).

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
   its tier and model (`pnpm agents:ledger fail --run <run> --role <r> --reason rate_limit`).

The setup, the health check for the local provider and the ledger template are in
[docs/ops/agent-models.md](../../docs/ops/agent-models.md).

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

## Authoring is worker tier

Code, tests, fixtures, refactors and mechanical edits to a document or a copy deck are authored on
the worker tier and reviewed by the lead. Decisions, product language, contracts and gates are not:
Product Manager, spec authorship, Architect, Designer spec and review, Copywriter, SEO, the API
contract, the QA gate, the Security review and the independent code review keep their lead or advisor
tier.

The test is not how important the change feels. It is whether the work needs a decision. "Rewrite this
table to match the decision already recorded" is worker work. "Decide what the table says" is lead work.

## Worker routing and metrics

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

## Lean orchestrator session

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
  parallel. `pnpm agents:ledger check --run <run>` enforces it — a second running advisor-tier
  dispatch is refused, consults included — so a parallel [7] and [8] fails in a script
  instead of relying on the reader. When the session limit is reached, dispatch no more
  advisor roles, record the pending gate in `CURRENT.md`, and resume after the reset. Gates
  are deferred, never waived. Lead-tier and worker-tier work may continue.
