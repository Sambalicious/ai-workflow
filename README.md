# Startup Team Skills

A portable set of agent skills that simulate a full startup team. Each agent is a self-contained markdown file in `.agents/` — the single source of truth, no tool lock-in. Use them with any AI client:

- **Claude Code** — pre-wired via symlinks in `.claude/agents/`, `@agent-name` works out of the box
- **Cursor** — copy any file into `.cursor/rules/<name>.mdc`
- **Claude.ai / ChatGPT** — paste the file content as a Project or system prompt
- **Continue, Cline, Aider, etc.** — point at `.agents/<name>.md` as context

## The team

| Agent | File | Role | Produces |
|---|---|---|---|
| product-manager | `.agents/skills/product-manager.md` | Product Manager | PRD, user stories, acceptance criteria, future backlog |
| gherkin | `.agents/gherkin.md` | Gherkin Spec Writer | .feature files covering all path types |
| architect | `.agents/skills/architect.md` | Tech Lead / Architect | System design, architecture decisions, data flow |
| designer | `.agents/skills/designer.md` | Product Designer | UX flows, component inventory, style decisions |
| backend-engineer | `.agents/backend-engineer.md` | Backend Engineer | API contract, data model, implementation and tests |
| frontend-engineer | `.agents/frontend-engineer.md` | Frontend Engineer | Working UI, API integration and tests |
| qa | `.agents/qa.md` | QA Engineer | Independent test execution, evidence and coverage gaps |
| devops | `.agents/devops.md` | DevOps Engineer | Dockerfile, CI/CD, deploy runbook |
| security | `.agents/security.md` | Security Reviewer | Threat model, vuln findings, risk rating |
| code-review | `.agents/skills/code-review/SKILL.md` | Independent Code Reviewer | Candidate findings and verification gaps |
| growth (opt-in) | `.agents/skills/growth.md` | Growth / Marketing | Go-to-market plan, launch copy, acquisition strategy |
| data-analyst (opt-in) | `.agents/data-analyst.md` | Data Analyst | Measurement plan, event taxonomy, north star metric |
| release-manager (opt-in) | `.agents/release-manager.md` | Engineering Review Manager | Go/no-go decision, open issues, next steps |

