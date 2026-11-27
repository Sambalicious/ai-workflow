#!/usr/bin/env node
// Refuses a pull request whose head commit has no independent code review with a PASS verdict.
// Usage: node scripts/agents/pr-gate.mjs --run <dir|feature> [--repo <dir>] [--head <sha>]
//
// The report is <run>/reports/code-review-<head>.md. The reviewed commit is part of the
// filename, so a review of an earlier candidate cannot pass a later head. --run takes the
// run directory (RUN_ROOT in an external run) or a feature id that resolves under
// features/active/; it never creates one.
// Exit 0 when the report exists and states PASS, 1 otherwise, bad usage included.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRun } from './run-path.mjs';

export const VERDICTS = ['PASS', 'CHANGES_REQUIRED', 'BLOCKED'];

// "Verdict: PASS", "**Verdict:** PASS", "### Verdict - CHANGES_REQUIRED".
const STATED = /^[ \t*]*(?:#{1,6}[ \t]*)?verdict[ \t*]*[:=\u2013\u2014-][ \t*]*(PASS|CHANGES_REQUIRED|BLOCKED)\b/im;
// A verdict on its own line, which is how a report under "### Verdict and scope" reads.
const BARE = /^[ \t]*\*{0,2}(PASS|CHANGES_REQUIRED|BLOCKED)\*{0,2}[ \t]*$/im;

/** The verdict a review report states, or null when it states none. */
export function verdictOf(text) {
  const stated = (text ?? '').match(STATED);
  if (stated) return stated[1].toUpperCase();
  const bare = (text ?? '').match(BARE);
  return bare ? bare[1].toUpperCase() : null;
}

/** Everything that stops the pull request, so the caller fixes the review, not the gate. */
export function reviewProblems({ head, report, text, others = [] }) {
  if (text === null || text === undefined) {
    const present = others.length > 0 ? ` (reviews present: ${others.join(', ')})` : '';
    return [`no code review for ${head}: expected ${report}${present}`];
  }
  const verdict = verdictOf(text);
  if (!verdict) return [`${report} states no verdict line; add "Verdict: PASS|CHANGES_REQUIRED|BLOCKED"`];
  if (verdict !== 'PASS') return [`${report} states ${verdict}; a pull request needs PASS on ${head}`];
  return [];
}

export const reportPath = (run, head) => join(run, 'reports', `code-review-${head}.md`);

/** Reads the head's review, plus the review files that exist, so a stale name is visible. */
export async function checkReview(run, head) {
  const report = reportPath(run, head);
  let text = null;
  try {
    text = await readFile(report, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error(`cannot read ${report}: ${error?.code ?? error?.message}`);
  }
  let others = [];
  try {
    others = (await readdir(join(run, 'reports'))).filter((name) => /^code-review-.*\.md$/.test(name)).sort();
  } catch {
    // No reports directory means no review at all; the missing report already says that.
  }
  return { report, verdict: text === null ? null : verdictOf(text), problems: reviewProblems({ head, report, text, others }) };
}

export function headSha(repo, git = (args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) {
  return git(['rev-parse', 'HEAD']).trim();
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(name);
    if (at === -1) return null;
    const value = args[at + 1];
    args.splice(at, value === undefined ? 1 : 2);
    return value ?? '';
  };
  const runInput = flag('--run');
  const repo = flag('--repo') ?? process.cwd();
  const headInput = flag('--head');
  if (!runInput) {
    process.stderr.write('usage: node scripts/agents/pr-gate.mjs --run <dir|feature> [--repo <dir>] [--head <sha>]\n');
    process.exit(1);
  }
  let run;
  try {
    run = (await resolveRun(runInput)).path;
  } catch (error) {
    process.stderr.write(`pr-gate: ${error.message}\n`);
    process.exit(1);
  }
  let head;
  try {
    head = headInput ?? headSha(repo);
  } catch (error) {
    process.stderr.write(`pr-gate: cannot read the head commit: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
  if (!/^[0-9a-f]{7,40}$/.test(head)) {
    process.stderr.write(`pr-gate: head must be the lowercase commit sha, got "${head}"\n`);
    process.exit(1);
  }
  let result;
  try {
    result = await checkReview(run, head);
  } catch (error) {
    process.stderr.write(`pr-gate: ${error.message}\n`);
    process.exit(1);
  }
  if (result.problems.length > 0) {
    for (const problem of result.problems) process.stderr.write(`pr-gate: ${problem}\n`);
    process.exit(1);
  }
  process.stdout.write(`pr-gate: PASS on ${head} (${result.report})\n`);
}
