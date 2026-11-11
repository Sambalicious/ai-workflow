#!/usr/bin/env node
// Copies the factory's skill and command payload into an installed project so new
// skills and commands arrive from one command instead of a hand copy.
// Usage: node scripts/agents/sync-skills.mjs <target> [--check]
// --check writes nothing and exits 1 when the target is out of date.
//
// Scope is deliberately narrow: .agents/skills/, .agents/commands/, and the
// per-client command symlinks. AGENTS.md, .agents/models.json, the role files,
// rules, reference docs, factory/ and the client model settings carry per-project
// decisions, so they stay with install.sh and the target's own review.
import { chmod, copyFile, lstat, mkdir, readFile, readdir, readlink, rm, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const PAYLOAD = [
  { dir: '.agents/skills', recursive: true },
  { dir: '.agents/commands', recursive: false },
];

const LINK_DIRS = ['.claude/commands', '.kilo/command'];

const toPosix = path => path.split(sep).join('/');

async function listFiles(dir, recursive) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) files.push(...(await listFiles(path, recursive)));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      files.push(path);
    }
  }
  return files;
}

async function statOrNull(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

const sameBytes = (a, b) => a.length === b.length && a.equals(b);

async function planFiles(source, target, report) {
  for (const { dir, recursive } of PAYLOAD) {
    for (const file of await listFiles(join(source, dir), recursive)) {
      const path = join(target, relative(source, file));
      const incoming = await readFile(file);
      const existing = await readFile(path).catch(() => null);
      const label = toPosix(relative(target, path));
      if (existing && sameBytes(existing, incoming)) {
        report.unchanged.push(label);
        continue;
      }
      (existing ? report.updated : report.added).push(label);
      report.actions.push({ path, type: 'file', source: file });
    }
  }
}

async function planCommandLinks(source, target, report) {
  for (const dir of LINK_DIRS) {
    for (const command of await listFiles(join(source, '.agents/commands'), false)) {
      const name = basename(command, '.md');
      const path = join(target, dir, `${name}.md`);
      const wanted = `../../.agents/commands/${name}.md`;
      const stat = await statOrNull(path);
      const label = toPosix(relative(target, path));
      if (stat?.isSymbolicLink() && (await readlink(path)) === wanted) {
        report.unchanged.push(label);
        continue;
      }
      (stat ? report.updated : report.added).push(label);
      report.actions.push({ path, type: 'symlink', value: wanted });
    }
  }
}

async function findExtraSkills(source, target) {
  const sourceSkills = new Set(await readdir(join(source, '.agents/skills')));
  const targetSkills = await readdir(join(target, '.agents/skills')).catch(() => []);
  return targetSkills.filter(name => !sourceSkills.has(name)).sort();
}

export async function syncSkills({ source = ROOT, target, check = false } = {}) {
  const report = { added: [], updated: [], unchanged: [], extra: [], actions: [] };

  await planFiles(source, target, report);
  await planCommandLinks(source, target, report);
  report.extra = await findExtraSkills(source, target);

  if (!check) {
    for (const action of report.actions) {
      await mkdir(dirname(action.path), { recursive: true });
      const existing = await statOrNull(action.path);
      if (action.type === 'symlink') {
        await rm(action.path, { force: true, recursive: true });
        await symlink(action.value, action.path);
      } else {
        // copyFile writes through a symlink, which would edit a file outside the
        // target. Remove the link (or a stray directory) first, then copy.
        if (existing?.isSymbolicLink() || existing?.isDirectory()) {
          await rm(action.path, { force: true, recursive: true });
        }
        await copyFile(action.source, action.path);
        const { mode } = await lstat(action.source);
        await chmod(action.path, mode);
      }
    }
  }

  delete report.actions;
  return report;
}

export const isDirty = (report) => report.added.length > 0 || report.updated.length > 0;

function provenance(source) {
  const git = (...args) => spawnSync('git', ['-C', source, ...args], { encoding: 'utf8' });
  if (git('rev-parse', '--is-inside-work-tree').status !== 0) return `${source} (not a git checkout)`;
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
  const sha = git('rev-parse', '--short', 'HEAD').stdout.trim();
  const dirty = git('status', '--porcelain').stdout.trim() ? ', dirty' : '';
  return `${branch} @ ${sha}${dirty}`;
}

async function main(argv) {
  const check = argv.includes('--check');
  const sourceAt = argv.indexOf('--source');
  const source = sourceAt === -1 ? ROOT : argv[sourceAt + 1];
  const positional = argv.filter((arg, index) => !arg.startsWith('--') && (sourceAt === -1 || index !== sourceAt + 1));
  const target = positional[0];
  if (!target || !source) {
    console.error('Usage: node scripts/agents/sync-skills.mjs <target> [--check] [--source <factory-checkout>]');
    return 2;
  }
  console.log(`Source: ${provenance(source)}`);
  const report = await syncSkills({ source, target, check });
  const line = (label, paths) => paths.length && console.log(`${label}: ${paths.join(', ')}`);
  line(check ? 'would add' : 'added', report.added);
  line(check ? 'would update' : 'updated', report.updated);
  if (report.extra.length) console.log(`left alone (target only): ${report.extra.join(', ')}`);
  if (check && isDirty(report)) {
    console.error('Skills are out of date. Run without --check to refresh them.');
    return 1;
  }
  console.log(`Skills in sync: ${report.unchanged.length} unchanged.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2));
}
