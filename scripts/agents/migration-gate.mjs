#!/usr/bin/env node
// Checks a planned migration against the base branch before the architecture publishes.
// It reads the migrations directory at a git ref (origin/main by default), never the
// working tree, and fails when the planned number is taken or a function the spec copies
// has a newer definition on the base than the declared copy base. Copying an older sweep
// over that definition would undo another feature's changes.
// Usage:
//   node scripts/agents/migration-gate.mjs --number 129 [--name manual-orders] \
//     [--migrations apps/backend/migrations] [--ref origin/main] \
//     --function delete_stale_offers=120_offers_sweep.sql [--function other=120] \
//     [--copy-base 120_offers_sweep.sql]
// --copy-base applies to every --function without an inline =base.
// The ref is fetched when it is a remote-tracking ref (origin/main), and a warning names
// its commit date when it is older than six hours, so a worktree that has not fetched
// cannot read a taken number as free. A planned number below the highest one warns.
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DEFAULT_DIR = 'apps/backend/migrations';
export const DEFAULT_REF = 'origin/main';

const MAX_BUFFER = 64 * 1024 * 1024;

function git(args, cwd) {
  return execFileSync('git', args, { encoding: 'utf8', cwd, maxBuffer: MAX_BUFFER, stdio: ['pipe', 'pipe', 'pipe'] });
}

/** SQL with comments blanked, skipping quoted strings and dollar-quoted bodies. */
export function stripComments(sql) {
  let out = '';
  const text = String(sql);
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "'" || char === '"') {
      let at = index + 1;
      while (at < text.length) {
        if (text[at] === char) {
          if (text[at + 1] === char) {
            at += 2;
            continue;
          }
          at += 1;
          break;
        }
        at += 1;
      }
      out += text.slice(index, at);
      index = at - 1;
      continue;
    }
    if (char === '$') {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(index));
      if (tag) {
        const end = text.indexOf(tag[0], index + tag[0].length);
        const stop = end === -1 ? text.length : end + tag[0].length;
        out += text.slice(index, stop);
        index = stop - 1;
        continue;
      }
    }
    if (char === '-' && text[index + 1] === '-') {
      while (index < text.length && text[index] !== '\n') index += 1;
      out += '\n';
      continue;
    }
    if (char === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2);
      index = end === -1 ? text.length : end + 1;
      out += ' ';
      continue;
    }
    out += char;
  }
  return out;
}

/** The single-quoted literals inside an `EXECUTE format(...)` call, in order. */
function formatLiterals(body) {
  const literals = [];
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] !== "'") continue;
    let value = '';
    let at = index + 1;
    while (at < body.length) {
      if (body[at] === "'") {
        if (body[at + 1] === "'") {
          value += "'";
          at += 2;
          continue;
        }
        break;
      }
      value += body[at];
      at += 1;
    }
    literals.push(value);
    index = at;
  }
  return literals;
}

