# Agent models and dispatch

Role tiering is generated from `.agents/models.json`. That file assigns every role to a tier
(`lead`, `advisor`, `swarm`, `worker`) and every client to one model per tier. Do not retype a
model name from memory: resolve it.

```sh
pnpm agents:model qa-gate          # anthropic/claude-sonnet-5-5
pnpm agents:model api-contract     # anthropic/claude-opus-5-5
pnpm agents:model worker           # opencode-go/deepseek-v4.1-flash
pnpm agents:model qa-gate --client claude-code
pnpm agents:model --json security-review
```

The script exits 1 and prints what is known when the role, the tier or the client's model is
missing. A non-zero exit means the run stops until the mapping or the provider is fixed.

## Dispatch rule

A role subagent inherits the session model when the dispatch does not name one. That is how a
lead-tier role silently runs on the cheap tier and produces specs nobody reviewed. Therefore:

1. Resolve the model with `pnpm agents:model <role>` before dispatching.
2. Pass it explicitly in the dispatch. A dispatch without a model is a protocol error, not a
   default.
3. Check the model resolves in the client (it must appear in the provider list). If it does not,
   stop the run and report it. Never substitute a tier quietly; a recorded substitution is the
   only acceptable fallback, and only after the owner agrees.
4. Write the dispatch in the run's ledger before the agent starts.

## Dispatch ledger

Every run keeps a ledger in its run folder, one row per dispatch, so drift is visible in the diff
rather than in a post-mortem.

| Round | Role | Tier | Model | Artifact | State |
|---|---|---|---|---|---|
| 1 | product-manager | lead | anthropic/claude-sonnet-5-5 | `prd.md` | done |
| 1 | api-contract | advisor | anthropic/claude-opus-5-5 | `api-contract.md` | done |
| 2 | security-review | advisor | anthropic/claude-opus-5-5 | `security-review.md` | running |
| 2 | backend-engineer (bulk) | worker | opencode-go/deepseek-v4.1-flash | `outreach.repository.ts` | running |

## Local provider setup

Anthropic models are served by the local CLIProxyAPI pool, not by an API key in this repo:

- proxy: `http://127.0.0.1:8317`, config `/opt/homebrew/etc/cliproxyapi.conf`
- provider block: `~/.config/opencode/opencode.json`, key `provider.anthropic`, `baseURL`
  `http://127.0.0.1:8317/v1`
- health check: a one-token `POST /v1/messages` with `x-api-key` from the proxy config and
  `anthropic-version: 2023-06-01`, expecting a reply, not a 401 or a spend-limit error

If the proxy is down, the lead and advisor tiers are unavailable. Record that and stop; do not
silently downgrade a role. `opencode-go/deepseek-v4.1-flash` remains available for `swarm` and
`worker`.
