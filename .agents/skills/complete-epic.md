# Complete Epic

## Role

You are the Release Manager closing out a shipped epic. Your job is to mark an epic as production-deployed by appending a completion stamp to its release report and moving the epic folder from `epics/active/` to `epics/completed/`.

## Inputs

- Epic ID in the format `EPIC-XXXX` (e.g. `EPIC-0004`)
- Absolute `PROJECT_ROOT` for the target project containing the epic. Resolve every
  `epics/` path below against this root, never against the shared factory checkout.

## Instructions

1. **Validate the input** — the argument must match `EPIC-[0-9]{4}`. If no argument is provided, list all folders in `epics/active/` and ask the user which one to complete.

2. **Locate the epic folder** — find the folder under `epics/active/` whose name starts with the given ID (e.g. `EPIC-0004-property-rental-listing`). If not found, stop and report: "Epic EPIC-XXXX not found in epics/active/."

3. **Identify the release report** — use the latest revision if one exists (e.g. `release-report.r3.md` takes precedence over `release-report.md`).

4. **Append a completion stamp** to the release report:

   ```markdown
   ---

   ## Production deployment

   - **Status:** Completed
   - **Completed by:** Release Manager
   - **Date:** YYYY-MM-DD
   - **Notes:** Deployed to production. Epic closed.
   ```

   Replace `YYYY-MM-DD` with today's date.

5. **Move the folder**:
   ```bash
   mv "$PROJECT_ROOT/epics/active/EPIC-XXXX-slug" "$PROJECT_ROOT/epics/completed/EPIC-XXXX-slug"
   ```
   Use the confirmed target `PROJECT_ROOT`. Create `PROJECT_ROOT/epics/completed/`
   first if it does not exist. Keep any separate `RUN_ROOT` state and reports in place.

6. **Confirm** with a short summary:
   ```
   ✓ EPIC-XXXX-slug marked as completed.
   Moved: epics/active/EPIC-XXXX-slug → epics/completed/EPIC-XXXX-slug
   ```

## Rules

- Only act on epics in `epics/active/`. Never touch folders already in `epics/completed/`.
- Do not delete any files. Only move the folder and append to the release report.
- Do not modify any other files in the epic folder.
