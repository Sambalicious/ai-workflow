# Local factory controller

The controller validates a caller-supplied task graph and records local attestations.
It does not launch agents, inspect source changes, run tests, authenticate people,
or grant merge, deployment, or permission changes. Use
`../.agents/skills/factory-loop/SKILL.md` for the agent workflow.

For a shared checkout serving another project, read [EXTERNAL.md](EXTERNAL.md)
first. It defines `FACTORY_ROOT`, `PROJECT_ROOT`, and `RUN_ROOT`, factory pinning,
and caller-enforced path boundaries. The relative commands below remain valid
from this checkout or an existing installed project root.

## Commands

```bash
node factory/cli.mjs --help
node factory/example.mjs input
node factory/example.mjs start
node factory/cli.mjs init /path/to/run.json /path/to/input.json
node factory/cli.mjs show /path/to/run.json
node factory/cli.mjs apply /path/to/run.json /path/to/event.json
```

CLI path arguments are relative to the process working directory unless absolute.
The `repository` field does not change that directory. External-project callers
use the target working directory and absolute script, state, input, and event paths
from `EXTERNAL.md`. The state parent
directory must already exist. Input and event paths accept `-` for standard input.
Templates print a warning to stderr. Replace sample approvals, hashes, evidence,
and usage with real observations. Templates are not execution evidence.

`init` rejects an existing state file. `apply` uses a single-writer lock and atomic
replacement. Stale locks require operator inspection; do not delete an active lock.
`show` computes deadline status without changing the file; a `tick` event persists it.
Keep state outside version-controlled source and restrict access because event
history can contain sensitive references.

Successful commands print a JSON report. Rejected commands print a JSON error to
stderr and exit nonzero. A valid event can produce a stopped or blocked report with
exit code zero. Always inspect `status`, task reasons, and findings.

## Run input

Use `node factory/example.mjs input` for the executable input schema example.
Unknown fields are rejected rather than silently ignored.

### Role selection

