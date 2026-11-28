# Revision loop

Read this when: a stage reports blockers. Referenced from [AGENTS.md](../../AGENTS.md).

Any stage with blockers lists each one in a **Blockers** section, tagged to its owner: `BLOCKER[backend-engineer]: description`.

To resolve a round:

1. Group blockers by owner. Send each owner its blockers, its original output (TL;DR and relevant sections), and the stage's evidence. If the owner is disabled, ask the user for a decision. Never activate the owner or waive the blocker.
2. Re-run the affected owners. Save revised output as `<file>.rN.md`, where N is the round.
3. Re-run every enabled downstream consumer in dependency order, with the same suffix.
4. Re-run the affected gates: QA, Designer review (UI changes only), Security, Pentester (when enabled), fresh review, and Release Manager (when enabled, as `release-report.rN.md`). Security precedes the fresh review, which receives its findings as checks.
   - Keep each wave small. QA reruns the affected spec cases and the regression safety net, and states its selection. A full run is required when the repair touches shared code, contracts, schemas, or configuration. Designer review reruns only when rendered UI changes. Security checks the changed candidate against its existing threat model. No selection waives a required gate on the changed candidate.
5. Repeat until required gates pass and blockers are resolved, up to 3 rounds. Report `VERIFIED` without a release assessment. Report a release verdict only when one ran.

If 3 rounds end with blockers left, stop and surface them to the user.

**Downstream reruns:** every consumed artifact is a task dependency. A changed artifact invalidates its producer and every transitive consumer, which rerun in dependency order. This includes Copywriter and SEO, and Growth, Data Analyst, and Pentester only when enabled. A candidate change invalidates candidate-specific verification, review, and release evidence. Keep unaffected artifacts explicitly: filenames never prove freshness. The controller computes this closure.

**Re-run prompt:** `.agents/reference/revision-prompt.md`.
