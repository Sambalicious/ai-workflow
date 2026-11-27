#!/usr/bin/env node
// Counts and caps the role dispatches in a run, before the next one starts.
// Usage:
//   node scripts/agents/ledger.mjs add --run <dir|feature> --round <n> --role <r> --tier <t> --model <m> --artifact <a> [--state running|done|failed] [--force]
//     A lead or advisor dispatch needs a preflight receipt under 10 minutes old in the run
//     (preflight.mjs <role> --record <run>); --force skips that check and records the entry
//     with "forced": true, so a bypass stays visible in the ledger.
//     <run> is an existing directory, or a feature id that resolves under features/active/
//     (RUN_ROOT in an external run). It never creates the directory.
//   node scripts/agents/ledger.mjs check --run <dir> [--max-claude 40] [--max-concurrent 2] [--max-concurrent-advisor 1]
//   node scripts/agents/ledger.mjs show --run <dir>
//   node scripts/agents/ledger.mjs done --run <dir> --role <r> [--state done|failed]   closes that role's running entries
//   node scripts/agents/ledger.mjs fail --run <dir> --role <r> --reason <reason>       closes them as failed for a cause,
//     such as rate_limit after a 429
// Exit 1 when an entry is malformed or a hard cap (concurrency) would be exceeded. The
// lifetime Claude budget warns instead of refusing: a long run is reviewed, not blocked
// mid-flight after its plan was approved.
import { realpathSync } from 'node:fs';
import { appendFile, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRun } from './run-path.mjs';

export const CLAUDE_TIERS = new Set(['lead', 'advisor']);
export const FIELDS = ['round', 'role', 'tier', 'model', 'artifact', 'state'];
export const STATES = new Set(['running', 'done', 'failed']);
// A lifetime budget for recorded Claude dispatches. It is large on purpose: a run that
// crosses it is worth a look, but stopping an approved run on a count refused five
// legitimate dispatches in one run. Concurrency is the hard cap, because that is what
// costs money at the same time.
export const CLAUDE_BUDGET = 40;

export function entryProblems(entry) {
  const problems = [];
  for (const field of FIELDS) {
    if (entry[field] === undefined || entry[field] === '') problems.push(`missing ${field}`);
  }
  if (entry.state !== undefined && !STATES.has(entry.state)) problems.push(`state must be one of ${[...STATES].join(', ')}`);
  if (entry.tier !== undefined && !['lead', 'advisor', 'swarm', 'worker'].includes(entry.tier)) problems.push('tier must be lead, advisor, swarm or worker');
  if (typeof entry.round === 'string' && !/^\d+$/.test(entry.round)) problems.push('round must be a number');
  if (entry.forced !== undefined && typeof entry.forced !== 'boolean') problems.push('forced must be true or false');
  if (entry.reason !== undefined && (typeof entry.reason !== 'string' || entry.reason === '')) problems.push('reason must be a non-empty string');
  return problems;
}

