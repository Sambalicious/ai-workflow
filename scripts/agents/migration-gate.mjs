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

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const IDENT = '"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*';
const FUNCTION = new RegExp(`\\bcreate\\s+(?:or\\s+replace\\s+)?function\\s+(?:if\\s+not\\s+exists\\s+)?(${IDENT})(?:\\s*\\.\\s*(${IDENT}))?`, 'gi');

const normalize = (identifier) => identifier.replace(/"/g, '').toLowerCase();

// Function names a migration defines, unqualified and lowercased: schema.name and name
// match the same declaration.
export function definedFunctions(sql) {
  const names = new Set();
  for (const match of stripComments(sql).matchAll(FUNCTION)) names.add(normalize(match[2] ?? match[1]));
  return names;
}

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
  const migrations = migrationFiles({ ref, dir, cwd });
  const problems = [];
  const details = [];

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

  return { problems, details, migrations, taken };
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

  const { problems, details } = check({ ref, dir, number: Number(rawNumber), functions });
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
