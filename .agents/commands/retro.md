---
description: Run a retrospective on a session and propose environment improvements, most severe first
argument-hint: "[session, run root, or feature to review]"
---
Run a retrospective on the coding agent's environment.

Target session or run: $ARGUMENTS
Empty means the current session.

1. Read `.agents/skills/retro/SKILL.md` and follow it.

2. This command is client-neutral. Map each capability to what your client provides:
reading another session's transcript (session logs, an export, or the current
conversation), scanning this repo's git history, and a structured question round for
the implementation choice (Claude Code `AskUserQuestion`,
otherwise one numbered message). If a capability is missing, say so and fall back to
the current session and one numbered message.

3. Propose candidates only. Make no edit to steering files, rules, or checks until
the user picks which ones to implement.
