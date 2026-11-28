# CURRENT - FEAT-XXXX-<slug>

The feature digest. A fresh session reads this file first, then only the section a
task needs. Refresh it at every hand-off, at every repair-wave close, and before a
session reset. Keep it near 2.5K tokens: link the artifacts, do not paste them.

Copy this file into `features/active/FEAT-XXXX-slug/` when the folder is created.
`node "$FACTORY_ROOT/scripts/agents/current-digest.mjs" --feature <folder> --run <RUN_ROOT>`
fails when a heading below is missing, when a template value is still here, or when the
report named below is not the newest report in `RUN_ROOT/reports`.

Reports through: <newest report path>

## Pipeline position

Stage [3b] Designer complete; [4] API contract in progress; next [5a]-[5e] in
parallel. Name the last gate that passed, the stage in progress, and the next gate.

## Open PRs

- PR #123 head 0f3c2b1a9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f40 - <title>

Every open pull request carries its number and head commit, so a hand-off reviews
the commit that is actually under review. Write `none` when no pull request is open.

## Decisions made

- <decision> - <decided by>, <link to the artifact or ADR>
- <decision> - <decided by>, <link>

Only decisions the next session must not reopen. One line each, newest last.

## Open blockers

- BLOCKER[backend-engineer]: <description>; owner and required correction.

Write `none` when nothing blocks. An unowned blocker names the role that decides it.

## Next step

<the single next action>: <owner> runs `<command>`, result saved to `<path>`.

## Reports

- [QA report](RUN_ROOT/reports/FEAT-XXXX-qa.md)
- [Code review](RUN_ROOT/reports/FEAT-XXXX-code-review-<sha>.md)
- [Security review](RUN_ROOT/reports/FEAT-XXXX-security.md)

Link every report a session would otherwise go looking for. The `Reports through:` line
above names the newest `.md` report under the run root; update it with the digest, so a
touch or a fresh checkout cannot make an old digest look current. `Updated: <ISO time>`
is accepted instead.
