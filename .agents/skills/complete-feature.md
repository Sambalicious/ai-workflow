# Complete Feature

## Role

Close out a shipped feature by appending a completion stamp to its existing report and moving the feature folder from `features/active/` to `features/completed/`. This bookkeeping does not invoke Release Manager or grant release approval.

## Inputs

- Feature ID in the format `FEAT-XXXX` (e.g. `FEAT-0004`)
- User authorization to close the feature and evidence that it was deployed to production
- Absolute `PROJECT_ROOT` for the target project containing the feature. Resolve every
  `features/` path below against this root, never against the shared factory checkout.

## Instructions

1. **Validate the input** — the argument must match `FEAT-[0-9]{4}`. If no argument is provided, list all folders in `features/active/` and ask the user which one to complete.

2. **Locate the feature folder** — find the folder under `features/active/` whose name starts with the given ID (e.g. `FEAT-0004-property-rental-listing`). If not found, stop and report: "Feature FEAT-XXXX not found in features/active/."

3. **Confirm deployment and select the report**. Stop without user authorization and production deployment evidence. If Release Manager ran, use its latest `release-report` revision. Otherwise use the latest `code-review` report, without relabeling it as release approval. If the report is missing, stop and report the gap rather than invoking Release Manager or creating a release report. Preserve approved gates and unresolved blockers.

4. **Append a completion stamp** to the selected report:

   ```markdown
   ---

   ## Production deployment

   - **Status:** Completed
   - **Completed by:** [actual closing actor]
   - **Date:** YYYY-MM-DD
   - **Deployment evidence:** [reference]
   - **Notes:** Deployed to production. Feature closed.
   ```

   Replace `YYYY-MM-DD` with today's date and record the actual actor and deployment evidence.

5. **Offer a retrospective** before the folder moves. Follow
   `.agents/skills/retro/SKILL.md` against this feature's run and write `retro.md` into
   the feature folder, so the proposals travel with the feature. The retro is advisory and
   never blocks closing: if the user declines, write `Declined` in `retro.md` and
   continue. Do not edit steering files, rules, or checks while closing a feature;
   findings leave as proposals for the next run.

6. **Move the folder**:
   ```bash
   mv "$PROJECT_ROOT/features/active/FEAT-XXXX-slug" "$PROJECT_ROOT/features/completed/FEAT-XXXX-slug"
   ```
   Use the confirmed target `PROJECT_ROOT`. Create `PROJECT_ROOT/features/completed/`
   first if it does not exist. Keep any separate `RUN_ROOT` state and reports in place.

7. **Confirm** with a short summary:
   ```
   ✓ FEAT-XXXX-slug marked as completed.
   Moved: features/active/FEAT-XXXX-slug → features/completed/FEAT-XXXX-slug
   ```

## Rules

- Only act on features in `features/active/`. Never touch folders already in `features/completed/`.
- Do not delete any files. Only move the folder and append to the selected report.
- Do not modify any other files in the feature folder.
