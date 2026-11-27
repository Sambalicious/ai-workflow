# Running a feature inside a token budget

A consumer Claude window is sized for one person talking. An agent swarm spends it in an hour.
This page is the operating limit that keeps a run inside the window, and the shape of the prompts
that spend least for the same output.

## Commands

```sh
pnpm agents:preflight qa-gate    # one max_tokens request; non-zero means do not dispatch
pnpm agents:ledger add --run <dir> --round 1 --role qa-gate --tier lead \
  --model sonnet --artifact qa/ --state running
pnpm agents:ledger check --run <dir>    # caps: 2 running, 1 advisor running; 40 dispatches warns
pnpm agents:ledger show --run <dir>
pnpm agents:ledger fail --run <dir> --role <r> --reason rate_limit    # closes a 429'd dispatch
```

`preflight` exits 2 with the `Retry-After` when the window is closed, 3 on a rejected
credential, 5 when no provider is configured. A closed window stops the run; it is not a retry
signal for each agent.

## Caps

| Cap | Value | Why |
|---|---|---|
| Claude agents running at once | 2 | each one pays its own cold prefix |
| Advisor agents running at once | 1 | the advisor-tier gates serialize; `--max-concurrent-advisor` |
| Claude dispatches per run | 40, warning | a long run is reviewed, not stopped mid-flight; a count is a poor reason to refuse an approved dispatch |
| Flash agents running at once | 4 | cheap tier, no shared window |
| Revisions per artifact per round | 1 | batch the review, then dispatch once |

## Routing

Authoring is worker tier: implementation, tests and fixtures, refactors, migration pins, MSW
handlers, and mechanical edits to a spec or a copy deck. `lead` is for decisions, product language,
specs and the QA and Designer gates. `advisor` is for the contract, the Security candidate review,
and the final independent review, nothing else. Security runs before the code review, not beside
it, because both are advisor tier and one Opus session runs at a time.

The question to ask before every dispatch is whether the output needs a decision. If the decision is
already recorded and the work is to apply it, it goes to the worker, and the lead reviews the diff.

## Prompt shape

Send the least that still produces the artifact:

1. **Role brief, one page.** The role file plus the sections that role needs, quoted. The full
   PRD, architecture, design spec and copy deck stay on disk.
2. **Section pointers.** "api-contract.md sections 3 and 5", not "read the file".
3. **One source of truth.** Do not paste a spec into the prompt and also tell the agent to read
   it. That bills twice.
4. **Ask for patches.** A revision is an edit: "change section 7, return only the changed
   text". Output is five times the input price, and a regenerated 40 KB document is all output.
5. **Filtered evidence.** Failures and the summary line, not a full test dump.

## Ledger

Every dispatch is one JSON line in `<run>/dispatch-ledger.jsonl`, written before the agent
starts. `check` refuses a third concurrent Claude agent and warns past 40 dispatches, so the
wall is found in a script rather than at 22:52. A 429 or a dead session closes its row with
`pnpm agents:ledger fail --run <run> --role <role> --reason rate_limit`; `--force` records the
row as `forced`.

## When the window closes

1. Stop Claude dispatches. Do not retry one agent at a time; the window is shared. Mark each
   affected ledger entry failed with `--reason rate_limit`, then retry on the same tier and
   model once the window reopens.
2. Move what can move to the worker tier and say so in the run notes.
3. Record the incident with its `Retry-After` in the run's `CURRENT.md`.
4. If this happens twice in a week, the workload needs its own metered quota (an Anthropic API
   key with a Console spend cap), not a bigger share of the personal subscription.
