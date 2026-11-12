#!/usr/bin/env node
// Validates the three roots for shared-checkout use (see EXTERNAL.md) and prints a handoff block.
// Usage: node factory/roots.mjs --project <dir> --run <dir> [--factory <dir>] [--json]
// Read-only: it creates nothing. It does not enforce boundaries at write time; the caller still does.
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const git = (cwd, ...args) => {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
};

const contains = (outer, inner) => inner === outer || inner.startsWith(outer.endsWith(sep) ? outer : outer + sep);

// Resolve symlinks on the deepest existing ancestor so a not-yet-created RUN_ROOT is still checked.
function resolveReal(path) {
  const tail = [];
  let current = resolve(path);
  while (!existsSync(current)) {
    tail.unshift(current.slice(dirname(current).length + 1));
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return join(realpathSync(current), ...tail);
}

export function checkRoots({ factory, project, run }) {
  const errors = [];
  const warnings = [];
  const roots = { FACTORY_ROOT: factory, PROJECT_ROOT: project, RUN_ROOT: run };
  const real = {};
  for (const [name, value] of Object.entries(roots)) {
    if (!value) { errors.push(`${name} is missing`); continue; }
    if (!isAbsolute(value)) { errors.push(`${name} must be an absolute path: ${value}`); continue; }
    real[name] = resolveReal(value);
  }
  if (errors.length) return { ok: false, errors, warnings, roots: real };

  for (const name of ['FACTORY_ROOT', 'PROJECT_ROOT']) {
    if (!existsSync(real[name]) || !statSync(real[name]).isDirectory()) errors.push(`${name} is not a directory: ${real[name]}`);
  }
  if (existsSync(real.FACTORY_ROOT) && !existsSync(join(real.FACTORY_ROOT, 'factory/cli.mjs'))) {
    errors.push(`FACTORY_ROOT has no factory/cli.mjs: ${real.FACTORY_ROOT}`);
  }

  const names = Object.keys(real);
  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < names.length; j++) {
      if (i !== j && contains(real[names[i]], real[names[j]])) {
        errors.push(`${names[j]} (${real[names[j]]}) is equal to or inside ${names[i]} (${real[names[i]]})`);
      }
    }
  }

  if (existsSync(real.RUN_ROOT) && git(real.RUN_ROOT, 'rev-parse', '--is-inside-work-tree') === 'true') {
    errors.push(`RUN_ROOT is inside a Git work tree: ${real.RUN_ROOT}`);
  } else if (!existsSync(real.RUN_ROOT)) {
    // Not created yet: check the nearest existing ancestor.
    let parent = dirname(real.RUN_ROOT);
    while (!existsSync(parent) && dirname(parent) !== parent) parent = dirname(parent);
    if (git(parent, 'rev-parse', '--is-inside-work-tree') === 'true') errors.push(`RUN_ROOT would be created inside a Git work tree (${parent})`);
    warnings.push('RUN_ROOT does not exist yet; create it with restricted access before init');
  }
  if (existsSync(real.RUN_ROOT) && (statSync(real.RUN_ROOT).mode & 0o077)) {
    warnings.push('RUN_ROOT is accessible to group/other; restrict it (chmod 700)');
  }

  const sha = existsSync(real.FACTORY_ROOT) ? git(real.FACTORY_ROOT, 'rev-parse', 'HEAD') : null;
  const dirty = sha ? git(real.FACTORY_ROOT, 'status', '--porcelain') : null;
  let factoryVersion = null;
  if (!sha) errors.push('FACTORY_ROOT is not a Git checkout; cannot pin a commit (use a frozen snapshot)');
  else if (dirty) errors.push('FACTORY_ROOT has uncommitted or untracked changes; a commit alone is not a pin. Use a clean checkout or a frozen snapshot');
  else factoryVersion = sha;

  return { ok: errors.length === 0, errors, warnings, roots: real, factory_version: factoryVersion };
}

function parse(argv) {
  const options = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--json') options.json = true;
    else if (['--factory', '--project', '--run'].includes(flag)) options[flag.slice(2)] = argv[++i];
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return options;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  let options;
  try { options = parse(process.argv.slice(2)); } catch (error) {
    console.error(`${error.message}\nUsage: node factory/roots.mjs --project <dir> --run <dir> [--factory <dir>] [--json]`);
    process.exit(2);
  }
  const factory = options.factory ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const result = checkRoots({ factory, project: options.project, run: options.run });
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    for (const message of result.warnings) console.error(`warn: ${message}`);
    for (const message of result.errors) console.error(`error: ${message}`);
    if (result.ok) {
      console.log(`export FACTORY_ROOT="${result.roots.FACTORY_ROOT}"`);
      console.log(`export PROJECT_ROOT="${result.roots.PROJECT_ROOT}"`);
      console.log(`export RUN_ROOT="${result.roots.RUN_ROOT}"`);
      console.log(`# factory_version: ${result.factory_version}`);
    }
  }
  process.exit(result.ok ? 0 : 1);
}
