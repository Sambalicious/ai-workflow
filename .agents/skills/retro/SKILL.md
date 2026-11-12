---
name: retro
description: "Run a retrospective on a coding session and propose environment improvements, most severe first: navigation pointers, automated checks, coding rules, AGENTS.md size, tool economy, information access."
---

The user has asked for a **retrospective**. You are auditing the coding agent's
**environment** - the files and checks that steer it - to improve future runs. You
propose; you do not apply anything until the user picks candidates.

## Steps

1. Read `.agents/skills/writing-for-agents/SKILL.md` for the writing style each
   proposal follows.

2. Read the primary sources for the session the user names: the conversation, the
   run root (`RUN_ROOT/reports`, `RUN_ROOT/logs`, or the feature folder) and the commits
   and diff it produced. Default to the current session when none is named. Judge
   what actually happened, not what the agent said happened.

3. Look for candidates in these categories. Each candidate needs evidence from step
   2, with a file, line, command, or transcript moment. Drop anything you cannot
   point at.

- **Navigation**: how easily did the agent find the right files? Look for hidden
  dependencies between files, a doc with no pointer from `AGENTS.md`, a feature folder
  with no `CURRENT.md` digest, or a `CONTEXT.md` that omits a term the session had to
  invent. _Use when_ the session took a long time to find one piece of information.
- **Automated checks**: read the repo's own checks first - its `package.json`
  scripts, its CI workflow, its pre-commit hooks, and in a factory install
  `npm run agents:check`, `npm run agents:boundary`, and the skills tests. A check
  that already exists but sits unwired or silently broken is the finding, not a
  reason to write a new one. A repo with no guardrail running its lint, typecheck,
  and tests is itself a finding. _Use when_ the agent made a mistake a check could
  have caught, or no guardrail exists at all.
- **Coding standards**: classify the violation before proposing a fix. A
  **mechanical** violation - a fixed syntactic pattern, a banned API, an import
  shape, a file-location rule - gets a deterministic check: a lint rule, a hook, or
  a CI job, whichever is cheapest in this repo. Reserve `.agents/rules/` and
  `AGENTS.md` for genuine **judgement calls** no check can encode. Default to
  building the check over writing the rule. _Use when_ a reviewer failed to catch a
  mistake.
- **Global `AGENTS.md` size**: steering instructions that grew into procedure belong
  in `.agents/rules/`, a skill, or a check. `AGENTS.md` should mostly carry
  **navigation pointers**. Also flag lines that duplicate a role file or a skill.
  _Use when_ `AGENTS.md` is large in the repo or in the user's global scope.
- **Tool economy**: expensive tool calls that a script, a narrower command, or a
  custom CLI or MCP server would replace. _Use when_ one call consumed a lot of
  context or time.
- **No-ops**: instructions in steering files that changed no behaviour this session.
  _Use when_ the steering files are large and unwieldy.
- **Information access**: information the agent could not reach - dev-server logs,
  read-only access to a third-party service, an artifact written outside the run
  root. _Use when_ a crucial fact was unavailable rather than missed.

4. Present the candidates most severe first. For each one give the evidence, the
   category, the proposed change, and whether it is a check, a rule, or a pointer.
   Say which ones you would drop if the user wants only the top few.

5. Ask which candidates to implement, then implement only those. Treat the target
   repository's architecture, contract, auth, and security rules as out of scope
   unless the user names them.

## Reference

### Implementation versus review

All work runs in two stages. The implementation agent carries the most **context
pressure**: exploration, writing code, debugging failures. The review agent carries
the least, because it receives a diff. Impose standards on the review agent, not the
implementation agent, wherever the repo has both.

### Environment files

- `AGENTS.md`: pushed into the context window of every agent working in the repo.
  Spend it on **navigation pointers** and on rules with no better home, not on
  procedure a skill can hold.
- `.agents/rules/`: the repo's binding rules. One concern per file, named for the
  behaviour it forces.
- `.agents/skills/<name>/SKILL.md`: the description enters context; the body loads
  on demand. Put procedure here, not in `AGENTS.md`.
- `.agents/reference/`: pipeline, output layout, and resume material reached from
  `AGENTS.md`.
- A project doc such as `CONTEXT.md` or `DESIGN.md`: a reference file reached through
  a pointer. Look for an existing doc before proposing a new one.

### Where the session lives

Read the transcript, not a reconstruction of it.

- OpenCode: `~/.local/share/opencode/` holds `opencode.db` (sessions and messages),
  plus `log/` and `tool-output/` with the raw tool results.
- Claude Code: `~/.claude/projects/<project-path-with-dashes>/<session-id>.jsonl`.
- Kilo: the client's session directory under its application-data folder.
- Installed runs: `RUN_ROOT/logs/` and `RUN_ROOT/reports/` hold what the run wrote;
  git history holds the rest.

If the transcript is unreachable, say so, audit from the run root and git instead,
and label the output as artifact-based.

### Output

End with a **TL;DR** section listing the recommended candidates in order, one line
each, and state that nothing was applied until the user chose.
