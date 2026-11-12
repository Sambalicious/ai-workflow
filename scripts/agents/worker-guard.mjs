#!/usr/bin/env node
// Claude Code PreToolUse hook for the Agent tool.
// Blocks when a subagent starts implementation work on a lead model instead of the
// worker tier, and warns only when EVE_ALLOW_LEAD=1 is set for a deliberate override.
// Reads the hook JSON from stdin; exit 2 blocks the tool call and shows stderr.
import { realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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

export const BLOCK_STDERR_PREFIX =
  'Blocked: authoring is worker tier. ';

export const REMINDER =
  'Implementation work belongs to the worker tier (DeepSeek V4.1 Flash), not the lead. '
  + 'Call orchestrator_capabilities once, then dispatch via delegate_task with provider opencode, '
  + 'model opencode-go/deepseek-v4.1-flash and variant high, giving goal, files in scope, acceptance '
  + 'checks and what not to touch; then review the diff yourself. Escalate only after one failed Flash '
  + 'rewrite: send exactly one specific rewrite to Flash, then fix it on the lead tier (Sonnet), and '
  + 'consult the advisor (Opus) only if the lead fix also fails. Record each escalation, its reason and '
  + 'the tally (worker_tasks, rewrites, self_fixes, advisor_calls) in metrics.md. See '
  + '.agents/skills/dispatch-worker/SKILL.md.';

/**
 * Paths a worker must never change, from `AGENTS.md` "Worker routing and metrics": contract,
 * architecture, auth, RLS, secrets and truth-guard design belong to the lead or the advisor. The
 * model-choice hook warns; this list is checked against a real diff, so the boundary holds even when
 * the agent doing the work is the one that forgot it.
 */
const FORBIDDEN_PATHS = [
  { reason: 'contract', pattern: /^packages\/contracts\// },
  { reason: 'contract', pattern: /(^|\/)application-board\.ts$/ },
  { reason: 'rls', pattern: /^apps\/api\/src\/db\// },
  { reason: 'auth', pattern: /(^|\/)auth\// },
  { reason: 'secrets', pattern: /(^|\/)\.env(\.|$)/ },
  { reason: 'architecture', pattern: /^features\/.*\/architecture[^/]*\.md$/ },
  { reason: 'truth-guard', pattern: /(^|\/)claim-check\.ts$/ },
  { reason: 'truth-guard', pattern: /(^|\/)document-claims\.ts$/ },
  { reason: 'truth-guard', pattern: /(^|\/)blocked-claim\.ts$/ },
  { reason: 'truth-guard', pattern: /(^|\/)company-direction\.ts$/ },
  { reason: 'truth-guard', pattern: /(^|\/)contact-detail\.ts$/ },
  { reason: 'truth-guard', pattern: /(^|\/)letter-keyword-cap\.ts$/ },
];

/** The reason this path is off limits to a worker, or null when the worker may change it. */
export function classifyPath(path) {
  const value = String(path).replace(/^\.\//, '');
  const hit = FORBIDDEN_PATHS.find((entry) => entry.pattern.test(value));
  return hit ? hit.reason : null;
}

/** Every forbidden path in `paths`, with its reason, in the order given. */
export function forbiddenPaths(paths) {
  return [...paths]
    .map((path) => ({ path, reason: classifyPath(path) }))
    .filter((entry) => entry.reason !== null);
}

/** One line per finding, for a reviewer to paste into a handoff. */
export function boundaryReport(paths) {
  const findings = forbiddenPaths(paths);
  if (findings.length === 0) return 'Worker boundary: clear.';
  return [
    'Worker boundary: these files belong to the lead or the advisor, not the worker:',
    ...findings.map((finding) => `  ${finding.path} (${finding.reason})`),
  ].join('\n');
}

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

function gitPaths(base) {
  const run = (args) => {
    const result = spawnSync('git', args, { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
    return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  };
  // Untracked files count: a worker's new file is exactly how a forbidden path usually appears.
  return [...new Set([...run(['diff', '--name-only', base]), ...run(['ls-files', '--others', '--exclude-standard'])])];
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  // Check a real diff against the worker boundary, before a worker result is accepted.
  const baseArgument = process.argv.indexOf('--base');
  if (baseArgument !== -1) {
    const base = process.argv[baseArgument + 1];
    if (!base) {
      console.error('usage: node scripts/agents/worker-guard.mjs --base <git ref>');
      process.exit(2);
    }
    const report = boundaryReport(gitPaths(base));
    console.log(report);
    process.exit(report.startsWith('Worker boundary: clear.') ? 0 : 1);
  }
  // Same, for a list of paths on stdin (one per line).
  if (process.argv.includes('--paths')) {
    const report = boundaryReport((await readStdin()).split('\n').map((line) => line.trim()).filter(Boolean));
    console.log(report);
    process.exit(report.startsWith('Worker boundary: clear.') ? 0 : 1);
  }
  try {
    const raw = await readStdin();
    let hook = null;
    try {
      hook = JSON.parse(raw);
    } catch {
      hook = null;
    }
    if (shouldWarn(hook)) {
      if (process.env.EVE_ALLOW_LEAD === '1') {
        process.stdout.write(`${JSON.stringify(warning())}\n`);
      } else {
        process.stderr.write(`${BLOCK_STDERR_PREFIX}${REMINDER}\nSet EVE_ALLOW_LEAD=1 for a deliberate override.\n`);
        process.exit(2);
      }
    }
  } catch {
    // A hook must never break the tool call it observes, beyond the block above.
  }
  process.exit(0);
}
