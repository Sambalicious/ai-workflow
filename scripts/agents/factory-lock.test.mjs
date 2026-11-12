import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, hashFiles, readLock, writeLock } from './factory-lock.mjs';

const SCRIPT = fileURLToPath(new URL('./factory-lock.mjs', import.meta.url));
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

async function project(files = { 'factory/cli.mjs': 'cli', 'factory/adapters/a/x.mjs': 'x', 'scripts/agents/sync.mjs': 'sync' }) {
  const root = await mkdtemp(join(tmpdir(), 'factory-lock-'));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

test('the lock covers factory/, scripts/agents/ and the spec checker, and nothing else', async () => {
  const root = await project();
  try {
    await mkdir(join(root, 'apps'), { recursive: true });
    await writeFile(join(root, 'apps/app.ts'), 'app');
    await mkdir(join(root, 'factory/node_modules/dep'), { recursive: true });
    await writeFile(join(root, 'factory/node_modules/dep/index.js'), 'dep');
    assert.deepEqual([...(await hashFiles(root)).keys()],
      ['factory/adapters/a/x.mjs', 'factory/cli.mjs', 'scripts/agents/sync.mjs']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a changed, missing or added factory file fails the check', async () => {
  const root = await project();
  try {
    const { files } = await writeLock(root, 'abc123');
    assert.equal(compare(files, await hashFiles(root)).ok, true);
    await writeFile(join(root, 'factory/cli.mjs'), 'edited locally');
    await unlink(join(root, 'scripts/agents/sync.mjs'));
    await writeFile(join(root, 'scripts/agents/extra.mjs'), 'new');
    assert.deepEqual(compare(files, await hashFiles(root)), {
      changed: ['factory/cli.mjs'],
      missing: ['scripts/agents/sync.mjs'],
      added: ['scripts/agents/extra.mjs'],
      ok: false,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the CLI writes, checks, and names the drifted file with the way back', async () => {
  const root = await project();
  try {
    assert.equal(run(['--root', root]).status, 1, 'no lock is a failure, not a pass');
    assert.equal(run(['--root', root, '--write']).status, 1, 'the first write needs a commit');
    assert.equal(run(['--root', root, '--write', '--commit', 'abc123']).status, 0);
    assert.equal((await readLock(root)).commit, 'abc123');
    assert.equal(run(['--root', root, '--check']).status, 0);
    await writeFile(join(root, 'factory/cli.mjs'), 'edited locally');
    const drift = run(['--root', root]);
    assert.equal(drift.status, 1);
    assert.match(drift.stderr, /changed {2}factory\/cli\.mjs/);
    assert.match(drift.stderr, /Make the change in ai-workflow/);
    assert.equal(run(['--root', root, '--write']).status, 0, 'a rewrite keeps the recorded commit');
    assert.equal((await readLock(root)).commit, 'abc123');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('--against compares the project with a factory checkout', async () => {
  const factory = await project();
  const root = await project();
  try {
    await writeLock(root, 'abc123');
    assert.equal(run(['--root', root, '--against', factory]).status, 0);
    await writeFile(join(factory, 'scripts/agents/sync.mjs'), 'newer upstream');
    await writeFile(join(factory, 'scripts/agents/new.mjs'), 'only upstream');
    const result = run(['--root', root, '--against', factory]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /changed {2}scripts\/agents\/sync\.mjs/);
    assert.match(result.stdout, /missing {2}scripts\/agents\/new\.mjs/);
  } finally {
    await rm(factory, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('the CLI still runs when called through a symlinked path', async () => {
  const root = await project();
  const link = `${root}-link`;
  try {
    await copyFile(SCRIPT, join(root, 'scripts/agents/factory-lock.mjs'));
    await symlink(root, link);
    const result = spawnSync(process.execPath, [join(link, 'scripts/agents/factory-lock.mjs'), '--root', link, '--write', '--commit', 'abc123'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Wrote \.agents\/factory-lock\.json/);
    assert.equal((await readLock(root)).commit, 'abc123');
  } finally {
    await rm(link, { force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('a locally edited spec checker fails the check', async () => {
  const root = await project({
    'factory/cli.mjs': 'cli',
    '.agents/skills/spec-check.mjs': 'checker',
    '.agents/skills/spec-check.test.mjs': 'checker test',
  });
  try {
    const { files } = await writeLock(root, 'abc123');
    assert.ok('.agents/skills/spec-check.mjs' in files, 'the checker must be locked');
    assert.equal(compare(files, await hashFiles(root)).ok, true);
    await writeFile(join(root, '.agents/skills/spec-check.mjs'), 'tampered gate');
    assert.deepEqual(compare(files, await hashFiles(root)).changed, ['.agents/skills/spec-check.mjs']);
    assert.equal(compare(files, await hashFiles(root)).ok, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