Apply the [AGENTS.md role activation policy](../AGENTS.md#role-activation-policy)
before initializing a new run. Record enabled roles and explicit user opt-ins in
the scope handoff, not new schema fields. The default example omits Growth, Data
Analyst, and Release Manager actors, tasks, and dependency edges. Marking disabled
tasks `required: false` would still schedule them and can make them required through
consumers. Keep QA, Security, and fresh independent review required.

For explicit release assessment, `node factory/example.mjs input-with-release`
adds a required release task after QA, Security, and review. It does not enable
Growth or Data Analyst. Add either assessment only when explicitly requested,
declaring its actual dependencies and required consumers before initialization.
Approved checks and blockers remain binding; a conflict with a disabled role needs
a user decision rather than implicit activation or a waived gate.

Existing active pinned runs retain their graph, factory version, approved gates,
and blockers. These defaults do not migrate persisted state.

### Input fields

| Field | Meaning |
| --- | --- |
| `run_id`, `work_item_id` | Stable identifiers |
| `repository`, `base_sha` | Target repository identity and immutable baseline |
| `factory_version` | Fixed skill, policy, and role version selected by the caller |
| `trusted_adapter_id` | Caller identity asserted on each event |
| `authorization` | `approved`, `approved_by`, and retrievable approved `scope_ref` |
| `actors` | IDs and allowed role names for this run |
| `candidate` | Retrievable `ref` and lowercase SHA-256 `hash` |
| `tasks` | DAG of role assignments, required flags, output types, and checks |
| `budget` | Optional lower pilot limits |

Each task declares `id`, `role`, `depends_on`, `required`, `kind`, and
`artifact_kind`. Code tasks also declare `component` as `backend` or `frontend`.
Task kinds are `work`, `verification`, `review`, and `release`. Gates declare
nonempty `checks`; work tasks cannot self-attest gate checks. Required consumers
make their ancestors effectively required, even if an ancestor was marked optional.

Artifact references are opaque, never opened by the controller. The adapter must
check that their content matches the supplied digest. Persisted actor IDs represent
actual separate workers, not alternative labels for the same implementation author.
Inspect `ready.eligible_actors` before dispatch.

## Event envelope

All events contain `type`, unique `event_id`, current `expected_version`, declared
`actor_id`, matching `adapter_id`, and `attested: true`. The attestation is a local
assertion, not authentication. Replaying an identical event is idempotent; changing
its payload under the same event ID is rejected.

Read `show` before creating an event. Copy the complete `ready.inputs` and
`ready.candidate` into a start event, including dependency attempt IDs, revisions,
and artifact hashes. Never fabricate a current snapshot from an old report.

The template emitter lists supported event templates when given an unknown name.
The source reducer and executable tests define validation for event payloads.

### Lifecycle

1. Initialize with the approved baseline and task graph.
2. For each ready work task, submit `start`, execute the authorized agent, then
   submit `complete` with measured usage and the produced artifact.
3. After work settles, publish the actual integrated candidate with `publish`.
   A future hash is not required before implementing a change. Gates wait for
   this explicit publication and receive its exact reference and digest.
4. Run required QA, security, and fresh code review gates with separate actors.
   Run the required release gate only when enabled.
   Every required work output must reach QA and code review through dependencies.
5. Submit `finding` when a stage exposes a defect. `repair` groups unresolved
   findings into a global wave, invalidates affected work, and schedules reruns.
6. Execute repairs, publish the resulting candidate, then run fresh checks.
   Dedicated rechecks use ordinary starts, reservations, and completions. They
   require an actor independent of the source author, including earlier authors.
7. Submit `resolve` against the completed independent recheck. A repaired report
   does not close its own issue. Inspect the final report instead of assuming
   that successful event submission means successful verification.

`retry` schedules a failed or blocked task again without changing product scope.
It is bounded to two lifetime retries per task and consumes ordinary invocation
and execution budgets. Use it for transient or report-format failures, not to
avoid routing a known product defect. A retry does not reset repair waves.

The controller may add a `recheck:<finding_id>` task for independent closure.
Provide distinct role-qualified actors for report repairs, including QA and
Release Manager reports. A missing eligible verifier blocks rather than permitting
the original author to approve the repair.

For completion, report actual token and cost usage even when a call failed. Gate
success needs evidence for every declared check, bound to the exact candidate.
Rejected evidence still consumes observed usage. A failed task does not become a
pass because a later retry succeeded; history retains both attempts.

For findings, identify the causal source task and current source attempt, category,
subtype, candidate, and evidence reference. Store expected/actual behavior,
acceptance IDs, severity, and reproduction in that retrievable evidence artifact.
The router checks category, artifact kind, component, and source role together.
Unknown ownership is not guessed. Requirement or permission conflicts need a human.

| Event | Fields in addition to the common envelope |
| --- | --- |
| `start` | `task_id`, unique `attempt_id`, positive `reservation: {tokens, cost_usd}`, exact `inputs`, exact `candidate` from ready assignment |
| `complete` | `task_id`, `attempt_id`, `outcome`, observed `usage`; success needs `artifact: {ref, hash}`, gate success also needs `evidence`; failed/blocked needs `reason` |
| `publish` | Actual `candidate: {ref, hash}`; controller actor only |
| `finding` | `finding_id`, `category`, `subtype`, `source_task_id`, `source_attempt_id`, `source_revision`, exact current `candidate`, `evidence: {ref, hash}` |
| `repair` | All unresolved `finding_ids`; controller actor only; no future candidate hash |
| `resolve` | `finding_id`, dedicated `verification_task_id`, `verification_attempt_id`, current `candidate`; actor must match completed independent recheck |
| `retry` | Failed/blocked `task_id`, `reason`; controller actor only |
| `skip` | Optional `task_id`, `reason`; controller actor only; cannot skip required ancestors |
| `tick` | No additional fields; controller actor only |

Completion outcomes are `success`, `failed`, or `blocked`. Gate evidence is an array
with exactly one `{check, artifact: {ref, hash}, candidate: {ref, hash, revision}}`
entry per declared check. A candidate copied from a report includes its logical
`revision`; initial input and `publish` use only `ref` and `hash`.

Known routing categories include `code`, `security`, `contract`, `product`, `spec`,
`gherkin`, `architecture`, `design`, `test`, `infra`, `growth`, `data`, `review`,
and `release`. Categories `schema` and `format` delegate to the declared artifact
kind's producer. A code source must name its backend/frontend component. Identify
the broken artifact, not merely the check that exposed it.

## Budgets and assurance

The pilot is intentionally conservative. All declared work settles before candidate
gates start; a pending or failed optional task must finish or be explicitly skipped.
Unknown ownership requires a human decision; the immutable run has no automatic
reclassification, role-registration, or approval-edit event. Prepare the role graph
and independent verifier identities at intake. Preserve blocked state and its usage
if a human authorizes a corrected plan outside this controller.

Defaults are four concurrent tasks, 32 invocations, three global repair waves,
200,000 tokens, US$20, and 90 minutes elapsed. All attempts count, including failed
and invalidated work. Reservations precede execution. The caller must enforce
per-attempt bounds and submit truthful usage. A local ledger cannot cap external
spending by itself. Budget limits cannot be increased through events.

The report includes version, status, stop reason, candidate, ready tasks, attempts,
findings, budget, and observed/reserved usage. Successful runs without a required
release task yield `VERIFIED`; with explicit release opt-in they yield
`PRODUCTION_READY`. Without release assessment, report verification results and
unresolved blockers, not release GO or approval. Both statuses are conditional local
assessments based on supplied evidence, never authorization to
merge or deploy. `BLOCKED` requires missing work or decisions; `STOPPED` records
an exhausted limit or terminal condition. `RUNNING` means work remains.

Do not reset budgets by starting a replacement run after exhaustion. An operator
must approve any continuation and retain the previous run as evidence.

Factory-rule improvement is outside this controller. Record a proposal separately,
evaluate against a frozen baseline and held-out tasks, and obtain approval before
promoting a new version for future runs.
