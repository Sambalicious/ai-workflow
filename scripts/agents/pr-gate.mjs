#!/usr/bin/env node
// Refuses a pull request whose head commit has no independent code review with a PASS verdict.
// Usage: node scripts/agents/pr-gate.mjs --run <dir|feature> [--repo <dir>] [--head <sha>]
//
// The report is <run>/reports/code-review-<head>.md. --head is normalised to the full
// commit sha and must be the repository's HEAD, or an ancestor of it after a merge-only
// update; the report body must name that sha. --run takes the run directory (RUN_ROOT in
// an external run) or a feature id that resolves under features/active/; it never creates
// one. Exit 0 when one clear PASS verdict covers the head, 1 otherwise, bad usage included.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRun } from './run-path.mjs';

export const VERDICTS = ['PASS', 'CHANGES_REQUIRED', 'BLOCKED'];
const TOKEN = '(PASS|CHANGES_REQUIRED|BLOCKED)';

// "Verdict: PASS", "**Verdict:** PASS", "### Verdict - CHANGES_REQUIRED". The value must
// be the whole rest of the line: "Verdict: PASS|CHANGES_REQUIRED|BLOCKED" is an unfilled
// template, and "Verdict: PASS - 2 High open" is not a pass.
const STATED = new RegExp(`^[ \\t*]*(?:#{1,6}[ \\t]*)?verdict[ \\t*]*[:=\u2013\u2014-][ \\t*]*${TOKEN}\\*{0,2}[ \\t]*$`, 'i');
// A verdict on its own line, which is how a report under "### Verdict and scope" reads.
const BARE = new RegExp(`^[ \\t]*\\*{0,2}${TOKEN}\\*{0,2}[ \\t]*$`, 'i');
const FENCE = /^[ \t]*(`{3,}|~{3,})/;

/** The report lines outside code fences, so a fenced example is not read as a verdict. */
function unfenced(text) {
  let fence = null;
  return String(text ?? '')
    .split('\n')
    .map((line) => {
      const match = FENCE.exec(line);
      if (match) {
        if (fence === null) fence = match[1][0];
        else if (match[1][0] === fence) fence = null;
        return '';
      }
      return fence === null ? line : '';
    });
}

/**
 * Every verdict the report states. A stub, a mixed report and a fenced example each
 * yield something other than a single PASS, so the gate can name what it saw.
 */
export function verdictsOf(text) {
  const found = [];
  let underVerdictHeading = false;
  for (const line of unfenced(text)) {
    const stated = STATED.exec(line);
    if (stated) {
      found.push(stated[1].toUpperCase());
      underVerdictHeading = false;
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      underVerdictHeading = /verdict/i.test(line);
      continue;
    }
    const bare = BARE.exec(line);
    if (bare && underVerdictHeading) {
      found.push(bare[1].toUpperCase());
      underVerdictHeading = false;
      continue;
    }
    if (line.trim() !== '') underVerdictHeading = false;
  }
  return found;
}

/** The verdict a review report states, 'MIXED' when its sections disagree, or null. */
export function verdictOf(text) {
  const found = verdictsOf(text);
  if (found.length === 0) return null;
  const unique = [...new Set(found)];
  return unique.length === 1 ? unique[0] : 'MIXED';
}

/** Everything that stops the pull request, so the caller fixes the review, not the gate. */
export function reviewProblems({ head, report, text, others = [] }) {
  if (text === null || text === undefined) {
    const present = others.length > 0 ? ` (reviews present: ${others.join(', ')})` : '';
    return [`no code review for ${head}: expected ${report}${present}`];
  }
  const problems = [];
  const verdicts = verdictsOf(text);
  if (verdicts.length === 0) {
    problems.push(`${report} states no verdict line; add one line beginning "Verdict:" whose value is PASS, CHANGES_REQUIRED or BLOCKED`);
  } else {
    const blocking = [...new Set(verdicts.filter((verdict) => verdict !== 'PASS'))];
    if (blocking.length > 0) {
      problems.push(`${report} states ${blocking.join(', ')}; a pull request needs one clear PASS on ${head}`);
    }
  }
  if (!String(text).includes(head)) {
    problems.push(`${report} does not name the reviewed commit ${head}; a review is only good for the head sha it states`);
  }
  return problems;
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

const gitIn = (repo) => (args) =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

export function headSha(repo, git = gitIn(repo)) {
  return git(['rev-parse', 'HEAD']).trim();
}

/** The full commit sha a ref or short sha names, or null when it names no commit. */
export function commitOf(repo, ref, git = gitIn(repo)) {
  try {
    return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    return null;
  }
}

export function isAncestor(repo, ancestor, descendant, git = gitIn(repo)) {
  try {
    git(['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
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
    const current = headSha(repo);
    head = current;
    if (headInput !== null) {
      if (!/^[0-9a-f]{7,40}$/.test(headInput)) {
        process.stderr.write(`pr-gate: head must be the lowercase commit sha, got "${headInput}"\n`);
        process.exit(1);
      }
      const reviewed = commitOf(repo, headInput);
      if (!reviewed) {
        process.stderr.write(`pr-gate: --head ${headInput} names no commit in ${repo}\n`);
        process.exit(1);
      }
      // A review of an earlier commit passes only as a merge-only update: the reviewed
      // commit is in HEAD's history, and the report names it.
      if (reviewed !== current && !isAncestor(repo, reviewed, current)) {
        process.stderr.write(
          `pr-gate: --head ${headInput} is ${reviewed}, which is not HEAD (${current}) and is not an ancestor of it; review the head that will merge\n`,
        );
        process.exit(1);
      }
      head = reviewed;
    }
  } catch (error) {
    process.stderr.write(`pr-gate: cannot read the head commit: ${error instanceof Error ? error.message : String(error)}\n`);
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
