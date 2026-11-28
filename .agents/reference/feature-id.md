# Feature ID format

Read this when: naming a new feature. Referenced from [AGENTS.md](../../AGENTS.md).

Every idea is assigned a stable key: `FEAT-XXXX` where `XXXX` is a zero-padded 4-digit number auto-incremented from the highest existing feature.

**How to derive the next ID:**
1. List all folders under `features/active/` AND `features/completed/` that match the pattern `FEAT-XXXX-*`.
2. Extract the highest number found across both directories. If no features exist yet, start at `0001`.
3. Increment by 1 and zero-pad to 4 digits.

**Folder name format:** `FEAT-XXXX-short-slug`
- `FEAT-XXXX` — the auto-incremented ID
- `short-slug` — 2–4 lowercase hyphen-separated words derived from the idea

Examples: `FEAT-0001-water-intake-tracker`, `FEAT-0002-ai-git-diff-cli`, `FEAT-0003-habit-streak-app`

**Feature lifecycle:**
- Active features live under `features/active/FEAT-XXXX-slug/`
- Completed features (deployed to production) live under `features/completed/FEAT-XXXX-slug/`
- Use the `/complete-feature` skill to move a feature from active → completed
