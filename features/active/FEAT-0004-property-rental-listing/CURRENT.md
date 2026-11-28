# CURRENT — FEAT-0004 Property Rental Listing

Digest of the latest revision of every artifact. Read this before opening any
artifact, then open only the section a task needs.

**Status:** release assessment complete — **GO WITH CONDITIONS**. Not yet moved to
`features/completed/`.
**Product:** a listing platform where owners publish rentals with flexible
durations (shortlet, weekly, monthly, annual) and tenants search and filter.

## Blocking conditions before launch

From `release-report.md` (line 8). Each is an open item, not a shipped fix:

1. Strong random JWT secrets, rotated.
2. Validation and sanitization on every user input field.
3. Dependency scanning enabled and versions pinned.
4. Authorization logic centralized, with negative tests for bypass attempts.
5. Rate limiting on public endpoints.

## Artifacts

| Artifact | File | Lines | Read when |
|---|---|---|---|
| PRD | `prd.md` | 26 | Scope questions |
| Architecture | `architecture.md` | 23 | Structure, services |
| API contract | `api-contract.md` | 107 | Any backend or frontend change |
| Backend spec | `backend-spec.md` | 118 | Server work |
| Frontend spec | `frontend-spec.md` | 235 | UI work |
| Design spec | `design-spec.md` | 20 | Layout and tokens |
| DevOps config | `devops-config.md` | 179 | CI, deploy, hosting |
| Security review | `security-review.md` | 98 | Threat model and findings |
| Test plan | `test-plan.md` | 104 | What QA runs |
| Data plan | `data-plan.md` | 56 | Instrumentation |
| Release report | `release-report.md` | 70 | Verdict and conditions |
| Gherkin | `gherkin/` | — | Behaviour scenarios |

## Invariants

- One owner per listing; owners never see another owner's records.
- Rental duration is an explicit enum, not free text: shortlet, weekly, monthly,
  annual.
- Public endpoints are rate limited and inputs sanitized (conditions 2 and 5).

## Evidence

Test output, logs and screenshots belong under `RUN_ROOT/reports/` and
`RUN_ROOT/logs/`, passed by path. The repository holds the artifacts only.
