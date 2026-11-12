# Review brief: spec-writer role

Status: **blocked on the Claude rate window.** Two dispatches failed before the model
executed. Retry this brief unchanged when the window reopens.

## Target

- Provider: `claudeProxy` (native Claude driver). The `opencode` proxy route failed with
  `interrupted` and `executedModel: null`; do not retry that one first.
- Model: `claude-opus-5-5`, advisor tier per `.agents/models.json`.
- Options: `effort: medium`, per the cost discipline rule. Do not raise it without naming
  the reason.
- Isolation: shared, read-only. The reviewer must not edit the repo.

## Brief

> You are reviewing a proposed replacement for a spec-authoring role in a multi-agent
> software factory. Read-only: do not edit any file.
>
> Repo: /Users/sambalicious/Desktop/codes/ai-team
>
> Read these, in this order:
> 1. `docs/proposals/gherkin-to-spec/README.md` (the proposal and staged plan)
> 2. `docs/proposals/gherkin-to-spec/spec-writer.md` (the role file under review)
> 3. `docs/proposals/gherkin-to-spec/COMPARISON.md` and
>    `example/EPIC-0005/S07-accurate-answers-escalation.md`,
>    `example/EPIC-0005/S05-payment-confirmation.md`,
>    `example/EPIC-0005/gherkin-baseline/S07-accurate-answers-escalation.feature`
> 4. `docs/proposals/gherkin-to-spec/spec-check.mjs` (the closure checker)
> 5. `.agents/gherkin.md` (the role being replaced) and the Gherkin-related parts of
>    `.agents/qa.md` and `AGENTS.md` steps [2], [4], [5e]
>
> Answer one question, adversarially: if a competent but literal-minded agent follows
> spec-writer.md today, with a PRD as input, will it produce the sad-path and validation
> coverage the current Gherkin writer produces? The Gherkin writer's forcing functions are
> the eight named path types, Scenario Outline for combinatorics, and the rule that every
> Given sets state and every When is one action.
>
> Look specifically for:
> - Places where the table format lets a writer under-enumerate without noticing (one long
>   Action cell, several outcomes in one Expected cell, a rule that reads testable but is not).
> - Whether the eight path types survive as an obligation or become a suggestion, and
>   whether anything enforces the Coverage claim.
> - What `spec-check.mjs` cannot catch, and whether those gaps matter more or less than the
>   ones it does catch.
> - Ambiguity that two writers would resolve differently, producing incomparable specs
>   across epics.
> - Whether the ID spine still works for QA's convention of scenario IDs in test names and
>   the contract's responsibility map.
> - Anything in the staged plan that lets a bad role file ship and propagate before it is
>   caught.
>
> Output, in this order:
> 1. Verdict: APPROVE, APPROVE WITH CHANGES, or REJECT.
> 2. Blocking issues, each with file and line, what breaks, and the smallest fix.
> 3. Non-blocking improvements, ranked, with why each matters.
> 4. If changes are material, a complete replacement for `spec-writer.md` in one fenced
>    block that can be applied verbatim.
> 5. What to test in the stage-1 comparison to catch a coverage regression the proposal
>    does not already test.
>
> Be concrete. Do not restate the proposal. If the whole idea is wrong, say so plainly and
> give the strongest counter-argument.

## Dispatch log

| # | Target | Result | Detail |
|---|---|---|---|
| 1 | `opencode` / `anthropic/claude-opus-5-5`, variant high | interrupted | `executedModel: null`, no output |
| 2 | `claudeProxy` / `claude-opus-5-5`, effort medium | failed | `Claude API rate limit reached. Try again later.` |

Two attempts, then stop. A closed rate window is not a retry loop; resume when it reopens.

## On success

1. If the verdict is APPROVE, stage 1 proceeds unchanged.
2. If APPROVE WITH CHANGES, apply the blocking fixes and any replacement role file, re-run
   `node docs/proposals/gherkin-to-spec/spec-check.mjs example/EPIC-0005/*.md`, and record
   what changed in `README.md` under Decisions.
3. If REJECT, stop and report the counter-argument. Do not implement stage 1.
4. Stage 1 itself: `.agents/spec-writer.md`, `specs/` beside `gherkin/` in
   `output-files.md`, the checker as a real test, one epic authored both ways.