[AGENTS.md role activation policy](AGENTS.md#role-activation-policy) defines the
defaults. A generic full pipeline keeps Growth, Data Analyst, and Release Manager
disabled. Each runs only when the user explicitly requests that role or assessment.
QA, Security, fresh independent code review, and bounded repairs remain required.
Without Release Manager, successful runs end at `VERIFIED`, not release approval.
Explicit release assessment adds a required gate and can yield `PRODUCTION_READY`.
Neither status permits merge or deployment. Existing pinned runs keep their graph
and approved gates.

For example: "Run the full pipeline. Also run Growth to produce a go-to-market plan.
Keep Data Analyst and Release Manager disabled."

## Use a shared checkout

To use the AI team in a new project, reference
[Sambalicious/ai-workflow](https://github.com/Sambalicious/ai-workflow) and explicitly
load [the external-project entry](factory/EXTERNAL.md), the authoritative guide.
It defines absolute `FACTORY_ROOT`, `PROJECT_ROOT`, and `RUN_ROOT` boundaries,
per-run version pinning, and report isolation. Load roles from this checkout while
application operations follow the target project's rules. No files, packages,
or client configuration need to be installed in the target.

Open your target project in your AI client. Replace the paths and request below,
then paste the prompt. Reuse your existing shared checkout.

```text
Use the AI team from https://github.com/Sambalicious/ai-workflow for this task.
Read /absolute/path/to/ai-team/factory/EXTERNAL.md.
FACTORY_ROOT=/absolute/path/to/ai-team
PROJECT_ROOT=/absolute/path/to/target-project
RUN_ROOT=/absolute/path/to/private-runs/target-project/run-001
Request: [approved scope, or read-only intake request]
If the checkout is unavailable, stop and ask before creating one.
```

The URL is a discovery reference, not a factory version pin. It does not register
tools, execute agents, or grant implementation permission. Your actual request
supplies the scope. For first-time checkout and private-repository access, see
[checkout discovery](factory/EXTERNAL.md#find-or-reuse-the-checkout).
For repeated use, see the [optional project instruction snippet](factory/EXTERNAL.md#remember-the-reference-in-a-project).

## Existing installed usage

The optional shell installer remains available for projects that use copied skills,
roles, controller, and orchestrator. Shared-checkout use does not run it:

```bash
./install.sh /path/to/my-project
./install.sh /path/to/my-project --force
```

The package exposes `software-factory` for the controller. It is not a project
installer. This checkout does not contain the previously advertised `ai-workflow`
installer CLI. Node.js 18 or newer is required; no controller dependencies are needed.
The shell installer and its integration test require Bash and standard Unix tools.

## How to use

### Shared Software Factory skills

Shared skills extend the team. Their
canonical definitions live under `.agents/skills/`, using the portable
`<name>/SKILL.md` format. Any agent can read and follow them:

| Skill | Definition | Purpose |
|---|---|---|
| `triage` | [.agents/skills/triage/SKILL.md](.agents/skills/triage/SKILL.md) | Investigate feature requests and bug reports, check duplicates, and produce an evidence-backed readiness decision. |
| `code-review` | [.agents/skills/code-review/SKILL.md](.agents/skills/code-review/SKILL.md) | Independently review a fixed code candidate against requirements, architecture, coding rules, and test evidence. |
| `factory-loop` | [.agents/skills/factory-loop/SKILL.md](.agents/skills/factory-loop/SKILL.md) | Coordinate authorized implementation and bounded repair, preserving independent verification and explicit stops. |

Example requests:

```text
Read .agents/skills/triage/SKILL.md and triage this bug: [report and repository].
Read .agents/skills/triage/SKILL.md and triage this feature: [request and repository].
Read .agents/skills/code-review/SKILL.md and review this branch against main.
Read .agents/skills/code-review/SKILL.md and review my uncommitted changes.
```

Triage and Code Review are read-only by default. Their verdicts do not authorize implementation,
tracker changes, merge, or deployment. Configure tool permissions and CI separately
to enforce those limits. Reuse Code Review in a fresh reviewer context, not the session that
implemented the candidate. Native skill discovery depends on the client; explicit
file references work without client-specific wrappers.

The definitions are included with the existing `.agents/` copy and package rules.
Validate their packaging and required report markers with:

```bash
node --test .agents/skills/skills.test.mjs
```

### Bounded repair controller

The [controller protocol](factory/PROTOCOL.md) describes inputs, events,
state, and trust boundaries. Generate exact JSON templates with
`node factory/example.mjs input` or `node factory/example.mjs start`.
The default input omits disabled roles and their dependency edges. When release
assessment is explicitly requested, use `node factory/example.mjs input-with-release`.
That template adds only Release Manager, not Growth or Data Analyst.

Use `.agents/skills/factory-loop/SKILL.md` for the agent workflow. The controller
is dependency-free Node.js code. It does not invoke models, execute tests, merge
branches, deploy software, or update its own policy.

The commands below are relative to this checkout or an existing installed copy.
For external projects, use the absolute commands in [the external-project entry](factory/EXTERNAL.md).

```bash
node factory/cli.mjs --help
node factory/cli.mjs init /path/to/run.json /path/to/input.json
node factory/cli.mjs show /path/to/run.json
node factory/cli.mjs apply /path/to/run.json /path/to/event.json
npm test
```

`init` creates persistent state without overwriting an existing run. `show` returns
the current report and ready tasks. `apply` validates and persists one event.
Input and event JSON can also come from standard input by passing `-` as their path.
An exclusive lock and atomic state replacement prevent concurrent updates; do not
manually edit state or delete locks while a writer is active.

The caller declares a task dependency graph, approved scope, actor identities,
candidate identity, and required checks. It reserves budget before dispatching an
agent and submits observed results afterward. Findings route to the causal owner;
repair waves invalidate affected work and transitive consumers. Candidate-specific
verification, code review, security, and release results must match the current
candidate. Stale results and self-verification cannot satisfy required gates.

The pilot caps runs at four concurrent tasks, 32 invocations, three global repair
waves, 200,000 tokens, US$20, and 90 minutes elapsed. Lower limits may be supplied;
the loop cannot raise them. Usage is caller-reported, not provider billing telemetry.
No hard external spending guarantee exists without an adapter that enforces each
reservation and reports actual usage.

Actor identity, authorization, artifact hashes, and test evidence are local
attestations, not cryptographic proof. A caller able to fabricate events can lie
about a test result. Protect access to state and use a trusted execution adapter.
Controller tests use synthetic evidence to verify routing and gate logic; they do
not establish that a real product is production-ready.

Self-improvement stops at proposals. Changing agent skills, routing, acceptance
tests, permissions, or evaluation rules requires a separately approved change and
independent evaluation. Active runs retain their original factory version.

### Kilo admission and settlement foundation

`factory/kilo-adapter.mjs` provides a persistent, transport-independent host API.
It integrates with the controller's real `start` and `complete` events. It does not
launch Kilo, intercept its HTTP traffic, or enable live execution. Preflight is
deliberately blocked:

```bash
node factory/kilo-adapter.mjs preflight
node --test factory/kilo-adapter.test.mjs
```

Preflight prints `status: "BLOCKED"` and exits with code 2. Tests use an injected
offline transport, no credentials, and no network calls. They exercise admission,
all default controller gates, accounting, retries, collisions, concurrency, and
process-death recovery. Synthetic gate evidence is not product verification.

The exported `createKiloAdapter({runPath, adapterId, transport, mode, now})` returns
`bind`, `execute`, `settle`, `complete`, `cancelUndispatched`, `inspect`, and `preflight`. `mode` defaults
to `live`, which refuses operations. Only explicitly injected `mode: 'offline'`
transports run today. The clock defaults to `Date.now`; tests inject a fixed clock.
An offline transport is trusted executable host code, not a sandbox or a way to
authorize paid calls by changing a label. The test file contains a runnable example.

The host calls the API in this order:

1. Initialize a controller run using the existing CLI with an approved scope and
   `trusted_adapter_id` matching `adapterId`. Keep the existing budgets and gates.
2. Call `bind({task_id, attempt_id, session_id, actor_id, reservation})`. The adapter
   copies the current ready assignment and records its reservation through the
   controller before any request. A Kilo session cannot bind to different actors.
3. Call `execute({request_id, attempt_id, session_id, payload, reservation})` for each
   billable request. Both reservations require positive `tokens` and `cost_usd`.
   The payload contains the exact request, including its model and destination.
4. Call `complete(attempt_id, {outcome, artifact, evidence, reason})` with the normal
   controller result fields. Usage comes only from settled request receipts, never
   from the result caller. The controller still validates artifacts and gate evidence.

The transport implements three methods:

- `validate(request)` performs no billable work. It validates the exact payload
  against enforceable worst-case bounds and returns
  `{request_hash, basis: 'enforced-worst-case', reservation, evidence_ref}`.
  Hash and reservation must match the request. An estimated price is not a bound.
- `sendOnce(request)` runs only after durable admission. It makes exactly one
  request with the validated payload and returns `{outcome, receipt}`, where
  `outcome` is `success` or `failed`. No automatic retries, fallbacks, or hidden
  billable calls are permitted. The host must route every such call through admission.
- `verifyReceipt(request, receipt, outcome)` returns `true` only after verifying
  authoritative billing provenance and binding the charge and outcome to that
  request. A caller-supplied source label alone does not prove billing.

The initial receipt format is a normalized direct OpenRouter response:
`{source: 'openrouter-response', request_id, session_id, attempt_id, request_hash,
response: {id, usage}}`. `usage` requires numeric `prompt_tokens`,
`completion_tokens`, `total_tokens`, and `cost`. The total must equal prompt plus
completion tokens. Cached prompt and reasoning completion tokens are subsets, not
additional tokens. Explicit authoritative zero is accepted; missing cost, Kilo
stored zero, and string-coerced numbers are not. Provider response IDs are unique
across the run. This parser does not infer billing for LiteLLM or the Kilo gateway.

Every run has a private `<runPath>.kilo.json` ledger beside controller state. Both
files share the controller's exclusive lock, including during transport calls.
This first version serializes requests for the run and rejects concurrent writers
rather than queuing them. Atomic replacement and a write-ahead controller event
allow restart after either side of the two-file update. The ledger retains session,
attempt, request, provider response, reservation, and controller event IDs. It stores
payload hashes, not prompts or model output. Protect both files and their directory.

A timeout, incomplete receipt, or process death retains the reservation and blocks
new dispatch across the run. `settle(request_id, receipt, outcome)` reconciles an
already admitted request without sending it again. It requires the same authoritative
verification as normal settlement. Unknown usage never becomes zero. A settled
failed request requires a failed or blocked completion followed by an explicit
controller `retry` and a new attempt/request ID. Controller lifetime retry limits
still apply. An over-reservation receipt remains charged, blocks the result, and
permanently halts further adapter admission for that run.

If validation fails before any request is admitted, the host can call
`cancelUndispatched(attempt_id, reason)`. Under the shared lock, the adapter requires
an empty request ledger for that attempt and records a blocked completion with zero
tokens and cost. It retains the invocation count and an audited `no_dispatch` marker;
continuation still requires an explicit controller `retry`. This proof assumes every
billable call uses the adapter and `validate` does no billable work. Any admitted
request, including a reserved, unknown, or settled failed request, forbids this path.
Missing ledger state is not evidence of zero usage. Cancellation cannot mark a task
successful or discard a charge.

Repeated identical bindings, requests, settlements, and completions are idempotent;
conflicting IDs are rejected. A reserved or unknown duplicate is never resent.
After a crash, inspect the process and both files before removing a stale lock.
Never delete the ledger, reset the run, or release an unknown reservation to resume.
Use the adapter for all task starts and completions from the first invocation.
Other authorized controller events still use the CLI. Direct lifecycle writes are
detected on the next adapter operation, but writable local state is not tamper-proof.

Live Kilo integration still requires a transport that intercepts every actual
billable request before dispatch, validates the final serialized context and tool
payload, enforces worst-case token and monetary limits, and authenticates receipts
for failures as well as successes. Provider-side hard caps do not follow from
estimates. Kilo telemetry and cost nudges alone cannot supply these guarantees.
Worker launch, fresh-session identity verification, artifact digest checks,
independent QA/security/review execution, and the end-to-end GitHub workflow remain
runner responsibilities. This foundation does not claim live verification or grant
merge, deployment, credential, configuration, or policy changes.

### Pattern 1 — Claude Code subagents (recommended)

All agents live in `.agents/` and are symlinked into `.claude/agents/` so Claude Code picks them up automatically. Open this repo (or any project you installed into) in Claude Code and they're available immediately.

```
@product-manager Here's my idea: [your idea]
@gherkin [paste the PRD output]
@architect [paste the PRD output]
```

### Pattern 2 - Run the full pipeline via AGENTS.md

The [AGENTS.md](AGENTS.md) orchestrator defines the feature pipeline and the bounded
bug-repair route. The calling agent dispatches work; the controller validates and
persists local attestations but does not launch agents.

### Pattern 3 — Chain them manually in a single chat

Best for: Claude.ai, ChatGPT, quick experiments.

1. Open a new chat
2. Paste the contents of `.agents/skills/product-manager.md` as your first message, followed by your idea
3. Copy the output
4. Start a new chat, paste `.agents/skills/designer.md`, then paste the PRD from step 3
5. Repeat down the chain

### Pattern 4 — Cursor rules

Copy any `.agents/<name>.md` content into `.cursor/rules/<name>.mdc` with frontmatter:

```
---
description: Product Manager persona
alwaysApply: false
---
<paste agent file content here>
```

Invoke with `@<name>` in Cursor chat.


## Input / output contract

Every agent follows the same shape:

- **Inputs** — declared at the top of the file (what the agent needs to receive)
- **Outputs** — a fixed markdown structure the agent always produces
- **TL;DR section** — every output ends with a one-paragraph summary so the next agent has a clean handoff

### Monorepo Guidance

If you are using a monorepo, each agent’s deliverables should be implemented in their respective subdirectories:

- `/frontend` — Frontend engineer outputs (UI, components, integration)
- `/backend` — Backend engineer outputs (API, data models, server logic)
- `/shared` or `/contracts` — Shared types, API contracts, or interfaces

**Handoff:** Each agent should clearly state the target directory for their output in the TL;DR or a dedicated “Repository/Directory Handoff” section. This ensures all contributors know where to implement and find each skill’s code.

Automate or script validation to ensure that each skill’s code stays within its boundary and follows the agreed contracts.

## Suggested flow

```
Your idea
   ↓
   product-manager  →  PRD
   ↓
   gherkin
   ↓
   ┌──────────────────────┐
   architect   designer   (run in parallel)
   └──────────────────────┘
   ↓
   backend-engineer  →  API contract + backend spec
   ↓
   frontend-engineer
   ↓
   ┌─────────┬──────────┐
   qa        devops     (run in parallel)
   └─────────┴──────────┘
   ↓
   security  →  Vuln report
   ↓
   independent code-review → Candidate findings
   ↓
   Verification summary  →  VERIFIED or unresolved blockers
```

When explicitly requested, Growth and Data Analyst can run after Backend with
their required inputs. Release Manager runs after all enabled outputs and required
gates are ready. An unrequested assessment is not a missing deliverable, but approved
required checks and unresolved blockers still apply.

## Adding your own agent

Create `.agents/<name>.md` following the same structure:

```markdown
# <Role name>

## Role
<One paragraph of persona>

## Inputs
- <What upstream context this agent needs>

## Instructions
<How the agent should think and behave>

## Output format
<Exact markdown structure to produce>
```

## License

Use freely, modify, share.
