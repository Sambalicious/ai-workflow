#!/usr/bin/env node
// Pins the factory files a project installed from ai-workflow, so a local edit fails
// `agents:check` instead of drifting quietly. Covers factory/, scripts/agents/ and the
// shared spec checker, which is a gate and must not be editable without a re-pin.
// Usage:
//   node scripts/agents/factory-lock.mjs [--check]                 files match .agents/factory-lock.json
//   node scripts/agents/factory-lock.mjs --write --commit <sha>     record the files as installed from <sha>
//   node scripts/agents/factory-lock.mjs --against <factory root>   compare them with a factory checkout
//   Add --root <dir> to act on another project (the vendored-copy flow does).
// A change to a locked file belongs in ai-workflow: make it there, install or copy it
// back, then rerun --write with the new factory commit.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCK = '.agents/factory-lock.json';
export const DIRS = ['factory', 'scripts/agents'];
// Files outside DIRS that are factory-owned gates. A tampered checker would otherwise
// keep passing `agents:check`, because it lives under .agents/.
export const FILES = ['.agents/skills/spec-check.mjs', '.agents/skills/spec-check.test.mjs'];
export const SOURCE = 'https://github.com/Sambalicious/ai-workflow';
const SKIP = new Set(['node_modules', '.DS_Store']);

async function walk(root, dir, out) {
  let entries;
  try {
    entries = await readdir(join(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await walk(root, path, out);
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

// Map of path to sha256 for every file under DIRS, sorted by path.
export async function hashFiles(root) {
  const paths = [];
  for (const dir of DIRS) await walk(root, dir, paths);
  for (const path of FILES) {
    try {
      await readFile(join(root, path));
      paths.push(path);
    } catch {
      // Absent in a project that predates the checker; nothing to lock yet.
    }
  }
  const hashes = new Map();
  for (const path of paths.sort()) {
    hashes.set(path, createHash('sha256').update(await readFile(join(root, path))).digest('hex'));
  }
  return hashes;
}

// Differences between the locked hashes (an object) and the files on disk (a Map).
export function compare(locked, actual) {
  const changed = [];
  const missing = [];
  for (const [path, hash] of Object.entries(locked)) {
    if (!actual.has(path)) missing.push(path);
    else if (actual.get(path) !== hash) changed.push(path);
  }
  const added = [...actual.keys()].filter((path) => !(path in locked));
  return { changed, missing, added, ok: changed.length + missing.length + added.length === 0 };
}

export async function readLock(root) {
  try {
    return JSON.parse(await readFile(join(root, LOCK), 'utf8'));
  } catch {
    return null;
  }
}

export async function writeLock(root, commit) {
  const files = Object.fromEntries(await hashFiles(root));
  const lock = { source: SOURCE, commit, files };
  await mkdir(dirname(join(root, LOCK)), { recursive: true });
  await writeFile(join(root, LOCK), `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

function report(title, { changed, missing, added }) {
  const lines = [title];
  for (const path of changed) lines.push(`  changed  ${path}`);
  for (const path of missing) lines.push(`  missing  ${path}`);
  for (const path of added) lines.push(`  added    ${path}`);
  return lines.join('\n');
}

// Returns the exit code. Setting process.exitCode, rather than calling process.exit,
// lets stdout finish writing when it is a pipe.
export async function main(args) {
  const flag = (name) => {
    const at = args.indexOf(name);
    return at === -1 ? null : args[at + 1];
  };
  const root = flag('--root') ?? join(import.meta.dirname, '..', '..');
  const existing = await readLock(root);

  if (args.includes('--write')) {
    const commit = flag('--commit') ?? existing?.commit;
    if (!commit) {
      process.stderr.write('factory-lock: --write needs --commit <factory sha> the first time\n');
      return 1;
    }
    const lock = await writeLock(root, commit);
    process.stdout.write(`Wrote ${LOCK}: ${Object.keys(lock.files).length} files from ${commit}\n`);
    return 0;
  }

  if (!existing) {
    process.stderr.write(`factory-lock: no ${LOCK}. Run --write --commit <factory sha> after installing the factory.\n`);
    return 1;
  }

  const against = flag('--against');
  if (against) {
    let head = 'unknown';
    try {
      head = execFileSync('git', ['-C', against, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {}
    const result = compare(Object.fromEntries(await hashFiles(against)), await hashFiles(root));
    if (result.ok) {
      process.stdout.write(`Factory files match ${against} (${head}).\n`);
      return 0;
    }
    // Here "missing" means the factory has a file this project lacks, and "added" a
    // file only this project has.
    process.stdout.write(`${report(`Factory files differ from ${against} (${head}); locked at ${existing.commit}:`, result)}\n`);
    return 1;
  }

  const result = compare(existing.files ?? {}, await hashFiles(root));
  if (result.ok) {
    process.stdout.write(`Factory files match ${LOCK} (${existing.commit.slice(0, 12)}).\n`);
    return 0;
  }
  process.stderr.write(
    `${report(`Factory files differ from ${LOCK} (${existing.commit.slice(0, 12)}):`, result)}\n` +
      'Make the change in ai-workflow, copy it back, then run node scripts/agents/factory-lock.mjs --write --commit <factory sha>.\n',
  );
  return 1;
}

// Real paths on both sides: a caller may call this through a symlinked path (macOS
// /tmp is /private/tmp), and a plain comparison would then skip main and exit 0.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
