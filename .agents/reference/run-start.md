# Run start: verify the rules before dispatching

Read this when: before dispatching the first role of a run. Referenced from [AGENTS.md](../../AGENTS.md).

A target project can vendor an old `.agents/` and an old copy of this file. A stale
copy silently overrides the current policy — no later step can catch it, so check it
first, every run, before any role is dispatched.

1. Resolve `FACTORY_ROOT` to an absolute path and record it in the run brief with
   `git -C "$FACTORY_ROOT" rev-parse HEAD` and `git -C "$FACTORY_ROOT" status --short`.
   Inside the factory checkout itself, that commit is this file's. A branch or a
   repository URL is not a pin.
2. Read `factory/EXTERNAL.md`, `.agents/models.json` and
   `.agents/skills/dispatch-worker/SKILL.md` from `FACTORY_ROOT`, never from a target's
   copy when the two differ.
3. When the target is not the factory, compare its `.agents/` with `FACTORY_ROOT`'s.
   `.agents/factory-version` records the commit it was
   installed from; when that differs from `FACTORY_ROOT`'s commit, the factory wins and
   the run brief says so. When the target's tier table has no `worker` row, the copy is
   stale: stop and report it rather than dispatching.
   `node scripts/agents/factory-lock.mjs --against "$FACTORY_ROOT"` lists every
   `factory/` and `scripts/agents/` file that differs, and plain
   `node scripts/agents/factory-lock.mjs` fails when the target edited one locally
   since `.agents/factory-lock.json` was written. Add it to the target's
   `agents:check`, so CI catches the edit.
4. Quote the `worker` row from `models.json` in the run brief, so the tier in use is
   visible in the artifact rather than only in a prompt.
5. After any delegate reports failure, timeout or a rate limit, check the artifact it
   was writing on disk before reporting it as missing. A provider error can arrive
   after the file landed.
6. Before accepting a worker result, run `pnpm agents:boundary` (or
   `node scripts/agents/worker-guard.mjs --base <ref>`) and send anything it lists back
   to the lead or the advisor. It checks the real diff, including untracked files,
   against the worker boundary, so a brief that quietly widens scope still fails.
7. Run `pnpm agents:stale` before the first dispatch. A branch more than 30 commits
   behind `origin/main`, or whose `.agents/models.json` differs from it, runs without
   the current policy. It also warns, without failing, when main's latest completed CI
   run is not green, and names a job annotation when a job never started.
8. A Claude dispatch runs `pnpm agents:preflight <role> --record <run>` first, then
   `pnpm agents:ledger add ...`. The ledger refuses a lead or advisor dispatch without a
   receipt younger than ten minutes, so the sequence cannot be skipped by habit.
   `<run>` is the run directory itself or the feature id that resolves under
   `features/active/` (or `RUN_ROOT` in an external run); both commands never create it.
   The project names its product remote in `.agents/remotes.json` (`productRemote`), and
   preflight warns when this branch pushes to a different one.
9. A gate runs only when its inputs exist: `pnpm agents:artifacts --run <feature> --gate
   <qa|design|security|code-review>`. A file that exists is not an input. The design
   spec must carry screen blueprints with a wireframe, a feedback matrix with pattern
   and tone, copy slots keyed `screen.element.state` with an intent — or a stated
   `None` for the slots alone — and a style basis: `Per DESIGN.md`, or the tokens
   themselves. A headline-only spec fails the design, security and code-review gates
   the same way a missing file does. The design gate also requires `design-consult.md`
   and refuses a spec that does not cover every surface and state the PRD's Surfaces
   table names. Only the highest `.rN.md` revision is read. List inherited test
   failures in `docs/ops/known-failures.md` and compare a run's report with
   `pnpm agents:known-failures --report <vitest json>` instead of re-deriving them.
10. A pull request opens only after `pnpm agents:pr-gate --run <run>` passes: it needs
   `reports/code-review-<head>.md`, the review of the exact head commit, with a `PASS`
   verdict line.
