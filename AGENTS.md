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

- `growth`, `data-analyst`, `pentester`, and `release-manager` are
  disabled by default. Invoke each only when the user explicitly requests that
  role or its assessment.
- `copywriter` and `seo` are default pipeline roles and run in every feature run.
- Enable only the requested role. A release assessment does not enable Growth,
  Data Analyst, or Pentester. Keep their definitions and client links available for opt-in use.
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
| Product Designer | `.agents/skills/designer.md` | Turns PRD into a design spec with blueprints, feedback matrix, and copy slots; reviews rendered screens |
| Backend Engineer | `.agents/backend-engineer.md` | Publishes the API contract first, then delivers backend implementation and tests |
| Frontend Engineer | `.agents/frontend-engineer.md` | Builds the UI against the contract in parallel with Backend, then integrates |
| QA Engineer | `.agents/qa.md` | Independently executes tests and records candidate-bound evidence |
| DevOps Engineer | `.agents/devops.md` | Turns architecture + API contract into infra and CI/CD config |
| Security Reviewer | `.agents/security.md` | Writes a threat model from the contract, then reviews the actual candidate against it |
| Independent Code Reviewer | `.agents/skills/code-review/SKILL.md` | Reviews the actual candidate and current QA evidence, in parallel with Security |
| Copywriter | `.agents/copywriter.md` | Fills the Designer's copy slots with a keyed copy deck and voice guide |
| SEO Specialist | `.agents/seo.md` | Turns PRD + architecture + design spec into an indexability, metadata, and crawl plan |
| Pentester (opt-in) | `.agents/pentester.md` | Attacks an authorized running candidate and reports reproduced findings |
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

The diagram below describes the default feature pipeline. Opt-in branches
(Growth, Data Analyst, Pentester, Release Manager) follow the same dependency and
repair rules; Instructions steps 4, 7, and 8 place them.

```
Your idea
   │
   ▼
[1] Product Manager
   └─ Produces: PRD (problem, goals, user stories, acceptance criteria, future backlog)
   │
   ├────────────────────────┬─────────────────────────┐
   ▼                        ▼                         ▼
[2] Gherkin Spec Writer  [3a] Architect           [3b] Product Designer
    (input: PRD)              (input: PRD)             (input: PRD)
    └─ .feature files         └─ system design,        └─ UX flows, blueprints,
       for every path            data flow,               feedback matrix,
                                 hard decisions           copy slots, a11y
   │                        │                         │
   │                        │                         ▼
   │                        │                  [3c] Copywriter
   │                        │                       (input: PRD + Gherkin + design spec)
   │                        │                       └─ voice guide, glossary, copy deck
   │                        │                         │
   │                        │                         ▼
   │                        │                  [3d] SEO Specialist
   │                        │                       (input: PRD + architecture +
   │                        │                        design spec + copy deck)
   │                        │                       └─ indexability, metadata, crawl config
   └────────────┬───────────┴─────────────────────────┤
                ▼                                     │
[4] API Contract (Backend Engineer, contract mode)    │
    (input: PRD + Gherkin + architecture + design spec)
    └─ Produces: API contract handoff + Gherkin responsibility map
                │                                     │
   ┌────────────┼──────────────────┬──────────────────┤
   ▼            ▼                  ▼                  ▼
[5a] Backend  [5b] Frontend      [5c] DevOps        [5d] Security
     Engineer      Engineer           (contract +        threat model
     (contract +   (contract +         architecture +    (contract +
      inputs [4])   design spec +      SEO plan)          architecture)
                    Gherkin + copy
                    deck + SEO plan;
                    MSW mocks from
                    the contract)
   │            │                  │                  │
   └────────────┴──────────┬───────┴──────────────────┘
                           ▼
              Integrated candidate published
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
      [6a] QA                       [6b] Designer review
      (PRD + Gherkin + specs +      (design spec + copy deck
       running candidate)            + DESIGN.md + running build)
            │                             │
            └──────────────┬──────────────┘
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
      [7] Security candidate review  [8] Fresh Independent Code Reviewer
      (threat model + candidate +    (candidate + approved scope +
       DevOps config + QA evidence)   contracts/Gherkin + repository
                                       rules + current QA evidence)
            │                             │
            └──────────────┬──────────────┘
                 ┌─────────┴──────────┐
                 ▼                    ▼
              VERIFIED         Blockers tagged
                               to responsible agents
                                      │
                                      ▼
                            Re-run from earliest
                            affected step (see
                            Revision loop section)
```

## Instructions

1. Start with the raw idea. Pass it to the Product Manager first. Do not skip this step — every downstream agent depends on the PRD.
2. Once the PRD is ready, run steps [2] (Gherkin), [3a] (Architect), and [3b] (Designer) in parallel. Each takes only the PRD. Step [3c] (Copywriter) starts once [2] and [3b] are complete. Step [3d] (SEO) starts once [3a], [3b], and [3c] are complete. Copy-driven Gherkin changes go through the Revision loop, not direct edits.
3. Step [4] (API contract) cannot start until steps [2], [3a], and [3b] are complete. The Backend Engineer runs in contract mode: it publishes the complete API contract handoff and the Gherkin responsibility map, and stops before implementation. The contract has one writer; later changes to it are `contract` findings routed through the Revision loop.
4. Once the contract is complete, start steps [5a]–[5d] in parallel, each in its own isolated workspace:
   - [5a] Backend Engineer implements the contract with tests.
   - [5b] Frontend Engineer builds against MSW handlers derived from the contract, then switches to the real backend at integration. It also needs the design spec, Gherkin, copy deck, and SEO plan.
   - [5c] DevOps produces infrastructure and CI/CD from the architecture, contract, and SEO crawl configuration.
   - [5d] Security writes the design-time threat model from the architecture and contract.
   Only when explicitly requested, Data Analyst and Growth also start here. Data Analyst needs the PRD and contract. Growth needs the PRD, architecture, design spec, and contract.
