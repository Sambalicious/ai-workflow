# Startup Team Orchestrator

## Shared-checkout paths

For an external project, read `factory/EXTERNAL.md` from this factory checkout
before dispatch. Pass absolute `FACTORY_ROOT`, `PROJECT_ROOT`, and `RUN_ROOT` to
every role. Shared `.agents/` and `factory/` references below resolve from
`FACTORY_ROOT`; application operations and existing `epics/` paths resolve from
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

- `growth`, `data-analyst`, and `release-manager` are disabled by default. Invoke
  each only when the user explicitly requests that role or its assessment.
- Enable only the requested role. A release assessment does not enable Growth
  or Data Analyst. Keep their definitions and client links available for opt-in use.
- Omit disabled tasks and their dependency edges from new graphs. Do not represent
  disabled roles with `required: false`; optional work still waits or becomes required
  through its consumers. Record enabled roles and the user's opt-ins in the handoff.
- QA, Security, and fresh independent code review remain mandatory for implementation
  runs, with the same bounded repairs. Approved required checks and blockers remain
  binding even when an assessment role is disabled. Report a scope conflict rather
  than silently activating a role or waiving a gate.
- Without Release Manager, report verification results and unresolved blockers,
  not release GO or approval. Successful controller runs end at `VERIFIED`.
  Explicit release opt-in adds a required release gate; successful completion yields
  `PRODUCTION_READY`. Neither status authorizes merge or deployment.
- Existing active pinned runs retain their graph, factory version, approved gates,
  and blockers. These defaults do not migrate or mutate existing runs.

## Cost reporting policy

This policy applies to every coding agent and client, regardless of provider or
model. New runs default to `reporting_only`; monetary and token estimates are
reports, not execution limits.

- Before coding, report a whole-feature cost range covering planning, implementation,
  tests, QA, Security, independent review, and expected retries or repairs. State
  scope, model and pricing assumptions, and uncertainty. Reuse the shared estimate
  in role handoffs rather than presenting one worker's cost as the whole feature.
- If defensible numbers are unavailable, report `Estimate unavailable` and the
  reason. Never invent a range or substitute zero for missing prices or telemetry.
- At completion, report actual cost only from reliable, fully attributable sources
  covering the whole feature, including failed, retried, rejected, and invalidated
  attempts once each. Otherwise use exactly `Actual cost unavailable`. A known
  subtotal is explicitly partial, never the actual total; identify missing coverage.
  A controller total covers recorded attempts only, not unrecorded planning or work.
- Keep reporting brief: mode, estimate and assumptions, actual or unavailable,
  partial known subtotal if any, and missing coverage. Retain source references
  for claimed observations. Tokens and money may be independently unavailable.
- Estimates never authorize model downgrades, skipped checks, provider or permission
  changes. Reporting-only requires no telemetry adapter or provider-specific API.
  QA, Security, fresh independent review, authorization, pins, retry and repair
  limits, concurrency, invocation limits, and deadlines remain binding.
- Explicit `strict` is opt-in for new controller runs. Existing schema 1 runs remain
  strict, including when no mode was stored. A run's mode is immutable; do not edit
  persisted state or start a replacement run to bypass its limits. The protocol in
  `factory/PROTOCOL.md` defines both modes and their accounting fields.

## The team

| Agent | File | Role |
|---|---|---|
| Product Manager | `.agents/skills/product-manager.md` | Turns raw idea into a PRD |
| Gherkin Spec Writer | `.agents/gherkin.md` | Turns PRD into exhaustive Gherkin scenarios |
| Architect | `.agents/skills/architect.md` | Turns PRD into system design and key decisions |
| Product Designer | `.agents/skills/designer.md` | Turns PRD into written UI spec |
| Backend Engineer | `.agents/backend-engineer.md` | Delivers API contract, backend implementation, and tests |
| Frontend Engineer | `.agents/frontend-engineer.md` | Delivers working UI, API integration, and tests |
| QA Engineer | `.agents/qa.md` | Independently executes tests and records candidate-bound evidence |
| DevOps Engineer | `.agents/devops.md` | Turns engineering spec into infra and CI/CD config |
| Security Reviewer | `.agents/security.md` | Turns engineering spec + DevOps config + frontend spec into a security review |
| Independent Code Reviewer | `.agents/skills/code-review/SKILL.md` | Reviews the actual candidate and current QA/security evidence |
| Growth (opt-in) | `.agents/skills/growth.md` | Turns PRD + architecture + design spec + backend spec into a go-to-market plan |
| Data Analyst (opt-in) | `.agents/data-analyst.md` | Turns PRD + backend spec into a measurement and instrumentation plan |
| Release Manager (opt-in) | `.agents/release-manager.md` | Aggregates enabled outputs and required evidence into a go/no-go decision |

