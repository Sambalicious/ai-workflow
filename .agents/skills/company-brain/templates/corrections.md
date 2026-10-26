# Corrections

Every correction goes to the file that owns the truth, then into the log.

## Routing

| Correction is about | Route to | Approver |
|---|---|---|
| Fact (a rule or term is wrong or stale) | Dated amendment in [context file], then dependents | [Decision owner] |
| Decision (recorded wrongly) | The decision record and its mirror tables | [Decision owner] |
| Policy | `policies/` | [Decision owner] |
| Map (source missing or wrong) | `MAP.md` | [Brain approver] |
| Worker (step missing or wrong) | `workers/`, then re-run `tests/` | [Brain approver], after tests pass |
| Safety gate (worker crossed a boundary) | Suspend the worker, fix the stop condition, log the incident | [Decision owner], before reuse |

## Review before anything becomes shared knowledge

1. A human reviews and commits every packet.
2. Facts, decisions, policy, approval markers, the map, and the worker need explicit,
   dated approval from the named approver.
3. A worker change is accepted only when every replay test passes again.
4. After a safety-gate correction, the worker is not used until the owner signs off.

## Log

| Date | Type | What was wrong | Evidence | Routed to | Approved by | Status |
|---|---|---|---|---|---|---|