5. Each implementer runs its fast checks (format, lint, type check, affected unit tests) before handing off. A failing fast check is fixed by its author before handoff, not routed as a repair wave.
6. After [5a]–[5d] settle, one integration owner publishes the combined candidate. A Frontend/Backend mismatch with the contract is a `contract` or `code` finding against its owner. Then run [6a] (QA) and, for UI-changing work, [6b] (Designer review) in parallel. Designer review is mandatory for UI changes: it views the rendered screens with Playwright MCP at 375px and 1280px and saves `design-review.md`. Its `BLOCKER[frontend-engineer]`, `BLOCKER[copywriter]`, and `BLOCKER[designer]` findings route through the Revision loop like any other blocker.
7. After QA, run [7] (Security candidate review) and [8] in parallel: dispatch a fresh independent reviewer for [8]. Security checks the actual candidate, DevOps config, and QA evidence against its threat model. The reviewer uses `.agents/skills/code-review/SKILL.md` with the actual candidate, approved requirements, complete contracts/Gherkin, repository rules, and current QA evidence. Both are required gates; the implementer cannot act as either. Security and code review use different sessions, and the Security session that wrote the threat model cannot give the candidate verdict. Only when explicitly requested, Pentester runs after Security against an authorized, isolated test deployment of the candidate. Pass it the written authorization, target, security review, API contract handoff, Gherkin, frontend spec, and synthetic accounts. Missing authorization or a production target blocks Pentester, not the rest of the run. When Pentester is enabled, the code reviewer also waits for the pentest report.
8. Finish with verification and review results and any unresolved blockers. Only when explicitly requested, invoke Release Manager after all enabled outputs and required gates, including independent code review, are ready. Pass those outputs and the role selection. Unrequested Growth, Data, and Pentest assessments are not required inputs unless an approved check requires them. Route blockers from any stage through the Revision loop, capped at 3 global revision rounds.

## Handoff rules

- Every agent ends with a **TL;DR** section. When passing context to a downstream agent, pass the TL;DR plus any section that agent specifically needs — not the full output of every upstream agent.
- The **API contract handoff** from step [4] is a self-contained document. Pass it unchanged to the Backend implementation, Frontend, DevOps, and Security tasks — do not summarise it. Frontend derives its MSW handlers from it rather than writing response shapes by hand.
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
4. Re-run affected QA, Designer review (for UI changes), Security, Pentester (when enabled), and fresh independent review. If Release Manager is enabled, re-run it with the latest enabled outputs and save `release-report.rN.md`.
   - Keep each wave small. QA reruns the scenarios in the affected Gherkin files plus the regression safety net, and states the selection; a full run is still required when the repair touches shared code, contracts, schemas, or configuration. Designer review reruns only when the repair changes rendered UI. Security reuses its threat model and checks the changed candidate against it. None of this waives a required gate on the changed candidate.
5. Repeat until required gates pass and blockers are resolved, or the round reaches 3. Report `VERIFIED` without release assessment; report a release verdict only when that assessment ran.

If 3 rounds are exhausted with blockers remaining, stop and surface them to the user for manual resolution.

**Downstream reruns:** record every consumed artifact as a task dependency. Changed
artifacts invalidate their producer and every transitive consumer, which rerun in
dependency order, including Copywriter and SEO. Include Growth, Data Analyst, and
Pentester only when enabled and consuming changed artifacts. Candidate changes invalidate candidate-specific verification, review,
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
3. Invoke the Gherkin Spec Writer, Architect, and Designer in parallel with the PRD.
4. Invoke the Copywriter with the PRD, Gherkin spec, and design spec.
5. Invoke the SEO Specialist with the PRD, architecture, design spec, and copy deck. Steps 4 and 5 can run in parallel with step 6.
6. Invoke the Backend Engineer in contract mode with the PRD, Gherkin spec, architecture, and design spec. It publishes the API contract handoff and stops.
7. In parallel, in isolated workspaces: Backend implementation (contract), Frontend (design spec, Gherkin, copy deck, SEO plan, contract; MSW mocks from the contract), DevOps (architecture, contract, SEO plan), and Security threat model (architecture, contract).
8. Publish the integrated candidate, then invoke QA and Designer review mode in parallel.
9. Invoke Security candidate review (threat model, DevOps config, candidate, QA evidence) and a fresh independent reviewer with .agents/skills/code-review/SKILL.md (candidate, QA evidence) in parallel.
10. Route blockers through bounded repairs and report verification results and remaining blockers, not release approval.

Use AGENTS.md role defaults. Save enabled agents' outputs under epics/active/EPIC-XXXX-slug/ and give me the verification summary.
```

To enable one role, add an explicit request such as: "Also run Growth to produce
a go-to-market plan. Keep Data Analyst and Release Manager disabled." For a
pentest, include the authorization and target: "Also run Pentester against
https://staging.example.com, authorized techniques: [...], window: [...]."

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
│       ├── api-contract.md            # step [4], written before implementation
│       ├── frontend-spec.md
│       ├── test-plan.md
│       ├── devops-config.md
│       ├── threat-model.md            # step [5d]
│       ├── security-review.md         # step [7]
│       ├── design-review.md
│       ├── code-review.md
│       ├── copy-deck.md
│       ├── seo-plan.md
│       ├── growth-plan.md             # only with Growth opt-in
│       ├── data-plan.md               # only with Data Analyst opt-in
│       ├── pentest-report.md          # only with Pentester opt-in
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
