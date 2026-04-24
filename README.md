# Startup Team Skills

A portable set of agent skills that simulate a full startup team. Each agent is a self-contained markdown file in `.agents/` — the single source of truth, no tool lock-in. Use them with any AI client:

- **Claude Code** — pre-wired via symlinks in `.claude/agents/`, `@agent-name` works out of the box
- **Cursor** — copy any file into `.cursor/rules/<name>.mdc`
- **Claude.ai / ChatGPT** — paste the file content as a Project or system prompt
- **Continue, Cline, Aider, etc.** — point at `.agents/<name>.md` as context

## The team

| Agent | File | Role | Produces |
|---|---|---|---|
| product-manager | `.agents/product-manager.md` | Product Manager | PRD, user stories, acceptance criteria, future backlog |
| gherkin | `.agents/gherkin.md` | Gherkin Spec Writer | .feature files covering all path types |
| architect | `.agents/architect.md` | Tech Lead / Architect | System design, architecture decisions, data flow |
| designer | `.agents/designer.md` | Product Designer | UX flows, component inventory, style decisions |
| backend-engineer | `.agents/backend-engineer.md` | Backend Engineer | API contract, data model, backend skeleton |
| frontend-engineer | `.agents/frontend-engineer.md` | Frontend Engineer | Component architecture, UI skeleton, API integration |
| qa | `.agents/qa.md` | QA Engineer | Test plan, edge cases, risk areas |
| devops | `.agents/devops.md` | DevOps Engineer | Dockerfile, CI/CD, deploy runbook |
| security | `.agents/security.md` | Security Reviewer | Threat model, vuln findings, risk rating |
| growth | `.agents/growth.md` | Growth / Marketing | Go-to-market plan, launch copy, acquisition strategy |
| data-analyst | `.agents/data-analyst.md` | Data Analyst | Measurement plan, event taxonomy, north star metric |
| release-manager | `.agents/release-manager.md` | Engineering Review Manager | Go/no-go decision, open issues, next steps |

## How to use

### Pattern 1 — Claude Code subagents (recommended)

All agents live in `.agents/` and are symlinked into `.claude/agents/` so Claude Code picks them up automatically. Open this repo in Claude Code and they're available immediately.

```
@product-manager Here's my idea: [your idea]
@gherkin [paste the PRD output]
@architect [paste the PRD output]
```

To use them in another project, copy both `.agents/` and `.claude/agents/` into that project's root.

### Pattern 2 — Run the full pipeline via AGENT.md

The `AGENT.md` orchestrator runs all 12 agents in the correct order automatically. See [AGENT.md](AGENT.md) for the full pipeline prompt.

### Pattern 3 — Chain them manually in a single chat

Best for: Claude.ai, ChatGPT, quick experiments.

1. Open a new chat
2. Paste the contents of `.agents/product-manager.md` as your first message, followed by your idea
3. Copy the output
4. Start a new chat, paste `.agents/designer.md`, then paste the PRD from step 3
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
   ↓              ↘
   gherkin          growth  (run in parallel — growth only needs PRD)
   ↓
   ┌──────────────────────┐
   architect   designer   (run in parallel)
   └──────────────────────┘
   ↓
   backend-engineer  →  API contract + backend spec
   ↓                 ↘
   frontend-engineer   data-analyst  (run in parallel)
   ↓
   ┌─────────┬──────────┐
   qa        devops     (run in parallel)
   └─────────┴──────────┘
   ↓
   security  →  Vuln report
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
