#!/usr/bin/env node
// Claude Code PreToolUse hook for the Agent tool.
// Warns, never blocks, when a subagent starts implementation work on the lead
// model instead of the worker tier (DeepSeek Flash via T3 delegate_task).
// Reads the hook JSON from stdin and always exits 0.
import { fileURLToPath } from 'node:url';

// Escalation ladder, most specific first. Counts are per distinct category so
// one repeated word cannot outvote the kind of task.
const IMPLEMENTATION_PATTERNS = [
  /\bimplement(?:s|ed|ing|ation|ations)?\b/,
  /\bwrit(?:e|es|ing|ten)\s+(?:the\s+|some\s+|a\s+)?code\b/,
  /\bfix(?:es|ed|ing)?\b/,
  /\brefactor(?:s|ed|ing)?\b/,
  /\badd(?:s|ed|ing)?\s+(?:a\s+|the\s+|new\s+)?feature/,
  /\bwir(?:e|es|ed|ing)\b/,
  /\bpatch(?:es|ed|ing)?\b/,
  /\bbuild\s+the\b/,
];

const ADVISOR_PATTERNS = [
  /\bdesign(?:s|ed|ing|er)?\b/,
  /\breview(?:s|ed|ing|er)?\b/,
  /\bqa\b/,
  /\bsecurity\b/,
  /\baudit(?:s|ed|ing)?\b/,
  /\badvis(?:e|es|ed|ing|or|ory)\b/,
  /\bconsult(?:s|ed|ing|ation)?\b/,
  /\bexplor(?:e|es|ed|ing|ation)\b/,
  /\bsearch(?:es|ed|ing)?\b/,
];

const countMatches = (text, patterns) =>
  patterns.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0);

// "implementation" when the task reads mainly as implementation, "advisor" when
// it reads mainly as advisory work, "other" when it matches neither. A tie goes
// to advisory: a warning is a nudge, so ambiguous tasks stay silent.
export function classify(text) {
  const value = typeof text === 'string' ? text.toLowerCase() : '';
  if (!value.trim()) return 'other';
  const implementation = countMatches(value, IMPLEMENTATION_PATTERNS);
  const advisor = countMatches(value, ADVISOR_PATTERNS);
  if (implementation === 0) return advisor > 0 ? 'advisor' : 'other';
  if (implementation > advisor) return 'implementation';
  return advisor > 0 ? 'advisor' : 'other';
}

// An omitted model inherits the lead model, so it counts as lead tier.
export function isLeadTierModel(model) {
  if (model === undefined || model === null || model === '') return true;
  const value = String(model).toLowerCase();
  if (value === 'inherit' || value === 'default') return true;
  return value.includes('sonnet') || value.includes('opus');
}

export function shouldWarn(hook) {
  if (!hook || typeof hook !== 'object' || hook.tool_name !== 'Agent') return false;
  const input = hook.tool_input && typeof hook.tool_input === 'object' ? hook.tool_input : {};
  if (!isLeadTierModel(input.model)) return false;
  const text = [input.description, input.prompt].filter((part) => typeof part === 'string').join('\n');
  return classify(text) === 'implementation';
}

export const REMINDER =
  'Implementation work belongs to the worker tier (DeepSeek V4.1 Flash), not the lead. '
  + 'Call orchestrator_capabilities once, then dispatch via delegate_task with provider opencode, '
  + 'model opencode-go/deepseek-v4.1-flash and variant high, giving goal, files in scope, acceptance '
  + 'checks and what not to touch; then review the diff yourself. Escalate only after one failed Flash '
  + 'rewrite: send exactly one specific rewrite to Flash, then fix it on the lead tier (Sonnet), and '
  + 'consult the advisor (Opus) only if the lead fix also fails. Record each escalation, its reason and '
  + 'the tally (worker_tasks, rewrites, self_fixes, advisor_calls) in metrics.md. See '
  + '.agents/skills/dispatch-worker/SKILL.md.';

export function warning() {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: REMINDER,
    },
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const raw = await readStdin();
    let hook = null;
    try {
      hook = JSON.parse(raw);
    } catch {
      hook = null;
    }
    if (shouldWarn(hook)) process.stdout.write(`${JSON.stringify(warning())}\n`);
  } catch {
    // A hook must never break the tool call it observes.
  }
  process.exit(0);
}
