#!/usr/bin/env node
// Fails when a feature's CURRENT.md digest is missing, incomplete, or older than the
// newest report in the run root, so a fresh session reads one current file instead of
// re-deriving the pipeline position from fifteen pull requests.
// Usage: node scripts/agents/current-digest.mjs --feature <dir|FEAT-XXXX-slug> [--run <RUN_ROOT>] [--reports <dir>]
// Exit codes: 0 the digest is current; 1 it needs refreshing, with the reason printed.
import { realpathSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The digest is a template, not prose: every heading carries a fact a fresh session
// would otherwise re-derive. The names match .agents/templates/CURRENT.md.
export const REQUIRED_SECTIONS = [
  'Pipeline position',
  'Open PRs',
  'Decisions made',
  'Open blockers',
  'Next step',
  'Reports',
];

const NONE = /^(?:none|n\/a|no(?:ne)? yet)[.!]?$/i;
const STAGE = /\[[0-9][a-z]?\]|\b(?:step|stage)\s+\[?[0-9]/i;
const HEAD_SHA = /\b[0-9a-f]{7,40}\b/;
const LINK = /\]\([^)]+\)|https?:\/\/|(?:^|\/)reports?\//m;
const BLOCKER = /BLOCKER\[[a-z-]+\]/;

const normalizeHeading = (text) => text.trim().toLowerCase();

// Split markdown on level-2 headings only: the digest's sections are peers, and a
// deeper heading inside one section stays in its body.
export function sectionMap(source) {
  const lines = source.split('\n');
  const headings = [];
  lines.forEach((line, index) => {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) headings.push({ key: normalizeHeading(match[1]), index });
  });
  const sections = new Map();
  headings.forEach((heading, at) => {
    const next = headings[at + 1];
    sections.set(heading.key, lines.slice(heading.index + 1, next ? next.index : lines.length).join('\n'));
  });
  return sections;
}

const bullets = (body) =>
  body
    .split('\n')
    .filter((line) => /^\s*[-*]\s+/.test(line))
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim());

const oneLine = (body) => body.trim().replace(/\s+/g, ' ');
const plain = (body) => oneLine(body).replace(/^[-*]\s+/, '');

/** Checks the digest's structure, not the truth of what it says. */
export function digestProblems(text) {
  const sections = sectionMap(text);
  const problems = [];

  for (const name of REQUIRED_SECTIONS) {
    const body = sections.get(normalizeHeading(name));
    if (body === undefined) {
      problems.push(`CURRENT.md has no "## ${name}" section`);
      continue;
    }
    if (oneLine(body) === '') {
      problems.push(`"## ${name}" is empty`);
      continue;
    }

    if (name === 'Pipeline position' && !STAGE.test(body)) {
      problems.push('"## Pipeline position" names no stage (write the passed gate and the one in progress, e.g. "[4] in progress, next [5a]")');
    }

    if (name === 'Open PRs' && !NONE.test(plain(body))) {
      const rows = bullets(body);
      if (rows.length === 0) problems.push('"## Open PRs" lists no pull request lines (use "- PR #n head <sha>", or "none")');
      rows.filter((row) => !HEAD_SHA.test(row)).forEach((row) => {
        problems.push(`"## Open PRs" line has no head SHA: ${row}`);
      });
    }

    if (name === 'Open blockers' && !NONE.test(plain(body)) && !BLOCKER.test(body)) {
      problems.push('"## Open blockers" lists no BLOCKER[agent] line (use the house tag, or "none")');
    }

    if (name === 'Reports' && !NONE.test(plain(body)) && !LINK.test(body)) {
      problems.push('"## Reports" links no report (write a path or a markdown link, or "none")');
    }
  }

  return problems;
}

/** Fails when a report was written after the digest's last update. */
export function freshnessProblems({ digestMtime, latestReport }) {
  if (!latestReport) return [];
  if (digestMtime >= latestReport.mtime) return [];
  const at = (ms) => new Date(ms).toISOString();
  return [
    `CURRENT.md (${at(digestMtime)}) is older than the latest report ${latestReport.path} (${at(latestReport.mtime)}); update the digest before handing off`,
  ];
}

