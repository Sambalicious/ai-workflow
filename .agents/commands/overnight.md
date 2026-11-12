---
description: Prepare this session to run unattended overnight (ask decisions up front, record authority, keep working with scheduled check-ins)
argument-hint: "[notes for tonight]"
---
Prepare this session to run unattended overnight.
Extra notes from the product owner (may be empty): $ARGUMENTS

This command is client-neutral. Map each capability to what your client provides:
structured question round (Kilo/OpenCode `question`, Claude Code `AskUserQuestion`,
otherwise one numbered message); scheduled wakeup (Kilo `schedule_wakeup` or
`cron_create`, Claude Code `/loop` or a scheduled task). If the client has no
scheduled wakeup, say so and record in the plan that work stops when this turn
ends. Never replace a wakeup with a sleep or polling loop.

For a shared factory checkout, read `factory/EXTERNAL.md` under `FACTORY_ROOT` first
and use its `PROJECT_ROOT` and `RUN_ROOT`. For an installed copy, the run root is
the active feature or run directory. Target project rules remain authoritative.

1. Ask me now, in one structured question round, every product or scope decision
   you will need before morning: open PROPOSAL/PENDING items, follow-up work you
   would otherwise wait to ask about, design choices that block a worker, and
   whether to start follow-up work tonight (stacked on the current branch if it
   depends on it). Put a "(Recommended)" option first. Don't ask me anything you
   can find out yourself.

2. In the same question round, ask which of these you may do without asking me
   (multi-select):
   - Open PRs when a run reaches VERIFIED
   - Merge main and apply mechanical fixes, such as renumbering clashing migrations
   - Start a corrected run with the same scope if a run is blocked or out of repair waves
   - Resume or restart workers after provider/connection crashes
   Merging to main, deploying, live keys and real money always stay with me.

3. Record my answers and the granted authority in `overnight-decisions.md` in the
   run root, and write `OVERNIGHT-PLAN.md` there listing the remaining steps in
   order, the owner of each, the check-in interval, and the wakeup mechanism.

4. Then keep working overnight:
   - Follow `AGENTS.md` and `.agents/skills/factory-loop/SKILL.md` from the factory
     root: controller events for every step, QA and Security in parallel, then a
     fresh independent review. Declare three identities each for QA, Security and
     review in any new run.
   - Record a QA-owned test correction as category "test" with source task "qa".
   - Before QA's full suite, check that the candidate merges cleanly with the latest
     origin/main and, if the project numbers migrations, that no number collides.
     Fix that first if authorized; otherwise record it as a blocker.
   - When main moves after the gates pass, merge it and run the factory-loop merge
     check for a merge-only update instead of repeating QA, Security and review.
     Any change to the candidate's own code still gets the full gates.
   - Workers: keep a progress log, commit after each unit, keep tool output small,
     never print or commit secrets, and scan diffs for secrets before each commit.
   - Schedule a wakeup about every 45 minutes to check workers and act on whatever
     finished or crashed. Never poll in a loop.
   - A decision not covered in step 1 becomes a morning item; continue with
     independent work instead of guessing.

5. Leave a morning summary in `MORNING-SUMMARY.md` in the run root and in this
   session: PR links and merge order, what is VERIFIED, what is blocked and why
   (`BLOCKER[agent-name]: description`), the decisions waiting for me (PENDING
   copy, PROPOSAL values, unapproved authority), and the cost report required by
   the `AGENTS.md` cost reporting policy.
