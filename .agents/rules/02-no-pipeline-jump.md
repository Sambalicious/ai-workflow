# Rule 02 — No Pipeline Jump (auto-loaded)

An agent that starts before its dependencies are ready produces output built on assumptions, not facts. This rule enforces the dependency graph defined in AGENTS.md.

For bounded implementation runs, follow `.agents/skills/factory-loop/SKILL.md`.
An approved bug brief and existing relevant architecture, design, API contract,
and full regression scenarios may replace a new PRD and newly authored design docs.
This substitution waives no required behavior contract or verification gate.

Apply the role activation policy in `AGENTS.md` before declaring dependencies.
The table below applies only to enabled roles; it does not activate them.
Omit disabled tasks and their edges, rather than marking them optional.
An unrequested assessment is not a missing input unless an approved check requires
it. In that case, report the scope conflict without activating a role or waiving
the check. Existing pinned graphs and gates remain unchanged.

---

## STOP and wait when any of these is true

- The Gherkin spec is not yet complete and you are the Backend Engineer, Frontend Engineer, or QA.
- The architecture decision is not yet complete and you are the Backend Engineer.
- The API contract handoff is not yet complete and you are the Frontend Engineer.
- The backend spec and DevOps config are not yet complete and you are the Security Reviewer.
- Any upstream output consumed by your task is marked as a draft, partial, or contains unresolved blockers.

## Do NOT stop when

- A parallel-track dependency is missing but yours is ready — proceed on your track.
- A non-required optional input is missing — proceed and note the gap.
- The dependency exists but contains open questions marked non-blocking — proceed and flag them.

---

## Required inputs by agent

| Agent | Must have before starting |
|---|---|
| Gherkin Spec Writer | PRD |
| Growth (opt-in) | PRD + architecture + design spec + backend spec |
| Architect | PRD |
| Designer | PRD |
| Copywriter | PRD + Gherkin spec + design spec |
| SEO Specialist | PRD + architecture + design spec + copy deck |
| Backend Engineer | PRD + Gherkin spec + architecture + design spec |
| Frontend Engineer | Design spec + Gherkin spec + API contract handoff + copy deck + SEO plan |
| Data Analyst (opt-in) | PRD + backend spec |
| QA | PRD + Gherkin spec + backend spec + frontend spec |
| DevOps | Backend spec + SEO plan |
| Security Reviewer | Backend spec + frontend spec + DevOps config + candidate evidence |
| Pentester (opt-in) | Written authorization + isolated running candidate + security review + API contract handoff + Gherkin spec + frontend spec + synthetic accounts |
| Independent Code Reviewer | Actual candidate + approved scope + full contracts/Gherkin + repository rules + current QA/security evidence |
| Release Manager (opt-in) | Enabled outputs and approved required evidence, including QA, security, and independent code review |

---

## Anti-patterns (all process defects)

- **Optimistic start** — beginning work assuming an upstream output "will probably say X."
- **Partial handoff** — passing a TL;DR-only summary when the full document is required.
- **Implicit dependency** — an agent consuming a document it is not listed as receiving.

---

## Agent behaviour

If you (an agent) are missing a required input:

1. Stop immediately. Do not produce partial output.
2. Output: `⚠ MISSING INPUT — [agent name] output required before this step can proceed.`
3. List exactly which document is missing.
4. Do NOT proceed with assumptions.
5. Do NOT produce skeleton output that will need to be redone once the input arrives.