export function digestReport({ text, digestMtime = 0, latestReport = null }) {
  const problems = [...digestProblems(text), ...freshnessProblems({ digestMtime, latestReport })];
  return { ok: problems.length === 0, problems };
}

const isDirectory = async (path) => {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
};

/**
 * Resolves a feature folder from a path, a FEAT id, or a slug. Looks under
 * features/active, features/completed, and RUN_ROOT/features, and never creates one.
 */
export async function resolveFeature(input, { cwd = process.cwd(), env = process.env } = {}) {
  const tried = [];
  const asGiven = isAbsolute(input) ? input : resolve(cwd, input);
  tried.push(asGiven);
  if (await isDirectory(asGiven)) return { path: asGiven, tried };

  const roots = [join(cwd, 'features', 'active'), join(cwd, 'features', 'completed')];
  if (env.RUN_ROOT) {
    const runRoot = isAbsolute(env.RUN_ROOT) ? env.RUN_ROOT : resolve(cwd, env.RUN_ROOT);
    roots.push(join(runRoot, 'features'));
  }
  const matches = [];
  for (const root of roots) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name !== input && !entry.name.startsWith(`${input}-`)) continue;
      matches.push(join(root, entry.name));
    }
  }
  tried.push(...matches);
  if (matches.length === 1) return { path: matches[0], tried };
  if (matches.length > 1) {
    throw new Error(`"${input}" matches ${matches.length} feature folders (${matches.join(', ')}); pass the folder itself`);
  }
  throw new Error(`"${input}" names no feature folder (tried ${tried.join(', ')})`);
}

/** The newest .md report under the run root, recursively. Screenshots and logs do not count. */
export async function newestReport(dir) {
  let newest = null;
  const visit = async (at) => {
    let entries;
    try {
      entries = await readdir(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const info = await stat(path);
        if (!newest || info.mtimeMs > newest.mtime) newest = { path, mtime: info.mtimeMs };
      }
    }
  };
  await visit(dir);
  return newest;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args[at + 1];
  };
  const message = (text) => process.stderr.write(`${text}\n`);

  const positional = [];
  for (let at = 0; at < args.length; at += 1) {
    if (['--feature', '--run', '--reports'].includes(args[at])) at += 1;
    else if (!args[at].startsWith('--')) positional.push(args[at]);
  }
  const input = flag('--feature') ?? positional[0];
  if (!input) {
    message('usage: node scripts/agents/current-digest.mjs --feature <dir|FEAT-XXXX-slug> [--run <RUN_ROOT>] [--reports <dir>]');
    process.exit(1);
  }

  try {
    const feature = await resolveFeature(input);
    const current = join(feature.path, 'CURRENT.md');
    let text;
    try {
      text = await readFile(current, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') {
        message(`CURRENT.md: missing in ${feature.path}`);
        message(`  - create it from .agents/templates/CURRENT.md (node scripts/agents/current-digest.mjs --feature ${feature.path})`);
        process.exit(1);
      }
      throw error;
    }

    const digest = await stat(current);
    const runRoot = flag('--run') ?? process.env.RUN_ROOT;
    const reportsDir = flag('--reports') ?? (runRoot ? join(resolve(runRoot), 'reports') : null);
    const latest = reportsDir ? await newestReport(reportsDir) : null;
    const report = digestReport({ text, digestMtime: digest.mtimeMs, latestReport: latest });

    if (report.ok) {
      process.stdout.write(`CURRENT.md: current (${feature.path})\n`);
      if (reportsDir && latest) process.stdout.write(`freshness: newest report is ${latest.path}\n`);
      else if (reportsDir) process.stdout.write(`freshness: no .md report under ${reportsDir} yet\n`);
      else process.stdout.write('freshness: not checked (pass --run or set RUN_ROOT)\n');
      process.exit(0);
    }

    message(`CURRENT.md: needs refreshing (${feature.path})`);
    for (const problem of report.problems) message(`  - ${problem}`);
    process.exit(1);
  } catch (error) {
    message(`current-digest: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