## Pipeline

### Bounded implementation runs

For an explicitly requested implementation or repair run, use
`.agents/skills/factory-loop/SKILL.md` and the local `factory/cli.mjs` controller.
Route findings at every stage, not only after release review. Keep one persistent
run, at most three global repair waves, and independent verification. The controller
records local attestations; the caller owns authorized execution and trustworthy
evidence. The controller does not launch agents.

Triage uses `.agents/skills/triage/SKILL.md`. Bugs may proceed with an approved bug
brief and existing relevant architecture, design, contracts, and full regression
scenarios. Features require discovery and an approved PRD. This bug route replaces
the new-PRD requirement below only for bounded implementation runs. Code review
uses `.agents/skills/code-review/SKILL.md` in a fresh reviewer context. No verdict
authorizes merge, deployment, or changes to the factory's own rules.

The diagram below describes the default feature pipeline. Opt-in branches follow
the same dependency and repair rules.

```
Your idea
   │
   ▼
[1] Product Manager
   └─ Produces: PRD (problem, goals, user stories, acceptance criteria, future backlog)
   │
   ▼
[2] Gherkin Spec Writer
    (input: PRD)
    └─ Produces: .feature files covering every
       happy, sad, validation, boundary,
       permission, duplicate, empty-state,
       and concurrent path
   │
   ├──────────────────────────────────────────────┐
   ▼                                              ▼
[3a] Architect                             [3b] Product Designer
     (input: PRD)                                (input: PRD)
     └─ Produces: system design,                 └─ Produces: UX flows,
        architecture decision,                      component inventory,
        data flow, hard decisions                   style decisions, accessibility
   │                                              │
   └──────────────────┬───────────────────────────┘
                      ▼
               [4] Backend Engineer
               (input: PRD + Gherkin + architecture + design spec)
               └─ Produces: API contract + implementation/tests + Gherkin coverage map
                            + API contract handoff document
                      │
         ▼
[5a] Frontend Engineer
     (input: design spec + Gherkin + API contract handoff)
     Produces: UI, API integration, tests, Gherkin coverage map
         │
         ├────────────┐
         ▼            ▼
      [6a] QA      [6b] DevOps
      (PRD +       (backend eng spec)
       Gherkin +
       eng specs)
         │            │
         └────────────┘
                      │
                      ▼
               [7] Security Reviewer
               (input: backend eng spec + DevOps config + frontend spec)
               └─ Produces: threat model, vuln findings, risk rating
                      │
                      ▼
               [8] Fresh Independent Code Reviewer
               (input: candidate + approved scope + contracts/Gherkin
                + repository rules + current QA/security evidence)
                      │
           ┌──────────┴──────────┐
           ▼                     ▼
        VERIFIED          Blockers tagged
                          to responsible agents
                                 │
                                 ▼
                       Re-run from earliest
                       affected step (see
                       Revision loop section)
```

## Instructions

