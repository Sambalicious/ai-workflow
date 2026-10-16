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

Backend engineering skills, applied by the Backend Engineer when writing, verifying, or reporting on code:

| Skill | Definition | Purpose |
|---|---|---|
| `clean-code` | [.agents/skills/clean-code/SKILL.md](.agents/skills/clean-code/SKILL.md) | Naming, small functions, comments, error handling, and unit test quality. |
| `clean-code-principles` | [.agents/skills/clean-code-principles/SKILL.md](.agents/skills/clean-code-principles/SKILL.md) | SOLID, DRY, KISS, and design patterns. |
| `nestjs-best-practices` | [.agents/skills/nestjs-best-practices/SKILL.md](.agents/skills/nestjs-best-practices/SKILL.md) | NestJS modules, dependency injection, security, performance, testing, and data access. Source: Kadajett/agent-nestjs-skills (MIT). |
| `blast-radius` | [.agents/skills/blast-radius/SKILL.md](.agents/skills/blast-radius/SKILL.md) | Find what a change could break beyond the diff and prove the safety facts by running code. |
| `principle-build-the-lever` | [.agents/skills/principle-build-the-lever/SKILL.md](.agents/skills/principle-build-the-lever/SKILL.md) | Build a rerunnable script, codemod, or check instead of working by hand. |
| `principle-prove-it-works` | [.agents/skills/principle-prove-it-works/SKILL.md](.agents/skills/principle-prove-it-works/SKILL.md) | Verify against the real artifact before declaring done. |
| `unslop` | [.agents/skills/unslop/SKILL.md](.agents/skills/unslop/SKILL.md) | Cut AI tells from reports, handoffs, and PR text. |

Frontend design skills, applied by the Frontend Engineer (and available to the Designer) when building, reviewing, or polishing UI. They are third-party skills installed with `npx skills add` and pinned in `skills-lock.json`; refresh them with `npx skills update`. The target repository's DESIGN.md, design spec, and approved copy take precedence over their taste rules.

| Skill | Purpose |
|---|---|
| [`impeccable`](.agents/skills/impeccable/SKILL.md) | Design, critique, audit, and polish UI: hierarchy, layout, typography, color, motion, UX copy, accessibility, responsive behavior. Source: pbakaus/impeccable (Apache-2.0). |
| [`emil-design-eng`](.agents/skills/emil-design-eng/SKILL.md) | Design-engineering rules for interfaces, mostly motion. Source: emilkowalski/skills (MIT), as are the rest of this table. |
| [`break-ui`](.agents/skills/break-ui/SKILL.md) | Stress the UI with worst-case data: long names, huge counts, empty lists. |
| [`mobile-native`](.agents/skills/mobile-native/SKILL.md) | Make a web app behave natively on phones: tap states, 100vh, input zoom, safe areas. |
| [`pick-ui-library`](.agents/skills/pick-ui-library/SKILL.md) | Choose a maintained library instead of hand-rolling common components. |
| [`apple-design`](.agents/skills/apple-design/SKILL.md) | Apple interface and fluid-motion principles, translated for the web. |
| [`animate`](.agents/skills/animate/SKILL.md) | Build an animation with the right curve, duration, and properties. |
| [`review-animations`](.agents/skills/review-animations/SKILL.md) | Strict review of existing animations. |
| [`improve-animations`](.agents/skills/improve-animations/SKILL.md) | Audit all animations and produce prioritized fix plans. |
| [`find-animation-opportunities`](.agents/skills/find-animation-opportunities/SKILL.md) | Find where motion helps, and where it should not be added. |
| [`animation-performance`](.agents/skills/animation-performance/SKILL.md) | Fix animations that drop frames. |
| [`animation-vocabulary`](.agents/skills/animation-vocabulary/SKILL.md) | Precise words for describing the motion you want. |
| [`ask-sonner`](.agents/skills/ask-sonner/SKILL.md) | Setup, styling, and fixes for the Sonner toast library. |

General engineering skills, available to every role:

