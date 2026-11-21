#!/usr/bin/env node
// Prints the failed jobs of a pull request's latest completed CI run, with test titles,
// the error block, job annotations, and repeated noise collapsed to one line and a count.
// Usage: node scripts/ci/failures.mjs <pr-number> [--repo owner/name]
//
// Reads through `gh`: the PR head, the run list for that head, the run's jobs, the
// failed log, and each failed job's annotations. Picking a completed, non-cancelled run
// keeps a superseded run's failures out of the report.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FAILED = new Set(['failure', 'timed_out', 'action_required', 'startup_failure']);

export const stripAnsi = (text) =>
  // eslint-disable-next-line no-control-regex
  text.replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, '');

/** `gh run view --log-failed` prefixes each line with `<job>\t<step>\t`; plain logs stay plain. */
export function parseLog(text) {
  const lines = [];
  for (const raw of stripAnsi(text).split('\n')) {
    const parts = raw.split('\t');
    if (parts.length >= 3) lines.push({ job: parts[0], step: parts[1], text: parts.slice(2).join('\t') });
    else lines.push({ job: null, step: null, text: raw });
  }
  return lines;
}

/** The newest completed run that was not cancelled. */
export function latestCompletedRun(runs) {
  const usable = runs
    .filter((run) => run.status === 'completed' && run.conclusion !== 'cancelled')
    .sort((a, b) => Date.parse(b.createdAt ?? 0) - Date.parse(a.createdAt ?? 0));
  return usable[0] ?? null;
}

const TITLE = /(?:^\s*✘|^\s*FAIL\s)/;
const ERROR_START = /^\s*(?:[A-Za-z]*Error|Error\b|expect\()/;

/** Same text modulo timestamps and generated ids: one noise pattern. */
export const noiseKey = (text) =>
  text
    .trim()
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<time>')
    .replace(/\b\d{2}:\d{2}:\d{2}(?:\.\d+)?\b/g, '<time>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\b[0-9a-f]{8,}\b/gi, '<id>')
    .replace(/\b\d{4,}\b/g, '<n>')
    .replace(/\b\d+ms\b/g, '<ms>');

/**
 * Splits one job's log lines into failing test titles, error blocks, and repeated noise.
 * @param {{text: string}[]} lines
 */
export function summarize(lines) {
  const titles = [];
  const errors = [];
  const noise = new Map();
  let block = null;
  let blockLength = 0;
  for (const { text } of lines) {
    const trimmed = text.trim();
    if (block !== null) {
      block.push(text);
      blockLength += 1;
      if (/^\s+at\s/.test(text) || blockLength >= 25) {
        errors.push(block.join('\n'));
        block = null;
      }
      continue;
    }
    if (trimmed === '') continue;
    if (TITLE.test(text)) {
      const title = trimmed.replace(/^(?:✘|FAIL)\s*/, '').trim();
      if (title !== '' && !titles.includes(title)) titles.push(title);
      continue;
    }
    if (ERROR_START.test(text)) {
      block = [text];
      continue;
    }
    const key = noiseKey(text);
    const seen = noise.get(key);
    if (seen) seen.count += 1;
    else noise.set(key, { text: trimmed, count: 1 });
  }
  if (block !== null) errors.push(block.join('\n'));
  return { titles, errors, noise: [...noise.values()].filter((entry) => entry.count > 1) };
}

/** The report text for a run and its failed jobs. Pure: all `gh` reading happens in the CLI. */
export function renderFailureReport({ run, jobs, log = '', annotations = {} }) {
  const failed = jobs.filter((job) => FAILED.has(job.conclusion)).sort((a, b) => a.name.localeCompare(b.name));
  const label = `${run.workflowName ?? run.name ?? 'run'} ${run.databaseId ?? run.id ?? ''}`.trim();
  if (failed.length === 0) return `Run ${label}: no failed jobs.\n`;

  const lines = parseLog(log);
  const out = [`Run ${label}: ${failed.length} failed job${failed.length === 1 ? '' : 's'} (${failed.map((job) => job.name).join(', ')})`];
  for (const job of failed) {
    out.push('', `## ${job.name}`);
    const summary = summarize(lines.filter((line) => line.job === null || line.job === job.name));
    if (summary.titles.length > 0) out.push('failed tests:', ...summary.titles.map((title) => `  - ${title}`));
    if (summary.errors.length > 0) out.push('errors:', ...summary.errors.map((error) => error.replace(/^/gm, '  ')));
    const notes = annotations[job.name] ?? [];
    if (notes.length > 0) out.push('annotations:', ...notes.map((note) => `  - ${note}`));
    if (summary.titles.length + summary.errors.length + notes.length === 0) out.push('no failed test titles or error block in the log (a job that never started has none).');
    if (summary.noise.length > 0) {
      out.push('repeated output:');
      for (const entry of summary.noise.slice(0, 10)) out.push(`  [${entry.count}x] ${entry.text}`);
    }
  }
  return `${out.join('\n')}\n`;
}

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--repo');
  const repo = at === -1 ? null : args.splice(at, 2)[1];
  const pr = args.find((arg) => /^\d+$/.test(arg));
  if (!pr) {
    process.stderr.write('usage: node scripts/ci/failures.mjs <pr-number> [--repo owner/name]\n');
    process.exit(1);
  }
  const repoArgs = repo ? ['--repo', repo] : [];
  try {
    const head = gh(['pr', 'view', pr, ...repoArgs, '--json', 'headRefOid', '--jq', '.headRefOid']).trim();
    const runs = JSON.parse(gh(['run', 'list', '--commit', head, '--limit', '20', '--json', 'databaseId,status,conclusion,createdAt,workflowName']));
    const run = latestCompletedRun(runs);
    if (run === null) {
      process.stderr.write(`failures: no completed CI run for the head of PR ${pr} (${head})\n`);
      process.exit(1);
    }
    const { jobs = [] } = JSON.parse(gh(['run', 'view', String(run.databaseId), '--json', 'jobs']));
    let log = '';
    try {
      log = gh(['run', 'view', String(run.databaseId), '--log-failed']);
    } catch {
      // A run whose jobs never started has no failed log to read.
    }
    const annotations = {};
    const owner = repo ?? JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
    for (const job of jobs.filter((candidate) => FAILED.has(candidate.conclusion))) {
      const id = job.databaseId ?? job.id;
      try {
        const found = gh(['api', `repos/${owner}/check-runs/${id}/annotations`, '--jq', '.[] | "\\(.annotation_level): \\(.message)"'])
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        if (found.length > 0) annotations[job.name] = found;
      } catch {
        // Annotations need permission the run may not have; the log still carries the failure.
      }
    }
    process.stdout.write(renderFailureReport({ run, jobs, log, annotations }));
    process.exit(0);
  } catch (error) {
    const stderr = error?.stderr?.toString().trim();
    process.stderr.write(`failures: ${stderr || (error instanceof Error ? error.message : String(error))}\n`);
    process.exit(1);
  }
}
