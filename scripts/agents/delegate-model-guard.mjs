#!/usr/bin/env node
// PreToolUse hook for the T3 `delegate_task` tool (matcher: mcp__t3-code__delegate_task).
// Enforces the model routing policy in AGENTS.md: implementation and test workers run on the
// worker tier (DeepSeek V4.1 Flash), Sonnet is the lead tier, and only design, review and research
// roles may use Opus or Fable. Anything else is blocked. Exit 2 blocks the call and shows stderr.
// Set EVE_ALLOW_LEAD=1 for a deliberate, user-approved override.

const WORKER = { provider: 'opencode', model: 'opencode-go/deepseek-v4.1-flash' };
const CLAUDE_PROVIDERS = new Set(['claudeAgent', 'claudeProxy']);
// Sonnet is the lead tier: orchestration, review of diffs and the single escalation fix after a failed
// Flash rewrite, so it may take any role. Opus is the advisor and Fable is the rare top tier; both are
// limited to design, review and research.
const LEAD_MODEL = 'claude-sonnet-5-5';
const ADVISOR_MODELS = new Set(['claude-opus-5-5', 'claude-fable-5-2']);
const ADVISOR_ROLES = new Set(['design', 'review', 'research']);

/** The reason the call breaks policy, or null when it complies. */
export function violation(input) {
  const target = input && typeof input.target === 'object' && input.target !== null ? input.target : {};
  const provider = target.providerInstanceId ?? '';
  const model = String(target.model ?? '');
  const role = typeof input?.role === 'string' ? input.role : 'general';
  if (provider === WORKER.provider && model === WORKER.model) return null;
  if (CLAUDE_PROVIDERS.has(provider) && model === LEAD_MODEL) return null;
  if (CLAUDE_PROVIDERS.has(provider) && ADVISOR_MODELS.has(model)) {
    if (ADVISOR_ROLES.has(role)) return null;
    return `role "${role}" is implementation or general work; ${model} is advisor tier (design, review, research only)`;
  }
  const given = provider || model ? `${provider || '(inherited provider)'} / ${model || '(inherited model)'}` : 'no target (inherits the lead model)';
  return `${given} is not an approved target`;
}

export const MESSAGE = (reason) =>
  `Blocked by AGENTS.md model routing: ${reason}. Implementation and tests go to provider opencode, model ` +
  `${WORKER.model}, variant high. Sonnet is the lead tier; Opus (and rarely Fable) may take design, review and research. ` +
  'Ask the user before using any other model.';

async function main() {
  if (process.env.EVE_ALLOW_LEAD === '1') return 0;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let hook;
  try {
    hook = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return 0;
  }
  const reason = violation(hook?.tool_input);
  if (reason === null) return 0;
  process.stderr.write(`${MESSAGE(reason)}\n`);
  return 2;
}

import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
