---
name: company-brain
description: "Build or extend a small company brain around one recurring workflow: a map of where truth lives, one policy, one worker, a correction log, and replay tests scored against git history. Use when asked for a company brain, an agent knowledge base, or a repeatable worker for a team workflow."
---

# Company brain

Build the smallest brain that lets an agent do one recurring workflow well. Do not
ingest the company. Every file must earn its place by serving that workflow.

## Rules

- One workflow per worker. Add a second workflow only after the first worker passes
  its replay tests.
- The map points to sources. It never copies facts, because copied facts become a
  second source of truth and drift.
- The product owner (or the named decision owner) approves every brain file, product
  fact, and decision. Agents draft. Humans commit.
- Agent output is never authoritative until a human confirms it at the top of the
  source hierarchy.
- The brain never overrides the target project's `AGENTS.md` or governance rules.
- Keep the brain in the target project (`PROJECT_ROOT/brain/`). The factory checkout
  stays read-only.

## Inputs

Ask with a structured question for anything you cannot verify from the repository:

1. The company, customer, offer, and current priorities, in the owner's words.
2. The one recurring workflow, and what a strong completed result looks like.
3. Who decides, and who approves brain changes.
4. Where decisions first happen (chat, calls, messaging, tracker, git).
5. Whether known drift is fixed now or kept as test targets.

Do not infer the company's identity from a pilot cohort, test fixtures, or one
document. Ask, then record the answer.

## Procedure

1. Read the repository's product context, decision records, and governance. Use git
   history to find how often the workflow happens and where it has gone wrong. Cite
   commits and file lines.
2. Ask the inputs above in one structured question round.
3. Create `brain/` from the templates in this folder: `README.md` (purpose, file
   reasons, source hierarchy, approval), `MAP.md`, `policies/<workflow>.md`,
   `workers/<workflow>.md`, `corrections.md`, `tests/README.md`. Fill every bracket
   with verified facts. Delete rows that do not apply.
4. Log each correction the owner gave during intake, and each verified drift, in
   `corrections.md` with file and line evidence.
5. Write replay tests. Each test starts at the commit before a real past instance of
   the workflow, gives the worker only what the human had, and uses that instance's
   commit as the answer key. Pick one recent instance and one where history shows a miss.
   Add an ID-collision test in a standalone throwaway repository.
6. Run test 1 in an isolated worktree at the base commit. Use a fresh agent with no
   conversation context. Copy in only `brain/` without `tests/`. Withhold git history
   and later refs.
7. Score test 1 against the answer key, then have a fresh reviewer re-score it from the
   saved packet and diff. Save the packet, the diff, and both scores under
   `tests/results/`. Log each weakness in `corrections.md`.
8. Stop. Do not commit. Report the files, the score, and the open corrections.

## Templates

- [templates/README.md](templates/README.md)
- [templates/MAP.md](templates/MAP.md)
- [templates/policy.md](templates/policy.md)
- [templates/worker.md](templates/worker.md)
- [templates/corrections.md](templates/corrections.md)
- [templates/tests.md](templates/tests.md)

## Stopping conditions

- Missing owner answers for the company, workflow, or approver: stop and ask.
- A source conflicts with the owner's statement: record the conflict in
  `corrections.md`. Do not reconcile it silently.
- The workflow requires code, tests, or contract changes: the worker lists them for
  the target's implementation process and does not make them.
- Never commit, push, merge, or flip an approval marker.

## TL;DR

Ask the owner first. Then build five files and a test folder for one workflow. Point
to sources, never copy them. Replay a real past instance blind and score it against
its own commit. Route every correction to the file that owns the truth. Only a human
approves and commits.
