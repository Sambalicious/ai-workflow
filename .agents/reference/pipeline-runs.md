# Pipeline

Read this when: running bounded implementation or the fast lane. Referenced from [AGENTS.md](../../AGENTS.md).

## Bounded implementation runs

For an explicitly requested implementation or repair run, use
`.agents/skills/factory-loop/SKILL.md` and the local `factory/cli.mjs` controller.
Route findings at every stage. Keep one persistent run, at most three global repair
waves, and independent verification. The controller records local attestations; the
caller owns authorized execution and trustworthy evidence. The controller does not
launch agents. Split a large candidate into stacked layer PRs with
`node "$FACTORY_ROOT/scripts/agents/split-layers.mjs"`; it applies each layer's merge-base diff to its
own paths and fails when a layer reverts a file main moved.

Triage uses `.agents/skills/triage/SKILL.md`. Bugs may proceed with an approved bug
brief plus the existing relevant architecture, design, contracts, and full regression
scenarios. Features need discovery and an approved PRD. The bug route replaces the
new-PRD requirement only for bounded runs. Code review uses
`.agents/skills/code-review/SKILL.md` in a fresh reviewer context. No verdict
authorizes merge, deployment, or changes to the factory's own rules.

The default feature pipeline diagram is in `.agents/reference/pipeline.md`. Opt-in
branches follow the same rules; steps 4, 7, and 8 of
[`instructions.md`](instructions.md) place them.

## Fast lane for small fixes

A change may use the fast lane only when all of these hold:

- It is a one-line change to user-visible text, or a change that only adds or edits one test.
- It touches no contract, schema, spec case, auth, data access, configuration, dependency, or shared module.
- It changes no layout or rendered structure.
- The author, the QA check, and the reviewer are different sessions.

Fast-lane steps:

1. The author runs the affected tests and the fast checks, and names the test files they cover.
2. The lead reads the full diff.
3. A scoped QA check runs the affected tests and their suite.
4. One fresh independent review (`.agents/skills/code-review/SKILL.md`) reads the diff and the QA output.

Skipped in the fast lane: the full QA gate session, Security candidate review, and Designer review. The controller's required QA and review tasks still apply, scoped to the change.

Escalate to the full lane when a condition fails, a check fails, or a finding reaches beyond the stated scope. Record the reason. Record `lane: fast` or `lane: full` in the handoff.
