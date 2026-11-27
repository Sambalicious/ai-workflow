---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS - not the current workspace.

Include a "suggested skills" section in the document, which suggests skills that the agent should invoke.

Do not duplicate content already captured in other artifacts (PRDs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.

## Update the feature digest

When the session belongs to a feature, refresh its `CURRENT.md` before writing the handoff document: the pipeline position, open PRs with head SHAs, decisions made, open blockers, next step, and links to reports. Copy `.agents/templates/CURRENT.md` into the folder when it has none. Then run `node "$FACTORY_ROOT/scripts/agents/current-digest.mjs" --feature <feature folder> --run <RUN_ROOT>`; exit 1 names a missing heading, a leftover template value, or a newest report the digest does not name. The handoff document links the digest instead of repeating it.