1. Start with the raw idea. Pass it to the Product Manager first. Do not skip this step — every downstream agent depends on the PRD.
2. Run step [2] (Gherkin) immediately after the PRD is ready. The Gherkin file is an input to Backend Engineer, Frontend Engineer, and QA — nothing in steps 4–5 should start without it.
3. Steps [3a] and [3b] can run in parallel — Architect and Designer both take only the PRD.
4. Step [4] (Backend Engineer) cannot start until steps [2], [3a], and [3b] are all complete.
5. Step [5a] (Frontend Engineer) needs the design spec, Gherkin spec, and API contract handoff from step [4]. Only when explicitly requested, Data Analyst and Growth can run in parallel with Frontend. Data Analyst needs the PRD and backend spec. Growth needs the PRD, architecture, design spec, and backend spec.
6. Steps [6a] (QA) and [6b] (DevOps) can run in parallel once steps [4] and [5a] are both complete.
7. Step [7] (Security) cannot start until Backend Engineer, DevOps, and Frontend Engineer are all complete. Pass it the backend spec, DevOps config, and frontend spec.
8. After QA and Security, dispatch a fresh independent reviewer with `.agents/skills/code-review/SKILL.md`. Pass the actual candidate, approved requirements, complete contracts/Gherkin, repository rules, and current test evidence. Resolve blockers through the same bounded repair loop; the implementer cannot act as this reviewer.
9. Finish with verification and review results and any unresolved blockers. Only when explicitly requested, invoke Release Manager after all enabled outputs and required gates, including independent code review, are ready. Pass those outputs and the role selection. Unrequested Growth and Data assessments are not required inputs unless an approved check requires them. Route blockers from any stage through the Revision loop, capped at 3 global revision rounds.

## Handoff rules

- Every agent ends with a **TL;DR** section. When passing context to a downstream agent, pass the TL;DR plus any section that agent specifically needs — not the full output of every upstream agent.
- The **API contract handoff** from the Backend Engineer is a self-contained document. Pass it directly to the Frontend Engineer — do not summarise it.
- The **Gherkin `.feature` files** are passed whole to Backend Engineer, Frontend Engineer, and QA. Do not summarise them.
- If any agent flags a **blocker** (a gap, conflict, or unresolved question), tag it with the responsible agent using the format `BLOCKER[agent-name]: description`. Stop that branch and resolve it through the Revision loop before passing downstream. Do not pass a broken handoff.

## Revision loop

When any stage reports blockers, its output must include a **Blockers** section with each issue tagged to the responsible agent:

```
BLOCKER[backend-engineer]: Payment webhook handler has no idempotency key — duplicate charges possible.
BLOCKER[devops]: No rollback strategy defined for the database migration step.
```

**To resolve a revision round:**

1. Group blockers by agent. Route each to the enabled owner with the blocker description, that agent's original output (TL;DR + relevant sections), and the reporting stage's evidence. If the owner is disabled, surface the conflict for a user decision; do not activate it implicitly or waive the blocker.
2. Re-run the affected agents. Save revised output as `<file>.r1.md` (e.g. `backend-spec.r1.md`). Increment the suffix on subsequent rounds (`.r2.md`, `.r3.md`).
3. Re-run every enabled downstream agent that depends on the revised output, in the same dependency order as the original pipeline. Save each with the same `.rN` suffix.
4. Re-run affected QA, Security, and fresh independent review. If Release Manager is enabled, re-run it with the latest enabled outputs and save `release-report.rN.md`.
5. Repeat until required gates pass and blockers are resolved, or the round reaches 3. Report `VERIFIED` without release assessment; report a release verdict only when that assessment ran.

If 3 rounds are exhausted with blockers remaining, stop and surface them to the user for manual resolution.

**Downstream reruns:** record every consumed artifact as a task dependency. Changed
artifacts invalidate their producer and every transitive consumer, which rerun in
dependency order. Include Growth and Data Analyst only when enabled and consuming changed backend
artifacts. Candidate changes invalidate candidate-specific verification, review,
and release evidence. Preserve unaffected artifacts explicitly; filenames alone
do not establish freshness. The bounded controller computes this closure instead
of maintaining a separate rerun map.

**Re-run from step X prompt:**

```
Continue EPIC-XXXX. A pipeline stage flagged blockers. Resolve each and re-run from the earliest affected step, preserving this run's enabled roles and required gates.

Blockers:
- BLOCKER[agent-name]: [description]

Revision round: [N of 3]

Steps:
1. Route each blocker to its enabled owner with its description and original output.
   If its owner is disabled, report the conflict for a user decision.
   Save revised output as [file].rN.md.
2. Re-run affected enabled consumers in dependency order, including mandatory QA,
   Security, and fresh independent review for changed candidates.
   Save each as [file].rN.md.
3. Only if enabled, re-run Release Manager with the latest enabled outputs.
   Save as release-report.rN.md only when it runs.
4. Report verification and blockers, or the release verdict when assessed.
```