| Skill | Purpose |
|---|---|
| [`tdd`](.agents/skills/tdd/SKILL.md) | Red-green-refactor and integration-first tests. |
| [`diagnosing-bugs`](.agents/skills/diagnosing-bugs/SKILL.md) | Diagnosis loop for hard bugs and performance regressions. |
| [`typescript-best-practices`](.agents/skills/typescript-best-practices/SKILL.md) | TypeScript conventions for `.ts` and `.tsx` files. |
| [`principle-type-system-discipline`](.agents/skills/principle-type-system-discipline/SKILL.md) | Make illegal states unrepresentable and parse data at boundaries. |
| [`codebase-design`](.agents/skills/codebase-design/SKILL.md) | Deep modules, interfaces, and seams. |
| [`domain-modeling`](.agents/skills/domain-modeling/SKILL.md) | Domain terminology, `CONTEXT.md`, and ADRs. |
| [`prototype`](.agents/skills/prototype/SKILL.md) | Throwaway prototypes that answer one design question. |
| [`grilling`](.agents/skills/grilling/SKILL.md) | Stress-test a plan or decision with hard questions. |
| [`principle-sequence-verifiable-units`](.agents/skills/principle-sequence-verifiable-units/SKILL.md) | Split multi-step work and PRs into verifiable units. |
| [`principle-separate-before-serializing-shared-state`](.agents/skills/principle-separate-before-serializing-shared-state/SKILL.md) | Remove shared writable state before adding locks. |
| [`principle-guard-the-context-window`](.agents/skills/principle-guard-the-context-window/SKILL.md) | Route bulk output to subagents and keep summaries. |
| [`show-me-your-work`](.agents/skills/show-me-your-work/SKILL.md) | Decision log for long or unattended runs. |
| [`resolving-merge-conflicts`](.agents/skills/resolving-merge-conflicts/SKILL.md) | Resolve an in-progress merge or rebase. |
| [`wizard`](.agents/skills/wizard/SKILL.md) | Bash wizard for steps only a human can perform. |
| [`technical-writing`](.agents/skills/technical-writing/SKILL.md) | Standard for docs, RFCs, READMEs, PR descriptions, and commits. |
| [`writing-for-agents`](.agents/skills/writing-for-agents/SKILL.md) | Rules for writing skills and `AGENTS.md`. |

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
candidate identity, and required checks. It records attempts before dispatching an
agent and submits observed results afterward. Findings route to the causal owner;
repair waves invalidate affected work and transitive consumers. Candidate-specific
verification, code review, security, and release results must match the current
candidate. Stale results and self-verification cannot satisfy required gates.

The [AGENTS.md cost reporting policy](AGENTS.md#cost-reporting-policy) requires a
whole-feature estimate before coding and reliable actual costs at completion, or
an explicit unavailable report. New runs use `reporting_only`, with no token or
monetary enforcement and no telemetry integration needed. Missing cost is `null`,
never zero. Known partial subtotals stay separate from actual totals.

Both modes cap runs at four concurrent tasks, 32 invocations, three global repair
waves, and 90 minutes elapsed. Explicit `cost_mode: "strict"` also retains the
200,000-token and US$20 caps and requires per-attempt reservations and measured
usage. Lower operational limits may be supplied; events cannot raise them.
Legacy schema 1 states stay strict; new reporting states use schema 2 so old
readers reject them. Modes cannot change within a run. Usage and source references
are caller attestations, not provider billing verification. Strict external caps
still depend on caller-enforced bounds. See [the protocol](factory/PROTOCOL.md).

Actor identity, authorization, artifact hashes, and test evidence are local
attestations, not cryptographic proof. A caller able to fabricate events can lie
about a test result. Protect access to state and use a trusted execution adapter.
Controller tests use synthetic evidence to verify routing and gate logic; they do
not establish that a real product is production-ready.

Self-improvement stops at proposals. Changing agent skills, routing, acceptance
tests, permissions, or evaluation rules requires a separately approved change and
independent evaluation. Active runs retain their original factory version.

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
