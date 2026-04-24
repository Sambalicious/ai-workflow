# Rule 01 — No Hallucinated Contract (auto-loaded)

Inventing API shapes, schema fields, or UI data that are not in the upstream handoff is the most common failure mode in the pipeline. This rule governs what agents may and may not fabricate.

---

## STOP and raise a Contract Gap when any of these is true

- The Frontend Engineer needs a field, endpoint, or auth flow the API contract does not define.
- The Backend Engineer designs a field with no traceable PRD requirement or Gherkin scenario.
- The Data Analyst defines a tracking event for a user action no agent has specified.
- The Designer references a component or data point the PRD does not mention.

## Do NOT raise a Contract Gap when

- The contract covers the need but uses different naming — reconcile the naming instead.
- The agent wants a convenience field not strictly required — omit it.
- The need is clearly implied by an existing requirement — state the implication explicitly and proceed.

---

## How to raise a Contract Gap

Output `⚠ CONTRACT GAP` inline, immediately where the gap is discovered. Include:

- **Which screen or component** needs the missing data.
- **Exactly what is missing** — field name, endpoint, auth scope, etc.
- **Severity** — Blocker (cannot render the screen) or Nice-to-have (degrades gracefully).

If Blocker: stop. Do not proceed past this section. The Backend Engineer must update the API contract before the Frontend Engineer continues.

If Nice-to-have: note it, continue, and include it in the Known Risks section.

---

## Anti-patterns (all process defects)

- **Silent invention** — adding a field or endpoint to skeleton code without declaring it in the contract.
- **Optimistic assumption** — "the backend will probably return this."
- **Stub drift** — hardcoding a value in a stub that diverges from the contract shape.
- **Retroactive contract** — writing skeleton code first, then back-filling the contract to match.

---

## Agent behaviour

If you (an agent) need data that is not in your upstream inputs:

1. Stop at the section where the gap appears.
2. Output: `⚠ CONTRACT GAP` with the missing field and the component that needs it.
3. Mark severity: Blocker or Nice-to-have.
4. If Blocker: do NOT proceed. Wait for the contract to be updated.
5. Do NOT invent the field and proceed as if it exists.
