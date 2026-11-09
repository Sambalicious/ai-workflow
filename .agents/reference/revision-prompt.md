# Re-run from step X prompt

Use this prompt when a stage flags blockers. Revision rules are in AGENTS.md Revision loop.

```
Continue EPIC-XXXX. A pipeline stage flagged blockers. Resolve each and re-run from the earliest affected step, preserving this run's enabled roles and required gates.

Blockers:
- BLOCKER[agent-name]: [description]

Revision round: [N of 3]

Steps:
1. Route each blocker to its enabled owner with its description and original output.
   If its owner is disabled, report the conflict for a user decision.
   Save revised output as [file].rN.md.
2. Re-run affected enabled consumers in dependency order, including mandatory QA,
   Security, and fresh independent review for changed candidates.
   Save each as [file].rN.md.
3. Only if enabled, re-run Release Manager with the latest enabled outputs.
   Save as release-report.rN.md only when it runs.
4. Report verification and blockers, or the release verdict when assessed.
```
