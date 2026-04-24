# Rule 02 — No Pipeline Jump (auto-loaded)

An agent that starts before its dependencies are ready produces output built on assumptions, not facts. That output then poisons every downstream agent. This rule enforces the dependency graph defined in AGENT.md.

---

## STOP and wait when any of these is true

- The Gherkin spec is not yet complete and you are the Backend Engineer, Frontend Engineer, or QA.
- The architecture decision is not yet complete and you are the Backend Engineer.
- The API contract handoff is not yet complete and you are the Frontend Engineer.
- The backend spec and DevOps config are not yet complete and you are the Security Reviewer.
- Any upstream output is marked as a draft, partial, or contains unresolved blockers.

## Do NOT stop when

- A parallel-track dependency is missing but yours is ready — proceed on your track.
- A non-required optional input is missing — proceed and note the gap.
- The dependency exists but contains open questions marked non-blocking — proceed and flag them.

---

## Required inputs by agent

| Agent | Must have before starting |
|---|---|
| Gherkin Spec Writer | PRD |
| Growth | PRD |
| Architect | PRD |
| Designer | PRD |
| Backend Engineer | PRD + Gherkin spec + architecture + design spec |
| Frontend Engineer | Design spec + Gherkin spec + API contract handoff |
| Data Analyst | PRD + backend spec |
| QA | PRD + Gherkin spec + backend spec + frontend spec |
| DevOps | Backend spec |
| Security Reviewer | Backend spec + DevOps config |
| Release Manager | All outputs from every agent above |

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
