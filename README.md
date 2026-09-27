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
| growth | `.agents/skills/growth.md` | Growth / Marketing | Go-to-market plan, launch copy, acquisition strategy |
| data-analyst | `.agents/data-analyst.md` | Data Analyst | Measurement plan, event taxonomy, north star metric |
| release-manager | `.agents/release-manager.md` | Engineering Review Manager | Go/no-go decision, open issues, next steps |

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
   ↓                 ↘
   frontend-engineer   data-analyst + growth  (ready inputs required)
   ↓
   ┌─────────┬──────────┐
   qa        devops     (run in parallel)
   └─────────┴──────────┘
   ↓
   security  →  Vuln report
   ↓
   independent code-review → Candidate findings
   ↓
   release-manager  →  Go/no-go
```

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
