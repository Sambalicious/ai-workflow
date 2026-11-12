# Rule 10 — No Silent Deviation (auto-loaded)

Silent deviation is the single highest-impact failure mode in AEDL. This rule governs when to STOP and raise a Deviation.

---

## STOP and raise a Deviation when any of these is true

- An agent finds a LOCKED decision it cannot satisfy.
- A team finds an agreed API shape unusable in practice.
- A Product Manager adds a material requirement after Phase 1.
- Integration reveals a contradictory or impossible contract section.
- Security or compliance review discovers a requirement the contract does not address.

## Do NOT raise a Deviation when

- The agent wants a cleaner pattern (aesthetic preference).
- A team wants to add scope ("while we're in there…") — that is a new feature.
- One engineer disagrees but can still implement the contract.
- The agent is guessing because it lacks grounding context — load the grounding instead.

---

## How to raise a Deviation

For a bounded factory run, return a structured finding to the controller using
`.agents/skills/factory-loop/SKILL.md`; do not edit the approved contract. If the
caller authorizes saving a deviation record, use the project's existing artifact
location. This repository does not require an external handbook, template, or
slash command to report a blocker.

Each entry must include:

- A **quote** of the current contract text.
- A plain-language description of the proposed change.
- **Impact on other teams** (table: Team | Impact | Mitigation).
- **Alternatives considered** with reasons they were rejected.
- **Approvals required** (Tech Lead + affected team lead + QA Lead if spec cases change + Security Reviewer if auth/data exposure changes).

---

## Anti-patterns (all process defects)

- **Silent deviation** — deviating without logging it.
- **Verbal deviation** — "we agreed on Slack" without a written entry.
- **Retroactive deviation** — raising a deviation after the diverged code has shipped.
- **Cascade deviation** — five deviations on the same section usually means Phase 1 was rushed. Redo Phase 1; don't stack more deviations.

---

## Agent behaviour

If you (an agent) cannot satisfy the contract:

1. Stop implementing.
2. Output: `⚠ DEVIATION REQUIRED` with the quoted contract line and the blocker.
3. Identify the required human decision and link the finding and unchanged contract.
4. Do NOT modify the contract.
5. Do NOT silently "adapt" the code to work around it.
