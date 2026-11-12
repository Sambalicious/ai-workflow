# Rule 04 — Blocker Stops the Pipeline (auto-loaded)

A blocker passed downstream multiplies. One unresolved question in the PRD becomes five inconsistent design decisions, ten mismatched API fields, and twenty broken test cases. This rule defines what a blocker is and what must happen when one is found.

---

## What is a blocker

A blocker is any gap, conflict, or unresolved question that prevents the receiving agent from producing correct output. Specifically:

- A PRD open question marked **blocking** that affects engineering decisions.
- A spec case requiring an API interaction that has no corresponding contract operation. UI-only and non-endpoint behavior needs an explicit responsible component, not an invented endpoint.
- A design spec that references a user flow with no corresponding user story in the PRD.
- A security finding rated **Critical** or **High** without a verified resolution. A proposed fix alone does not close it.
- A Release Manager condition listed as P0 that is unresolved at go/no-go time.

## What is NOT a blocker

- An open question marked **non-blocking** in the PRD.
- A nice-to-have Contract Gap (see Rule 01).
- A Medium or Low security finding with a documented mitigation.
- A post-launch item in the future backlog.
- An agent's preference for a different implementation approach.

---

## How to surface a blocker

Output `🛑 BLOCKER` at the top of the relevant section. Include:

- **What the blocker is** — one sentence.
- **Which upstream output it originates from** — agent name and section.
- **What must be resolved** — specific question or change required.
- **Who needs to act** — the agent or human responsible.

Then stop. Do not produce output for sections that depend on the blocker being resolved.

In bounded implementation runs, return a structured finding to the controller under
`.agents/skills/factory-loop/SKILL.md`. Include source task, category, affected
criterion, expected and actual behavior, evidence, and candidate identity. The
controller assigns the causal owner and invalidates dependent work. Independent
branches may continue. Repair authors cannot independently verify their own fixes.

---

## Anti-patterns (all process defects)

- **Blocker burial** — noting the issue in a footnote while continuing to produce downstream output.
- **Assumption resolution** — "I'll assume X and we can fix it later." That is not a resolution.
- **Partial output** — producing half the API contract and hoping the blocker resolves itself.
- **Duplicate blockers** — raising the same blocker in every downstream agent instead of stopping at the first.

---

## Agent behaviour

If you (an agent) encounter a blocker:

1. Output `🛑 BLOCKER` at the point where it is found.
2. State what is blocked, where it came from, and who resolves it.
3. Stop producing output for all sections that depend on the blocker.
4. Sections that do NOT depend on the blocker may be completed — mark them clearly.
5. Do NOT pass a partial output to downstream agents as if it were complete.
