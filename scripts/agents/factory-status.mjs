#!/usr/bin/env node
// One view of a run root: every ticket the watcher has acted on, its state and its PR.
//
// Usage: node scripts/agents/factory-status.mjs --run <dir> [--json]
//
// Reads files only. Triage reports, fix and feature reports, per-run progress and the
// dispatch ledger are all under the run root; nothing here talks to GitHub or a model.
import { realpathSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findVerdict } from './watch-tickets.mjs';

// Absent is null; any other failure is an error the caller can show.
const read = (file) => readFile(file, 'utf8').catch((error) => { if (error?.code === 'ENOENT') return null; throw error; });
const parseJson = (text, fallback, label) => {
  if (text === null) return { value: fallback };
  try { return { value: JSON.parse(text) }; } catch { return { value: fallback, invalid: `${label}: invalid JSON` }; }
};
const field = (text, name) => text?.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1];

export async function collect(runRoot) {
  const reports = join(runRoot, 'reports');
  let names;
  try {
    names = (await readdir(reports)).sort();
  } catch (error) {
    throw new Error(`no reports directory at ${reports} (${error?.code ?? error?.message})`);
  }
  const slugs = [...new Set(names.filter((n) => /\.md$/.test(n) && !/\.(qa-gate|security-review|code-review|pr-body|implementation|tests)\.md$/.test(n)).map((n) => n.replace(/\.(fix|feature)\.md$|\.md$/, '')))];
  const tickets = [];
  for (const slug of slugs) {
    const triage = await read(join(reports, `${slug}.md`));
    const fix = await read(join(reports, `${slug}.fix.md`));
    const feature = await read(join(reports, `${slug}.feature.md`));
    const run = fix ?? feature;
    const progressFile = join(runRoot, 'state', 'runs', `${slug}.json`);
    const progress = parseJson(await read(progressFile), { done: [] }, progressFile);
    tickets.push({
      ticket: slug,
      verdict: findVerdict(triage ?? '') ?? null,
      kind: feature ? 'feature' : fix ? 'fix' : null,
      status: run ? field(run, 'Status') ?? 'done' : triage ? 'triaged' : 'unknown',
      stage: field(run, 'stage') ?? null,
      reason: field(run, 'reason') ?? null,
      pr: field(run, 'url') ?? null,
      steps: progress.value.done ?? [],
      problem: progress.invalid ?? null,
    });
  }
  const ledgerFiles = [join(runRoot, 'dispatch-ledger.jsonl'), ...(await readdir(join(runRoot, 'ledgers')).catch(() => [])).map((d) => join(runRoot, 'ledgers', d, 'dispatch-ledger.jsonl'))];
  const ledger = [];
  const problems = tickets.filter((t) => t.problem).map((t) => t.problem);
  for (const file of ledgerFiles) {
    const text = await read(file);
    for (const [index, line] of (text?.split('\n') ?? []).entries()) {
      if (!line) continue;
      try { ledger.push(JSON.parse(line)); } catch { problems.push(`${file} line ${index + 1}: invalid JSON`); }
    }
  }
  return { tickets, dispatches: ledger.length, running: ledger.filter((e) => e.state === 'running').map((e) => e.role), problems };
}

export function render({ tickets, dispatches, running, problems = [] }) {
  const lines = tickets.map((t) => {
    const head = `${t.ticket}  ${t.kind ?? 'triage'}  ${t.status}${t.verdict ? ` (${t.verdict})` : ''}`;
    const detail = t.status === 'halted' ? `\n    stopped at ${t.stage}: ${t.reason}\n    resume: label the ticket factory:retry` : t.pr ? `\n    ${t.pr}` : t.steps.length ? `\n    done: ${t.steps.join(', ')}` : '';
    return head + detail;
  });
  for (const problem of problems) lines.push(`problem: ${problem}`);
  lines.push('', `${tickets.length} ticket(s), ${dispatches} dispatch(es)${running.length ? `, running: ${running.join(', ')}` : ''}`);
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const run = args.includes('--run') ? args[args.indexOf('--run') + 1] : undefined;
  if (!run || !isAbsolute(run)) {
    process.stderr.write('usage: node scripts/agents/factory-status.mjs --run <absolute dir> [--json]\n');
    process.exit(2);
  }
  let data;
  try {
    data = await collect(run);
  } catch (error) {
    process.stderr.write(`factory-status: ${error.message}\n`);
    process.exit(1);
  }
  process.stdout.write(args.includes('--json') ? `${JSON.stringify(data, null, 2)}\n` : render(data));
}
