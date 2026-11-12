#!/usr/bin/env node
// Counts and caps the role dispatches in a run, before the next one starts.
// Usage:
//   node scripts/agents/ledger.mjs add --run <dir> --round <n> --role <r> --tier <t> --model <m> --artifact <a> [--state running|done|failed] [--force]
//     A lead or advisor dispatch needs a preflight receipt under 10 minutes old in <dir>
//     (preflight.mjs <role> --record <dir>); --force skips that check.
//   node scripts/agents/ledger.mjs check --run <dir> [--max-claude 8] [--max-concurrent 2]
//   node scripts/agents/ledger.mjs show --run <dir>
// Exit 1 when an entry is malformed or a cap would be exceeded.
import { realpathSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLAUDE_TIERS = new Set(['lead', 'advisor']);
export const FIELDS = ['round', 'role', 'tier', 'model', 'artifact', 'state'];
export const STATES = new Set(['running', 'done', 'failed']);

export function entryProblems(entry) {
  const problems = [];
  for (const field of FIELDS) {
    if (entry[field] === undefined || entry[field] === '') problems.push(`missing ${field}`);
  }
  if (entry.state !== undefined && !STATES.has(entry.state)) problems.push(`state must be one of ${[...STATES].join(', ')}`);
  if (entry.tier !== undefined && !['lead', 'advisor', 'swarm', 'worker'].includes(entry.tier)) problems.push('tier must be lead, advisor, swarm or worker');
  if (typeof entry.round === 'string' && !/^\d+$/.test(entry.round)) problems.push('round must be a number');
  return problems;
}

export function caps(entries, limits = {}) {
  const maxClaude = limits.maxClaude ?? 8;
  const maxConcurrent = limits.maxConcurrent ?? 2;
  const claude = entries.filter((entry) => CLAUDE_TIERS.has(entry.tier)).length;
  const concurrent = entries.filter((entry) => CLAUDE_TIERS.has(entry.tier) && entry.state === 'running').length;
  const byTier = entries.reduce((counts, entry) => ({ ...counts, [entry.tier]: (counts[entry.tier] ?? 0) + 1 }), {});
  return {
    total: entries.length,
    claude,
    concurrent,
    byTier,
    problems: [
      ...(claude > maxClaude ? [`${claude} Claude dispatches exceeds the cap of ${maxClaude}`] : []),
      ...(concurrent > maxConcurrent ? [`${concurrent} Claude agents running exceeds the cap of ${maxConcurrent}`] : []),
    ],
  };
}

export function parseLedger(text) {
  const entries = [];
  const problems = [];
  for (const [index, line] of text.split('\n').entries()) {
    if (line.trim() === '') continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      problems.push(`line ${index + 1}: not JSON`);
      continue;
    }
    const found = entryProblems(entry);
    if (found.length > 0) problems.push(`line ${index + 1}: ${found.join(', ')}`);
    entries.push(entry);
  }
  return { entries, problems };
}

const ledgerPath = (run) => join(run, 'dispatch-ledger.jsonl');

async function readLedger(run) {
  try {
    return await readFile(ledgerPath(run), 'utf8');
  } catch {
    return '';
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [command, ...rest] = process.argv.slice(2);
  const args = [...rest];
  const flag = (name) => {
    const at = args.indexOf(name);
    if (at === -1) return null;
    const value = args[at + 1];
    args.splice(at, value === undefined ? 1 : 2);
    return value ?? '';
  };
  const run = flag('--run');
  const maxClaude = Number(flag('--max-claude') ?? 8);
  const maxConcurrent = Number(flag('--max-concurrent') ?? 2);
  if (!run || !['add', 'check', 'show'].includes(command)) {
    process.stderr.write('usage: node scripts/agents/ledger.mjs <add|check|show> --run <dir> [flags]\n');
    process.exit(1);
  }
  const { entries, problems } = parseLedger(await readLedger(run));
  if (command === 'show') {
    for (const entry of entries) process.stdout.write(`${entry.round} | ${entry.role} | ${entry.tier} | ${entry.model} | ${entry.artifact} | ${entry.state}\n`);
    process.exit(problems.length === 0 ? 0 : 1);
  }
  if (command === 'check') {
    const summary = caps(entries, { maxClaude, maxConcurrent });
    const all = [...problems, ...summary.problems];
    process.stdout.write(`total ${summary.total}, Claude ${summary.claude}, running ${summary.concurrent}, tiers ${JSON.stringify(summary.byTier)}\n`);
    for (const problem of all) process.stderr.write(`ledger: ${problem}\n`);
    process.exit(all.length === 0 ? 0 : 1);
  }
  const role = flag('--role');
  const tier = flag('--tier');
  const force = args.includes('--force');
  if (!force && CLAUDE_TIERS.has(tier)) {
    try {
      const receipt = JSON.parse(await readFile(join(run, `.preflight-${role}.json`), 'utf8'));
      const age = Date.now() - Date.parse(receipt.at);
      if (!(age >= 0 && age < 10 * 60 * 1000)) throw new Error('stale');
    } catch {
      process.stderr.write(
        `ledger: no fresh preflight receipt for ${role}. Run "node scripts/agents/preflight.mjs ${role} --record ${run}" first, or pass --force.\n`,
      );
      process.exit(1);
    }
  }
  const entry = {
    round: flag('--round'),
    role,
    tier,
    model: flag('--model'),
    artifact: flag('--artifact'),
    state: flag('--state') ?? 'running',
    at: new Date().toISOString(),
  };
  const found = entryProblems(entry);
  const summary = caps([...entries, entry], { maxClaude, maxConcurrent });
  const all = [...found, ...summary.problems];
  if (all.length > 0) {
    for (const problem of all) process.stderr.write(`ledger: ${problem}\n`);
    process.exit(1);
  }
  await appendFile(ledgerPath(run), `${JSON.stringify(entry)}\n`);
  process.stdout.write(`added: ${entry.role} on ${entry.model} (${entry.tier})\n`);
}
