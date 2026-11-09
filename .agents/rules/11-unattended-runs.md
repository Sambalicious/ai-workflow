# Rule 11 — Unattended Runs Need a Watchdog (auto-loaded)

An unattended run is any stretch where the Candidate is away: overnight goals, "keep going without me", long background batches. On 2026-10-18 a QA subagent stalled one minute into an overnight goal. Nothing checked on it, every later step waited on it, and eight hours produced nothing. This rule makes stalls visible within thirty minutes and keeps one stuck step from freezing the run.

---

## Before the Candidate leaves

1. **Scheduled watchdog.** Create a recurring check-in (`cron_create`, every 30 minutes) whose prompt runs the check-in steps below. A run is watched only when `cron_list` shows it. Tell the Candidate the watchdog's id and next fire time.
2. **Run deadline.** Give each slice's controller run a positive `budget.elapsed_ms` (default 12 hours) and each subagent a stated time box in its brief (default 90 minutes of work, then report what is done). The watchdog catches stalls; the run deadline only stops a run that is still working. On 2026-10-21 a 6-hour deadline stopped slice 8b eight minutes before its last gate passed, after provider drops and a mid-run switch of instructions.
3. **Progress log.** Create `.runs/morning-summary.md` now, with sections *Merged*, *In progress*, *Parked*, *Needs the Candidate*. It is the single place the Candidate reads in the morning.
4. **Spend cap.** Remind the Candidate that only a provider-side budget (for example a daily LiteLLM key budget) bounds token spend; the controller cannot see tokens.

The run is ready to leave unattended when all four are done and the first check-in has been scheduled.

## Every check-in

1. **Liveness.** For each running subagent, find its newest output: files under its `RUN_ROOT` area, board posts, git working-tree changes. Output older than 30 minutes means **stalled**.
2. **Stall response.** First stall: stop the subagent, record it in the progress log, and dispatch a fresh one with the same brief and a note on where the last one stopped. Second stall on the same step: park the step (see below) and move on.
3. **Leftovers.** Compare running Docker containers, browsers and test processes with what active subagents need. Stop what this project started and no live subagent owns. Leave other projects' processes alone.
4. **Load.** Read `uptime`. Start a heavy job only when the 1-minute load is below the core count, one heavy job at a time.
5. **Log.** Append one timestamped line to the progress log: what moved, what is running, what is parked.

A check-in is complete when every running subagent is either live or replaced, and the log line is written.

## Parking

Park a step when it stalls twice, exhausts its repair waves, or needs a decision only the Candidate can make. Write it under *Needs the Candidate* or *Parked* with the evidence and the exact question. Then continue with work that does not depend on it: independent spec updates, docs, later slices whose inputs are unaffected. Stop the run only when nothing left is independent of the parked step.

## Cleanup

Every subagent tears down the stacks, browsers and processes it starts before it reports. A brief that asks a subagent to start a stack also tells it to stop that stack on completion, failure or time-box expiry.

## Ending the run

Before the final report: delete the watchdog (`cron_delete`), confirm no project leftovers are running, and bring `.runs/morning-summary.md` up to date with what merged, what is parked, what needs the Candidate, and cost (estimate or `Actual cost unavailable`).
