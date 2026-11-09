# Rule 12 — Check the Policies First (auto-loaded)

Defaults and habit are not policy. On 2026-11-09 a Shoopa run dispatched its Copywriter on a model chosen from habit, and was about to dispatch its builders the same way, instead of the worker tier the Role model policy names. The policy was in `AGENTS.md` all along; nobody read it before choosing. This rule makes the lookup a step, not a hope.

---

## Before you dispatch, choose, or start a task

Read the sections of `AGENTS.md` that govern the decision. List headings first, then read only the sections you need (see the context budget in the handoff rules). Do this before each of the following:

| You are about to | Check first |
|---|---|
| Dispatch a role or subagent | Role activation policy, Role model policy, `.agents/models.json` |
| Choose a model, tier, or provider for any task | Role model policy and `.agents/models.json` for your client. Never type a model name from memory |
| Hand bulk, scoped work to a worker | Worker routing and metrics, then `orchestrator_capabilities` where the client has it |
| Decide a lane (fast or full) | Fast lane for small fixes |
| Enable or skip Copywriter, SEO, or any opt-in role | Role activation policy |
| Quote a cost, estimate, or actual | Cost reporting policy |
| Skip, merge, or reuse a gate | Revision loop, factory-loop skill, rule 02 |

If the client can read the policy, it reads it. If the policy names a tier, provider, or lane, use it. Do not substitute silently. If the named tier or provider is unavailable, say so and ask; never fall back on your own.

## Record the check

In the handoff or run notes, write one line per dispatch: the policy section read, the tier and model it gave, and the model actually used. A mismatch needs a stated reason and a user decision. A missing line means the check did not happen.

## When the policy is silent or unclear

Say so. Pick the more conservative option (the stronger gate, the narrower scope), record that you chose it, and flag the gap as an improvement proposal for the policy. Do not invent a policy and do not change `AGENTS.md` inside a run.

## Order of authority

The user's explicit request for the current task, then the target repository's rules, then `AGENTS.md` and these rules, then your own judgment. Say which one you followed when they differ.