export function caps(entries, limits = {}) {
  const maxClaude = limits.maxClaude ?? CLAUDE_BUDGET;
  const maxConcurrent = limits.maxConcurrent ?? 2;
  const maxAdvisorConcurrent = limits.maxAdvisorConcurrent ?? 1;
  // A retry of the same role on the same artifact replaces its earlier attempt: the budget
  // counts distinct dispatches, so a rerun or a repair wave does not trip it.
  const claude = new Set(entries.filter((entry) => CLAUDE_TIERS.has(entry.tier)).map((entry) => `${entry.role}|${entry.artifact}`)).size;
  const running = entries.filter((entry) => CLAUDE_TIERS.has(entry.tier) && entry.state === 'running');
  const concurrent = running.length;
  // One advisor session at a time: the gates on that tier serialize rather than
  // parallelize (AGENTS.md, Role model policy), and this is what makes the rule a
  // check instead of a convention. It counts every advisor role, consults included.
  const advisorConcurrent = running.filter((entry) => entry.tier === 'advisor').length;
  const byTier = entries.reduce((counts, entry) => ({ ...counts, [entry.tier]: (counts[entry.tier] ?? 0) + 1 }), {});
  return {
    total: entries.length,
    claude,
    concurrent,
    advisorConcurrent,
    byTier,
    problems: [
      ...(concurrent > maxConcurrent ? [`${concurrent} Claude agents running exceeds the cap of ${maxConcurrent}`] : []),
      ...(advisorConcurrent > maxAdvisorConcurrent
        ? [`${advisorConcurrent} advisor agents running exceeds the cap of ${maxAdvisorConcurrent}; the advisor-tier gates serialize`]
        : []),
    ],
    warnings: [
      ...(claude > maxClaude
        ? [`${claude} Claude dispatches exceeds the lifetime budget of ${maxClaude}; review the run before dispatching more`]
        : []),
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

/** Closes every running entry of one role, so a 429 or a finished session frees its slot. */
export function closeEntries(entries, { role, state, reason }) {
  let closed = 0;
  const next = entries.map((entry) => {
    if (entry.role !== role || entry.state !== 'running') return entry;
    closed += 1;
    return { ...entry, state, ...(reason ? { reason } : {}) };
  });
  return { closed, next };
}

async function writeLedger(run, entries) {
  const temp = `${ledgerPath(run)}.${process.pid}.tmp`;
  await writeFile(temp, entries.map((entry) => `${JSON.stringify(entry)}\n`).join(''));
  await rename(temp, ledgerPath(run));
}

async function readLedger(run) {
  try {
    return await readFile(ledgerPath(run), 'utf8');
  } catch (error) {
    // Absent means a run with no dispatches yet; anything else means the caps cannot be trusted.
    if (error?.code === 'ENOENT') return '';
    throw new Error(`cannot read ${ledgerPath(run)}: ${error?.code ?? error?.message}`);
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
  const runInput = flag('--run');
  const maxClaude = Number(flag('--max-claude') ?? CLAUDE_BUDGET);
  const maxConcurrent = Number(flag('--max-concurrent') ?? 2);
  const maxAdvisorConcurrent = Number(flag('--max-concurrent-advisor') ?? 1);
  if (!runInput || !['add', 'check', 'show', 'done', 'fail'].includes(command)) {
    process.stderr.write('usage: node scripts/agents/ledger.mjs <add|check|show|done|fail> --run <dir|feature> [flags]\n');
    process.exit(1);
  }
  let run;
  try {
    run = (await resolveRun(runInput)).path;
  } catch (error) {
    process.stderr.write(`ledger: ${error.message}\n`);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = parseLedger(await readLedger(run));
  } catch (error) {
    process.stderr.write(`ledger: ${error.message}\n`);
    process.exit(1);
  }
  const { entries, problems } = parsed;
  if (command === 'done' || command === 'fail') {
    const role = flag('--role');
    const reason = flag('--reason');
    const state = command === 'fail' ? 'failed' : (flag('--state') ?? 'done');
    if (!role || !['done', 'failed'].includes(state) || (command === 'fail' && (!reason || !/^[a-z0-9][a-z0-9_-]*$/.test(reason)))) {
      process.stderr.write(
        command === 'fail'
          ? 'usage: node scripts/agents/ledger.mjs fail --run <dir> --role <r> --reason <reason>\n'
          : 'usage: node scripts/agents/ledger.mjs done --run <dir> --role <r> [--state done|failed]\n',
      );
      process.exit(1);
    }
    // A rewrite would drop a corrupt line, so refuse and name the file instead.
    if (problems.length > 0) {
      for (const problem of problems) process.stderr.write(`ledger: ${ledgerPath(run)} ${problem}\n`);
      process.exit(1);
    }
    const { closed, next } = closeEntries(entries, { role, state, reason });
    // A failure that closes nothing means the ledger disagrees with the run; name the role
    // instead of reporting a clean close that never happened.
    if (command === 'fail' && closed === 0) {
      process.stderr.write(`ledger: no running ${role} entry to fail; show the ledger and close the right role\n`);
      process.exit(1);
    }
    await writeLedger(run, next);
    process.stdout.write(`closed ${closed} ${role} entr${closed === 1 ? 'y' : 'ies'} as ${state}${reason ? ` (${reason})` : ''}\n`);
    process.exit(0);
  }
  if (command === 'show') {
    for (const entry of entries) {
      const marks = `${entry.forced ? ' (forced)' : ''}${entry.reason ? ` (${entry.reason})` : ''}`;
      process.stdout.write(`${entry.round} | ${entry.role} | ${entry.tier} | ${entry.model} | ${entry.artifact} | ${entry.state}${marks}\n`);
    }
    process.exit(problems.length === 0 ? 0 : 1);
  }
  if (command === 'check') {
    const summary = caps(entries, { maxClaude, maxConcurrent, maxAdvisorConcurrent });
    const all = [...problems.map((problem) => `${ledgerPath(run)} ${problem}`), ...summary.problems];
    process.stdout.write(`total ${summary.total}, Claude ${summary.claude}, running ${summary.concurrent}, advisor running ${summary.advisorConcurrent}, tiers ${JSON.stringify(summary.byTier)}\n`);
    for (const warning of summary.warnings) process.stderr.write(`ledger: warning: ${warning}\n`);
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
    ...(force ? { forced: true } : {}),
  };
  const found = entryProblems(entry);
  const summary = caps([...entries, entry], { maxClaude, maxConcurrent, maxAdvisorConcurrent });
  const all = [...problems.map((problem) => `${ledgerPath(run)} ${problem}`), ...found, ...summary.problems];
  if (all.length > 0) {
    for (const problem of all) process.stderr.write(`ledger: ${problem}\n`);
    process.exit(1);
  }
  for (const warning of summary.warnings) process.stderr.write(`ledger: warning: ${warning}\n`);
  await appendFile(ledgerPath(run), `${JSON.stringify(entry)}\n`);
  process.stdout.write(`added: ${entry.role} on ${entry.model} (${entry.tier})\n`);
}