## Epic ID format

Every idea is assigned a Jira-style ID: `EPIC-XXXX` where `XXXX` is a zero-padded 4-digit number auto-incremented from the highest existing epic.

**How to derive the next ID:**
1. List all folders under `epics/active/` AND `epics/completed/` that match the pattern `EPIC-XXXX-*`.
2. Extract the highest number found across both directories. If no epics exist yet, start at `0001`.
3. Increment by 1 and zero-pad to 4 digits.

**Folder name format:** `EPIC-XXXX-short-slug`
- `EPIC-XXXX` — the auto-incremented ID
- `short-slug` — 2–4 lowercase hyphen-separated words derived from the idea

Examples: `EPIC-0001-water-intake-tracker`, `EPIC-0002-ai-git-diff-cli`, `EPIC-0003-habit-streak-app`

**Epic lifecycle:**
- Active epics live under `epics/active/EPIC-XXXX-slug/`
- Completed epics (deployed to production) live under `epics/completed/EPIC-XXXX-slug/`
- Use the `/complete-epic` skill to move an epic from active → completed

## Invoking the full pipeline

Prompt to run the complete pipeline with enabled defaults:

```
I have a product idea. Run the full startup team pipeline on it.

Idea: [your idea here]

Steps:
1. List all folders under epics/active/ and epics/completed/ matching EPIC-XXXX-* to find the highest number.
   Increment by 1 (zero-padded to 4 digits) to get the next ID.
   Derive a 2–4 word slug from the idea. Combine to form the folder name: epics/active/EPIC-XXXX-slug/.
2. Invoke the Product Manager to produce a PRD.
3. Invoke the Gherkin Spec Writer with the PRD.
4. Invoke the Architect and Designer in parallel with the PRD.
5. Invoke the Backend Engineer with the PRD, Gherkin spec, architecture, and design spec.
6. Invoke Frontend Engineer with the design spec, Gherkin spec, and API contract handoff.
7. Invoke QA and DevOps in parallel.
8. Invoke Security with the backend spec, DevOps config, frontend spec, and actual candidate evidence.
9. Invoke a fresh independent reviewer with .agents/skills/code-review/SKILL.md on the candidate and current QA evidence.
10. Route blockers through bounded repairs and report verification results and remaining blockers, not release approval.

Use AGENTS.md role defaults. Save enabled agents' outputs under epics/active/EPIC-XXXX-slug/ and give me the verification summary.
```

To enable one role, add an explicit request such as: "Also run Growth to produce
a go-to-market plan. Keep Data Analyst and Release Manager disabled."

## Output files

Each idea gets its own numbered folder under `epics/active/`. When deployed to production, the folder moves to `epics/completed/` via the `/complete-epic` skill.

```
epics/
├── active/
│   ├── EPIC-0002-ai-git-diff-cli/
│   │   ├── prd.md
│   │   └── ...
│   └── EPIC-0003-habit-streak-app/
│       ├── prd.md
│       ├── gherkin/
│       │   ├── user-registration.feature
│       │   └── water-logging.feature
│       ├── architecture.md
│       ├── design-spec.md
│       ├── backend-spec.md
│       ├── api-contract.md
│       ├── frontend-spec.md
│       ├── test-plan.md
│       ├── devops-config.md
│       ├── security-review.md
│       ├── code-review.md
│       ├── growth-plan.md             # only with Growth opt-in
│       ├── data-plan.md               # only with Data Analyst opt-in
│       ├── release-report.md          # only with Release Manager opt-in
│       ├── backend-spec.r1.md         ← revised after blocker
│       ├── frontend-spec.r1.md
│       ├── test-plan.r1.md
│       ├── devops-config.r1.md
│       ├── security-review.r1.md
│       ├── code-review.r1.md
│       └── release-report.r1.md       # only with Release Manager opt-in
│
└── completed/
    └── EPIC-0001-water-intake-tracker/
        └── ...                        ← deployed to production
```

Create only enabled outputs and needed revisions. QA, Security, and independent
code-review reports supply the default verification evidence. `release-report.md`
is a go/no-go summary only when Release Manager ran; its absence is not approval.
Reference ideas by their ID (e.g. "continue EPIC-0002") to resume or hand off work.
