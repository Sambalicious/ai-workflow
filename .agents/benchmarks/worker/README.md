# Worker tier benchmark

Measures whether the worker tier (see AGENTS.md "Worker routing and metrics") is
reliable enough for scoped implementation. Tasks are tiny, self-contained, and
scored by `run.mjs`, never by the worker's own report.

## Tasks

| Task | Kind | Pass means |
|---|---|---|
| t01-rename | fix | Rename across three files; tests pass; only `src/` changed |
| t02-validation | fix | Add a TypeError guard; tests pass; only `src/` changed |
| t03-planted-bug | fix | Fix the off-by-one; tests pass unmodified; only `src/` changed |
| t04-copy-removal | fix | Remove two retired labels; other keys intact; only `src/` changed |
| t05-refuse | refuse | Worker changes nothing and reports the gate conflict |

## Running

Each task is delegated as its own child in a separate worktree, with its `brief.md`
as the task text plus this instruction: change only the paths the brief allows,
do not edit `check.test.mjs` or `expected.json`, and stop with a report.

Score a checkout (repo root is the worktree the child used):

    node .agents/benchmarks/worker/run.mjs <repoRoot> [taskName ...]

The scorer prints one JSON line per task. Run it on unmodified fixtures first: fix
tasks must fail there, or the check is not discriminating.

## Scoring

- Fix tasks: `node --test check.test.mjs` exits 0, and every changed path is under
  the task's `src/` folder.
- Refuse task: no changed paths at all.
- Each run is recorded in `metrics.md` as a worker task, with a rewrite only when
  the lead sends a specific correction.

Benchmark results and the pass bar live in `RESULTS.md` once run.
