# Use the factory from another project

Read this entry before using shared factory roles against an external project.
Use the existing checkout directly. No copying, installation, target package
dependency, or client configuration is required. The controller needs Node.js 18
or newer. The calling agent loads documents and dispatches work explicitly.

## Find or reuse the checkout

Use https://github.com/Sambalicious/ai-workflow as the discovery reference.
Reuse an existing shared checkout as `FACTORY_ROOT`. If none is available, obtain
user authorization for a one-time checkout outside the target project before
cloning. Keep that checkout read-only during project work.

If the repository is private, the person or agent obtaining the checkout needs
authenticated access. An HTTP 404 can mean missing access or an unavailable
repository. Stop and resolve access or request an accessible checkout rather than
assuming the URL works. The client also needs permission to read the local checkout.

A repository or branch URL is not a version pin. Use
[the run pinning rules](#pin-the-factory-for-the-run), including a frozen snapshot
for dirty or untracked content. Explicitly read this entry from the selected checkout;
a URL alone does not register tools or execute agents. Referencing the factory
grants no permissions or implementation approval. The user's actual task supplies
the scope, subject to the target's rules.

## Remember the reference in a project

Optionally add the following pointer to the target's `AGENTS.md` or the instruction
file your client loads. Replace the checkout path. This is a manual convenience,
not an installation requirement or permission to change target instructions.

```text
When I ask to use the AI team from https://github.com/Sambalicious/ai-workflow,
read /absolute/path/to/ai-team/factory/EXTERNAL.md first.
Use /absolute/path/to/ai-team as FACTORY_ROOT and this project's root as PROJECT_ROOT.
Confirm a separate private RUN_ROOT for the task using that entry.
Follow the target's rules and the scope of my actual request.
If the checkout is unavailable, stop and ask before creating one.
```

## Establish the roots

Set these absolute paths in the run handoff. Shell variables are a convenience,
not configuration read by the controller.

```bash
export FACTORY_ROOT="/absolute/path/to/ai-team"
export PROJECT_ROOT="/absolute/path/to/target-project"
export RUN_ROOT="/absolute/path/to/private-runs/target-project/run-001"
```

- Treat `FACTORY_ROOT` as read-only. Load shared `.agents/` roles, skills, and
  rules, `AGENTS.md`, and `factory/` tools from this root.
- Run application searches, Git commands, edits, builds, tests, and services in
  `PROJECT_ROOT`, or an explicitly assigned directory beneath it. Target project
  rules remain authoritative, including nested instructions, stack, and contracts.
- Store controller state, input and event files, logs, and generated reports in
  `RUN_ROOT`. Use `RUN_ROOT/reports/` for new handoff reports, not the factory's
  `features/` tree. Read existing specifications from their declared target paths.
  Put application deliverables in the target's approved locations, not `RUN_ROOT`.

Run `node "$FACTORY_ROOT/factory/roots.mjs" --project "$PROJECT_ROOT" --run "$RUN_ROOT"`
to check these rules, confirm the factory checkout is clean, and print `factory_version`.
It creates nothing and does not enforce writes; the caller still does.

Resolve symlinks before checking boundaries. In shared-checkout use, keep these
three roots separate: no root may equal or contain another. Keep `RUN_ROOT`
outside version-controlled source, restrict access, and allocate a unique directory
per project and run. Verify the parent directory before creating the run directory.
Stop if a root is missing, ambiguous, or overlaps another root.

Pass the resolved roots, factory version, target rules, and absolute input/output
paths to every worker. Resolve shared document references against `FACTORY_ROOT`,
even when the worker's current directory is `PROJECT_ROOT`. Resolve application
paths against `PROJECT_ROOT`; resolve new report paths against `RUN_ROOT/reports`.
Check each write destination before writing, including shell redirections and
test-tool output paths. Never infer a write root from the location of a loaded role.
The CLI does not enforce these root boundaries or use `repository` to change its
working directory. The caller owns these checks and filesystem permissions.

Before resuming or applying an event, check the persisted `config.repository`,
run ID, factory pin, and candidate against the intended target and handoff.
An absolute state path for project A still selects A when called from project B.
Stop on a mismatch; changing the working directory does not select or protect a run.
Use a separate report path per task and attempt. Concurrent workers also need
isolated writable application files or worktrees, databases, and ports.

If a factory default conflicts with target rules, follow the target rules and
report the conflict. If the conflict prevents a required factory gate, stop that
branch rather than weakening the gate. Loading shared roles grants no permission
to edit the target's instructions or the factory checkout.

## Pin the factory for the run

Record the factory's immutable commit and the exact controller, role, skill, and
rule contents used. For a clean checkout, use its commit SHA as `factory_version`.
For dirty or untracked factory content, a commit alone is insufficient. Record a
content digest and retain a retrievable frozen snapshot outside the target.
Use an identifier such as `snapshot-<sha256>` for `factory_version`, and record the
snapshot location in the run handoff. The field accepts an identifier, not a path.

Keep the selected contents fixed across all workers and resumed turns. Recheck
the pin before dispatch. If the shared checkout changes, stop until the same
pinned version is available. Never switch an active run to a new factory version.
Concurrent runs may share the same read-only version. Keep older versions available
until their runs finish; do not update a checkout while an active run depends on it.
Retain the state, reports, and pin together. Resume with the same `RUN_ROOT` and
state file; a new directory is not a way to reset budgets or repair waves.

## Load the workflow

1. Read the target's applicable instructions and the approved request.
2. Read `FACTORY_ROOT/AGENTS.md` for the team and handoff order, and applicable
   rules under `FACTORY_ROOT/.agents/rules/`. Explicit loading works without native
   skill discovery or copied agent configuration.
   Apply its role activation policy to new runs. Record enabled roles and explicit
   user opt-ins in the handoff. Generic full pipeline requests use enabled defaults;
   Copywriter and SEO run by default in feature runs. Growth, Data Analyst,
   Pentester, and Release Manager remain disabled unless each is requested.
   Omit disabled tasks and their edges, not `required: false` placeholders.
   Keep QA, Security, and fresh independent review mandatory. Preserve approved checks
   and blockers; report scope conflicts rather than activating a disabled role.
   Existing pinned runs retain their graph and gates.
   Apply its cost reporting policy before coding and at completion, for any client
   or provider. New runs default to reporting-only; telemetry is not a prerequisite.
3. For intake, load `FACTORY_ROOT/.agents/skills/triage/SKILL.md`. For an approved
   implementation or repair run, load `FACTORY_ROOT/.agents/skills/factory-loop/SKILL.md`
   and `FACTORY_ROOT/factory/PROTOCOL.md`. For independent candidate review, load
   `FACTORY_ROOT/.agents/skills/code-review/SKILL.md` in a fresh reviewer context.
4. Load the selected role from the team table under `FACTORY_ROOT`, not from the
   target. Pass full API contracts and spec files unchanged. Preserve existing
   target artifact paths; assign new report paths explicitly under `RUN_ROOT/reports/`.

The `features/` ID and lifecycle examples in `AGENTS.md` refer to target project
artifacts. Do not create a feature for an existing bug or tooling request merely
to use this entry. For an authorized new feature, use the target's convention and
keep run evidence isolated. Completing a target feature does not move the run ledger.

### Design baseline in the target

UI work needs a baseline before it needs a spec. If `PROJECT_ROOT` has no `DESIGN.md`,
the Designer copies `FACTORY_ROOT/.agents/templates/DESIGN.md` into the target root for
product-owner approval in the same change that adds the first surface. A target
`DESIGN.md` is authoritative and is never overwritten by the factory's copy. The design
gate then checks the spec's style basis and its coverage of the PRD's Surfaces table, so
a run cannot quietly decide typography or status tones per feature.

## Call the controller

Use the target project as the command working directory. After validating the
roots and creating the private run directory, inspect the CLI or generate a template:

```bash
node "$FACTORY_ROOT/factory/cli.mjs" --help
node "$FACTORY_ROOT/factory/example.mjs" input > "$RUN_ROOT/input.template.json"
```

Replace all template authority, repository, baseline, candidate, task, actor, and
version fields with real run inputs. Record actual authorization; templates are
not approval or evidence. Save the prepared input as `RUN_ROOT/input.json`.
The default template ends at `VERIFIED` on success, not release GO or approval.
For explicit release assessment, generate `input-with-release` instead of `input`.
It adds only Release Manager and can yield `PRODUCTION_READY` after all required
evidence passes. Neither status authorizes deployment or merge.
The cost mode defaults to `reporting_only`, with nullable usage and explicit
unavailability. See `PROTOCOL.md` for estimates and reliable source references.
Choose `strict` only explicitly; legacy schema 1 states remain strict. Resume the
same immutable mode, pins, and gates. No provider configuration change is needed.

```bash
node "$FACTORY_ROOT/factory/cli.mjs" init "$RUN_ROOT/state.json" "$RUN_ROOT/input.json"
node "$FACTORY_ROOT/factory/cli.mjs" show "$RUN_ROOT/state.json"
node "$FACTORY_ROOT/factory/cli.mjs" apply "$RUN_ROOT/state.json" "$RUN_ROOT/event.json"
```

Prepare each event from the current report as specified in `PROTOCOL.md`. Initialize
once. The controller records local attestations; it does not execute agents or
tests, authenticate identities, or authorize merge or deployment. Keep the existing
gate, budget, and security requirements. Do not present these commands as a runner.

## Existing installed usage

Projects that still hold a vendored copy keep working. For an existing
installed copy, `FACTORY_ROOT` and `PROJECT_ROOT` can be the same target root;
keep `RUN_ROOT` separate and outside version-controlled source. Relative
`node factory/cli.mjs` commands still work from that installed project root.
The factory ships no installer and commits no client-specific files. A client that wants
native subagents or slash commands gets them from
`node "$FACTORY_ROOT/scripts/agents/export.mjs" --client <claude-code|opencode|kilo> --target "$PROJECT_ROOT"`,
which writes machine-local symlinks and settings the project should git-ignore.

## TL;DR

Load roles from the pinned factory, operate on the target under its rules, and
write run state and reports to a separate private run directory. Pass absolute
roots and artifact paths to every worker. Enforce boundaries in the caller.
