---
name: dispatch-worker
description: "Start implementation on the worker tier (DeepSeek V4.1 Flash) through T3 delegate_task, review it on the lead tier, and climb the escalation ladder only on evidence. Use when implementation begins, a worker result needs one rewrite, or the lead has to fix a failed worker result."
---

# Dispatch worker

Implementation starts on Flash. The lead writes the brief, reviews the diff, and
integrates. The ladder climbs only on evidence: worker, one worker rewrite, lead,
advisor. `AGENTS.md` Worker routing and metrics is the authority; this skill is the
procedure.

## Boundaries

- The worker implements from a written brief. It never plans, decides design, or
  edits contracts, auth, RLS, secrets, and truth-guard rules. It never runs or
  replaces the QA, Security, or code review gates.
- The lead never starts implementation on a Sonnet or Opus subagent when the work
  fits "Workers may take" in `AGENTS.md`.
- Real money, live keys, deploys, and merges stay off the worker tier.
- A worker stops and reports when two documents disagree or the code does not
  match the design. The lead resolves that; the worker does not guess.

## Inputs

- The approved task, PRD or bug brief, and the sections of the design, spec, or
  API contract the change must satisfy. Pass paths, not the session history.
- Files in scope, acceptance checks, and what not to touch.
- The current `metrics.md` tally for the feature or task.

## Steps

1. Confirm the worker tier. Call `orchestrator_capabilities` once per thread, and
   again only after an error or a user-named provider change. If the worker tier
   is missing, report it and stop; never fall back silently to native subagents,
   Workflow, or CLIs.
2. Write the brief: goal, files in scope, acceptance checks with the exact command
   and expected result, what not to touch, the source sections to follow, the
   stop-and-report conditions, and the Results table the worker fills in.
3. Dispatch with `delegate_task`. Settings belong in `target.options`; never build
   a child checkout in the shell.

   ```json
   {
     "target": {
       "providerInstanceId": "opencode",
       "driverKind": "opencode",
       "model": "opencode-go/deepseek-v4.1-flash",
       "options": { "variant": "high" }
     },
     "task": "<the brief>"
   }
   ```

   Claude targets (`sonnet`, `opus`) go in the same place with
   `options: { "effort": "medium" }`. Raise it only for a named problem, and say why
   in the handoff (AGENTS.md, Cost discipline).

4. Review the result yourself: read the diff, confirm it matches the brief and
   touches nothing out of scope, run the stated checks when the change is not
   mechanical, and check each acceptance point. Send test output to a file under
   the run root and read the summary, never the raw transcript.
5. Close the task: accept, send one specific rewrite, or escalate one rung. Update
   `metrics.md` in the same step.

## Results table

Every brief ends with a **Results table**: one row per requested item - each file
group, acceptance check, and gate the brief names - with a status of `done`,
`failed`, or `skipped` and the evidence (the command, the output file, the commit, or
`file:line`). The worker's report ends with that table. The lead rejects a report
that omits it, or leaves a status or evidence cell blank, without reading further:
a summary paragraph is not a result.

A 429, provider block, tool error, or timeout inside the task makes the report
`incomplete`, never `completed`. The affected row says `failed` or `skipped`, names
the error, and the closing line says `incomplete`. Retry the same tier and model once
the window reopens. A successful retry reports its own rows; the failed attempt is
never reported as done.

| item | status | evidence |
|---|---|---|
| <file group, check, or gate from the brief> | done, failed, or skipped | <command, output path, commit, or file:line> |

## Escalation ladder

| Rung | Who | When |
|---|---|---|
| 1 | Flash | every implementation start |
| 2 | Flash rewrite | the result is wrong; exactly one rewrite, one time |
| 3 | Lead (Sonnet) | the one rewrite still fails |
| 4 | Advisor (Opus) | the lead fix also fails, or the same error returns twice |

- The rewrite names what is wrong, where, and the expected result. Do not resend
  the whole original brief as a second attempt.
- Provider blocks, rate limits, outages, and dropped connections are retried on
  Flash. They are not failures, not rewrites, and do not climb the ladder.
- Name the role and reason before any advisor call. Two failed attempts on the
  same problem go to the advisor.

## Metrics

Keep `metrics.md` in the feature folder or beside the task notes, and update it after
each reviewed result.

```md
| metric | value |
|---|---|
| worker_tasks | 0 |
| rewrites | 0 (one-line reason each) |
| self_fixes | 0 |
| advisor_calls | 0 (one-line reason each) |
| advisor_share | advisor_calls / (worker_tasks + self_fixes + advisor_calls) |
| rewrite_rate | rewrites / worker_tasks |
```

Report the tally in the final summary. These are reports, not limits, and never
justify skipping a gate. Pull a task type back to the lead tier when its rewrite
rate passes about 1 in 7 over ten tasks.

`scripts/agents/worker-guard.mjs` is a Claude Code `PreToolUse` hook on `Agent`
that blocks implementation started on sonnet, opus, or an inherited model. Re-route
the work to Flash. `EVE_ALLOW_LEAD=1` turns the block into a warning for a deliberate
override, and the run brief says why.

## Output format

Report the goal or brief ID, the worker task and rewrite count, the diff review
result, the checks run and their result, the current ladder rung (none, one
rewrite pending, lead fix, or advisor consult), and the `metrics.md` tally. End
with the filled Results table, then `TL;DR`. A disagreement or gap uses
`BLOCKER[agent-name]: description`.