/** The bodies of `EXECUTE format(...)` calls, with nested parens and quoted strings skipped. */
function formatCalls(sql) {
  const calls = [];
  for (const match of sql.matchAll(/\bexecute\s+format\s*\(/gi)) {
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;
    while (index < sql.length && depth > 0) {
      const char = sql[index];
      if (char === "'") {
        index += 1;
        while (index < sql.length) {
          if (sql[index] === "'") {
            if (sql[index + 1] === "'") {
              index += 2;
              continue;
            }
            index += 1;
            break;
          }
          index += 1;
        }
        continue;
      }
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      index += 1;
    }
    calls.push(sql.slice(start, depth === 0 ? index - 1 : index));
  }
  return calls;
}

const IDENT = '"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*';
const FUNCTION = new RegExp(
  `\\bcreate\\s+(?:or\\s+replace\\s+)?(?:function|procedure)\\s+(?:if\\s+not\\s+exists\\s+)?(${IDENT})(?:\\s*\\.\\s*(${IDENT}))?`,
  'gi',
);
const RENAME = new RegExp(
  `\\balter\\s+(?:function|procedure)\\s+(?:if\\s+exists\\s+)?(${IDENT})(?:\\s*\\.\\s*(${IDENT}))?[^;]*?\\brename\\s+to\\s+(${IDENT})(?:\\s*\\.\\s*(${IDENT}))?`,
  'gi',
);
const DROP = new RegExp(
  `\\bdrop\\s+(?:function|procedure)\\s+(?:if\\s+exists\\s+)?(${IDENT})(?:\\s*\\.\\s*(${IDENT}))?`,
  'gi',
);

const normalize = (identifier) => identifier.replace(/"/g, '').toLowerCase();

// Names a migration defines, renames or drops, unqualified and lowercased: schema.name
// and name match the same declaration. A name built at runtime by EXECUTE format(...)
// counts when the format args name it.
export function definedFunctions(sql) {
  const text = stripComments(sql);
  const names = new Set();
  for (const match of text.matchAll(FUNCTION)) names.add(normalize(match[2] ?? match[1]));
  for (const match of text.matchAll(RENAME)) names.add(normalize(match[4] ?? match[3]));
  for (const match of text.matchAll(DROP)) names.add(normalize(match[2] ?? match[1]));
  for (const named of [...names]) if (named.includes('%')) names.delete(named);
  for (const body of formatCalls(text)) {
    const [template, ...args] = formatLiterals(body);
    if (!template || !/\bcreate\s+(?:or\s+replace\s+)?(?:function|procedure)\b[^']*%/i.test(template)) continue;
    for (const arg of args) {
      const candidate = arg.trim();
      if (!new RegExp(`^(?:${IDENT})(?:\\s*\\.\\s*(?:${IDENT}))?$`, 'i').test(candidate)) continue;
      names.add(normalize(candidate.split('.').pop()));
    }
  }
  return names;
}

/** The commit date of a ref, and how many hours old it is, or null when it cannot be read. */
export function refAge({ ref, cwd }) {
  try {
    const at = Date.parse(git(['log', '-1', '--format=%cI', ref], cwd).trim());
    if (!Number.isFinite(at)) return null;
    return { at, hours: (Date.now() - at) / (60 * 60 * 1000) };
  } catch {
    return null;
  }
}

/** Fetches a remote-tracking ref first, so a taken number is not read as free. */
export function fetchRef({ ref, cwd }) {
  const match = /^([^/]+)\/(.+)$/.exec(ref);
  if (!match) return null;
  try {
    execFileSync('git', ['fetch', '--quiet', match[1], match[2]], { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    return null;
  } catch (error) {
    const detail = (error.stderr?.toString() ?? error.message).trim();
    return `could not fetch ${ref} (${detail}); reading the local ref, which may be stale`;
  }
}

export const STALE_HOURS = 6;

// SQL migrations directly inside the directory at the ref, oldest first by number.
export function migrationFiles({ ref = DEFAULT_REF, dir = DEFAULT_DIR, cwd } = {}) {
  let listing;
  try {
    listing = git(['ls-tree', '-r', '--name-only', ref, '--', dir], cwd);
  } catch (error) {
    throw new Error(`cannot read ${dir} at ${ref}: ${(error.stderr?.toString() ?? error.message).trim()}`);
  }
  const prefix = `${dir.replace(/\/+$/, '')}/`;
  const migrations = listing
    .split('\n')
    .map((line) => line.trim())
    .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/') && path.endsWith('.sql'))
    .map((path) => {
      const file = basename(path);
      const match = file.match(/^(\d+)/);
      return { path, file, number: match ? Number(match[1]) : null };
    })
    .filter((migration) => migration.number !== null)
    .sort((a, b) => a.number - b.number || a.file.localeCompare(b.file));
  // A wrong path or ref must fail loudly: an empty result would otherwise pass every check.
  if (migrations.length === 0) throw new Error(`no numbered .sql migrations found in ${dir} at ${ref}`);
  return migrations;
}

// The migration the declared copy base names, or null when it matches none or several.
export function findCopyBase(migrations, base) {
  const wanted = String(base).trim();
  if (/^\d+$/.test(wanted)) {
    const matches = migrations.filter((migration) => migration.number === Number(wanted));
    return matches.length === 1 ? matches[0] : null;
  }
  const exact = migrations.find((migration) => migration.file === wanted);
  if (exact) return exact;
  const prefixed = migrations.filter((migration) => migration.file.startsWith(`${wanted}_`) || migration.file.startsWith(`${wanted}.`));
  return prefixed.length === 1 ? prefixed[0] : null;
}

export function parseFunctions(values, copyBase) {
  const functions = [];
  for (const value of values) {
    const at = value.indexOf('=');
    const name = (at === -1 ? value : value.slice(0, at)).trim();
    const base = at === -1 ? copyBase : value.slice(at + 1).trim();
    if (!name) throw new Error('--function needs a function name');
    if (!base) throw new Error(`function "${name}" needs a copy base: --copy-base or --function ${name}=<migration>`);
    functions.push({ name, base });
  }
  return functions;
}

export function check({ ref = DEFAULT_REF, dir = DEFAULT_DIR, number, functions = [], cwd }) {
  const warnings = [];
  // Fetch before reading the ref, so a worktree that has not pulled cannot read a taken
  // number as free. A failed fetch warns and continues on the local ref.
  const fetchFailure = fetchRef({ ref, cwd });
  if (fetchFailure) warnings.push(fetchFailure);
  const age = refAge({ ref, cwd });
  if (age && age.hours > STALE_HOURS) {
    warnings.push(
      `${ref} was last committed ${Math.floor(age.hours)}h ago (${new Date(age.at).toISOString()}); fetch before relying on a free number`,
    );
  }
  const migrations = migrationFiles({ ref, dir, cwd });
  const problems = [];
  const details = [];
  const highest = migrations[migrations.length - 1];
  if (highest && number <= highest.number) {
    warnings.push(
      `${number} is not above the highest migration in ${ref} (${highest.file}); out-of-order migrations only work if the runner allows them`,
    );
  }

  const taken = migrations.filter((migration) => migration.number === number);
  for (const migration of taken) problems.push(`${number} is taken by ${migration.file} in ${ref}:${dir}`);

  for (const { name, base } of functions) {
    const copyBase = findCopyBase(migrations, base);
    if (!copyBase) {
      problems.push(`function ${name}: copy base ${base} is not one migration in ${ref}:${dir}`);
      continue;
    }
    let latest = null;
    const from = migrations.indexOf(copyBase);
    for (const migration of migrations.slice(from)) {
      const sql = git(['show', `${ref}:${migration.path}`], cwd);
      if (definedFunctions(sql).has(normalize(name))) latest = migration;
    }
    if (!latest) {
      problems.push(`function ${name}: no migration in ${ref}:${dir} defines it, so copy base ${copyBase.file} cannot be right`);
      continue;
    }
    if (latest.file !== copyBase.file) {
      problems.push(
        `function ${name}: latest definition is ${latest.file}, not the declared copy base ${copyBase.file}; copying the base would undo ${latest.file}`,
      );
      continue;
    }
    details.push(`${name} last defined in ${latest.file}, as declared`);
  }

  return { problems, details, warnings, migrations, taken };
}

function valueOf(args, name) {
  const at = args.indexOf(name);
  return at === -1 ? null : args[at + 1] ?? null;
}

function valuesOf(args, name) {
  const values = [];
  for (let at = 0; at < args.length; at += 1) if (args[at] === name) values.push(args[at + 1]);
  return values.filter((value) => value !== undefined);
}

export function main(args) {
  const rawNumber = valueOf(args, '--number');
  if (!rawNumber || !/^\d+$/.test(rawNumber)) throw new Error('--number <migration number> is required');
  const name = valueOf(args, '--name');
  const ref = valueOf(args, '--ref') ?? DEFAULT_REF;
  const dir = valueOf(args, '--migrations') ?? DEFAULT_DIR;
  const functions = parseFunctions(valuesOf(args, '--function'), valueOf(args, '--copy-base'));

  const { problems, details, warnings } = check({ ref, dir, number: Number(rawNumber), functions });
  for (const warning of warnings) process.stderr.write(`migration-gate: warning: ${warning}\n`);
  if (problems.length > 0) {
    process.stderr.write(`migration-gate: ${problems.length} problem(s) against ${ref}:${dir}\n`);
    for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
    return 1;
  }
  process.stdout.write(`migration-gate: ${rawNumber}${name ? ` (${name})` : ''} is free in ${ref}:${dir}\n`);
  for (const detail of details) process.stdout.write(`  ${detail}\n`);
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`migration-gate: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
