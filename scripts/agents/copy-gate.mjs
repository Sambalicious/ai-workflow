#!/usr/bin/env node
// Copy gate: a worker may ship a user-visible string that still says it is pending
// copywriter approval, but only when the pull request body lists it under
// "Copy pending approval". Reads `git diff <base>...HEAD`, so the check runs on the
// real candidate rather than on a summary. Exit 1 lists every unapproved string;
// exit 2 is a usage or git error.
// Usage: node scripts/agents/copy-gate.mjs --base <git ref> [--body <pr-body file>]
import { readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The markers a worker leaves when copy is not final yet, case-insensitive:
//   "PENDING copywriter approval", "Copy is PENDING (run decision 8)",
//   "(copy-r4-1, PENDING E4-D08/Q17)", and a marker split over two lines
//   ("... and is PENDING" / "// copywriter approval ...").
export const MARKER =
  /\bpending\b[\s/*#-]+\bcopywriter\b|\bcopy\b[^\n]{0,20}\bpending\b|\bpending\b[^\n]{0,20}\bcopy\b/i;

/** The PR body heading that approves each remaining marker. */
export const HEADING = /^#{1,6}\s+copy pending approval\b/i;

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
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
 * A hunk's length comes from its `@@` counts, so an added line that starts with `++ `
 * (and so reads as `+++ `) is not mistaken for a file header. Adjacent added lines are
 * matched together, so a marker split over two lines is still found.
 */
export function findingsFromDiff(diff) {
  const findings = [];
  let file = null;
  let lineNumber = 0;
  let remaining = null;
  let group = [];
  const flush = () => {
    for (let index = 0; index < group.length; index += 1) {
      const current = group[index];
      const next = group[index + 1];
      if (MARKER.test(current.text)) {
        for (const text of flaggedStrings(current.text)) findings.push({ file, line: current.line, text });
        continue;
      }
      // Only a line whose marker word is cut off at the line end joins the next one; a
      // line of code must not borrow the next line's marker.
      if (next && /\b(?:pending|copywriter)\b[\s/*#-]*$/i.test(current.text) && MARKER.test(`${current.text} ${next.text}`)) {
        for (const text of flaggedStrings(`${current.text} ${next.text}`)) findings.push({ file, line: current.line, text });
        index += 1;
      }
    }
    group = [];
  };
  for (const line of String(diff).split('\n')) {
    const hunk = HUNK.exec(line);
    if (hunk) {
      flush();
      lineNumber = Number(hunk[3]);
      remaining = { old: hunk[2] === undefined ? 1 : Number(hunk[2]), new: hunk[4] === undefined ? 1 : Number(hunk[4]) };
      continue;
    }
    if (remaining) {
      if (line.startsWith('+')) {
        group.push({ line: lineNumber, text: line.slice(1) });
        lineNumber += 1;
        remaining.new -= 1;
      } else if (line.startsWith('-')) {
        flush();
        remaining.old -= 1;
      } else if (line.startsWith('\\')) {
        // "\ No newline at end of file" belongs to the line above and consumes no count.
        continue;
      } else {
        flush();
        lineNumber += 1;
        remaining.old -= 1;
        remaining.new -= 1;
      }
      if (remaining.old <= 0 && remaining.new <= 0) {
        flush();
        remaining = null;
      }
      continue;
    }
    if (line.startsWith('--- ')) continue;
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).trim();
      file = path === '/dev/null' ? null : path.replace(/^[ab]\//, '');
    }
  }
  flush();
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

/**
 * The approval section's own bullets, each on one line. A finding is approved by one
 * bullet that names its `file:line` or the exact flagged string, so a generic sentence
 * cannot approve every marker that contains the same words.
 */
export function approvalItems(body) {
  const lines = String(body ?? '').split('\n');
  const items = [];
  const normalize = (text) => text.replace(/\s+/g, ' ').trim();
  let inside = false;
  let current = null;
  const push = () => {
    if (current !== null && normalize(current) !== '') items.push(normalize(current));
    current = null;
  };
  for (const line of lines) {
    if (HEADING.test(line)) {
      push();
      inside = true;
      continue;
    }
    if (inside && /^#{1,6}\s+/.test(line)) {
      push();
      inside = false;
      continue;
    }
    if (!inside) continue;
    if (/^\s*[-*]\s+/.test(line)) {
      push();
      current = line.replace(/^\s*[-*]\s+/, '');
      continue;
    }
    if (current !== null && /^\s+\S/.test(line)) {
      current += ` ${line.trim()}`;
      continue;
    }
    push();
  }
  push();
  return items;
}

const normalizeText = (text) => String(text).replace(/\s+/g, ' ').trim();

/**
 * True when one approval bullet names this finding by `file:line`, or is the exact
 * flagged string. A bullet that merely mentions the same words does not approve:
 * "Strings in LedgerEntrySheet marked PENDING copywriter approval." must not clear
 * every comment that reads "PENDING copywriter approval.".
 */
export function approves(item, finding) {
  if (finding.file && item.includes(`${finding.file}:${finding.line}`)) return true;
  return item === normalizeText(finding.text);
}

/** Findings whose string the PR body does not list, exactly once, under the heading. */
export function unapproved(findings, body) {
  const items = approvalItems(body);
  const claimed = items.map(() => 0);
  const matches = findings.map((finding) => {
    const hits = [];
    items.forEach((item, index) => {
      if (approves(item, finding)) hits.push(index);
    });
    return hits;
  });
  for (const hits of matches) for (const index of hits) claimed[index] += 1;
  return findings.filter((finding, index) => {
    const hits = matches[index];
    return !(hits.length === 1 && claimed[hits[0]] === 1);
  });
}

/** One review line per flagged string, with the required heading when any are unapproved. */
export function report(findings, missing) {
  if (findings.length === 0) return 'Copy gate: clear.';
  const lines = missing.length === 0
    ? [`Copy gate: clear. ${findings.length} pending string(s) listed in the pull request body.`]
    : [
      `Copy gate: ${missing.length} string(s) still marked PENDING copywriter and not listed under "Copy pending approval":`,
      ...missing.map((finding) => `  ${finding.file ?? '(unknown file)'}:${finding.line}  ${finding.text}`),
      'List each string as its own bullet under a "## Copy pending approval" heading, naming',
      '`file:line` or the exact text, or get the Copywriter\'s wording and remove the marker.',
      'Text marked pending must not merge unapproved.',
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
