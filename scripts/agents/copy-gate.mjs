#!/usr/bin/env node
// Copy gate: a worker may ship a user-visible string that still says
// "PENDING copywriter approval", but only when the pull request body lists it under
// "Copy pending approval". Reads `git diff <base>...HEAD`, so the check runs on the
// real candidate rather than on a summary. Exit 1 lists every unapproved string;
// exit 2 is a usage or git error.
// Usage: node scripts/agents/copy-gate.mjs --base <git ref> [--body <pr-body file>]
import { readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The marker a worker leaves when copy is not final yet. Case-insensitive. */
export const MARKER = /pending\s+copywriter/i;

/** The PR body heading that approves each remaining marker. */
export const HEADING = /^#{1,6}\s+copy pending approval\b/i;

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const QUOTE_PATTERNS = [/'((?:\\.|[^'\\])*)'/g, /"((?:\\.|[^"\\])*)"/g, /`((?:\\.|[^`\\])*)`/g];

/** The strings inside `line` that carry the marker; the whole line when it is not quoted. */
export function flaggedStrings(line) {
  const found = [];
  for (const pattern of QUOTE_PATTERNS) {
    for (const match of line.matchAll(pattern)) {
      if (MARKER.test(match[1])) found.push(match[1].trim());
    }
  }
  return found.length > 0 ? [...new Set(found)] : [line.trim()];
}

/**
 * Every added line in a unified diff that carries the marker, with its file and new
 * line number. Removed lines and diff headers are ignored: only what the PR adds counts.
 */
export function findingsFromDiff(diff) {
  const findings = [];
  let file = null;
  let lineNumber = 0;
  let inHunk = false;
  for (const line of String(diff).split('\n')) {
    const hunk = HUNK.exec(line);
    if (hunk) {
      lineNumber = Number(hunk[1]);
      inHunk = true;
      continue;
    }
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).trim();
      file = path === '/dev/null' ? null : path.replace(/^[ab]\//, '');
      inHunk = false;
      continue;
    }
    if (line.startsWith('--- ')) continue;
    if (!inHunk) continue;
    if (line.startsWith('+')) {
      const content = line.slice(1);
      if (MARKER.test(content)) {
        for (const text of flaggedStrings(content)) findings.push({ file, line: lineNumber, text });
      }
      lineNumber += 1;
      continue;
    }
    if (line.startsWith('-') || line.startsWith('\\')) continue;
    lineNumber += 1;
  }
  return findings;
}

/** The text under every "Copy pending approval" heading, with whitespace collapsed. */
export function approvedText(body) {
  const lines = String(body).split('\n');
  const sections = [];
  let inside = false;
  for (const line of lines) {
    if (HEADING.test(line)) {
      inside = true;
      sections.push('');
      continue;
    }
    if (inside && /^#{1,6}\s+/.test(line)) inside = false;
    if (inside) sections.push(line);
  }
  return sections.join('\n').replace(/\s+/g, ' ').trim();
}

/** Findings whose string the PR body does not list under the approval heading. */
export function unapproved(findings, body) {
  const approved = approvedText(body);
  return findings.filter((finding) => !approved.includes(finding.text.replace(/\s+/g, ' ').trim()));
}

/** One review line per flagged string, with the required heading when any are unapproved. */
export function report(findings, missing) {
  if (findings.length === 0) return 'Copy gate: clear.';
  const lines = missing.length === 0
    ? [`Copy gate: clear. ${findings.length} pending string(s) listed in the pull request body.`]
    : [
      `Copy gate: ${missing.length} string(s) still marked PENDING copywriter and not listed under "Copy pending approval":`,
      ...missing.map((finding) => `  ${finding.file ?? '(unknown file)'}:${finding.line}  ${finding.text}`),
      'List each string under a "## Copy pending approval" heading in the PR body, or get the',
      'Copywriter\'s wording and remove the marker. Text marked pending must not merge unapproved.',
    ];
  if (missing.length > 0 && findings.length > missing.length) {
    const listed = findings.length - missing.length;
    lines.push(`(${listed} other pending string(s) are listed in the body.)`);
  }
  return lines.join('\n');
}

function gitDiff(base) {
  const result = spawnSync('git', ['diff', `${base}...HEAD`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(result.error.message);
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git diff ${base}...HEAD failed`);
  return result.stdout;
}

async function main() {
  const baseAt = process.argv.indexOf('--base');
  const bodyAt = process.argv.indexOf('--body');
  const base = baseAt === -1 ? null : process.argv[baseAt + 1];
  const bodyPath = bodyAt === -1 ? null : process.argv[bodyAt + 1];
  if (!base || (bodyAt !== -1 && !bodyPath)) {
    process.stderr.write('usage: node scripts/agents/copy-gate.mjs --base <git ref> [--body <pr-body file>]\n');
    return 2;
  }
  let diff;
  try {
    diff = gitDiff(base);
  } catch (error) {
    process.stderr.write(`copy-gate: ${error.message}\n`);
    return 2;
  }
  let body = '';
  if (bodyPath) {
    try {
      body = readFileSync(bodyPath, 'utf8');
    } catch (error) {
      process.stderr.write(`copy-gate: cannot read ${bodyPath}: ${error.message}\n`);
      return 2;
    }
  }
  const findings = findingsFromDiff(diff);
  const missing = unapproved(findings, body);
  process.stdout.write(`${report(findings, missing)}\n`);
  return missing.length === 0 ? 0 : 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
