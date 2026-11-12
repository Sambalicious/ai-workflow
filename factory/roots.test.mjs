import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkRoots } from './roots.mjs';

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' });

async function fixture(t) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'roots ')));
  t.after(() => rm(base, { recursive: true, force: true }));
  const factory = join(base, 'factory-checkout');
  await mkdir(join(factory, 'factory'), { recursive: true });
  await writeFile(join(factory, 'factory/cli.mjs'), '');
  git(factory, 'init', '-q');
  git(factory, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
  git(factory, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x');
  const project = join(base, 'project');
  await mkdir(project);
  return { base, factory, project, run: join(base, 'runs', 'project', 'run-001') };
}

test('accepts separate roots and pins the clean factory commit', async t => {
  const f = await fixture(t);
  const result = checkRoots(f);
  assert.deepEqual(result.errors, []);
  assert.match(result.factory_version, /^[0-9a-f]{40}$/);
});

test('rejects relative and missing roots', async t => {
  const f = await fixture(t);
  assert.equal(checkRoots({ ...f, project: 'rel' }).ok, false);
  assert.equal(checkRoots({ ...f, run: undefined }).ok, false);
});

test('rejects a run root inside the project, even through a symlink', async t => {
  const f = await fixture(t);
  assert.equal(checkRoots({ ...f, run: join(f.project, 'runs') }).ok, false);
  await symlink(f.project, join(f.base, 'alias'));
  assert.equal(checkRoots({ ...f, run: join(f.base, 'alias', 'runs') }).ok, false);
});

test('rejects overlapping project and factory', async t => {
  const f = await fixture(t);
  assert.equal(checkRoots({ ...f, project: join(f.factory, 'sub') }).ok, false);
  assert.equal(checkRoots({ ...f, project: f.factory }).ok, false);
});

test('rejects a run root inside a git work tree', async t => {
  const f = await fixture(t);
  git(f.project, 'init', '-q');
  const outer = join(f.base, 'repo');
  await mkdir(outer);
  git(outer, 'init', '-q');
  assert.equal(checkRoots({ ...f, run: join(outer, 'runs') }).ok, false);
});

test('rejects a dirty factory checkout', async t => {
  const f = await fixture(t);
  await writeFile(join(f.factory, 'untracked.txt'), 'x');
  const result = checkRoots(f);
  assert.equal(result.ok, false);
  assert.equal(result.factory_version, null);
});
