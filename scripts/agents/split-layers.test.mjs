import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseLayers, revertedFiles } from './split-layers.mjs';

const SCRIPT = fileURLToPath(new URL('./split-layers.mjs', import.meta.url));
const runIn = (cwd, args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd });
const git = (cwd, args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
const show = (cwd, ref, path) => git(cwd, ['show', `${ref}:${path}`]).stdout;
const commit = (cwd, message) => {
  git(cwd, ['add', '-A']);
  const result = git(cwd, ['commit', '-q', '-m', message]);
  if (result.status !== 0) throw new Error(`git commit failed: ${result.stderr || result.stdout}`);
};

async function put(dir, path, content) {
  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), content);
}

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), 'split-layers-'));
  git(dir, ['init', '-q']);
  git(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  git(dir, ['config', 'user.email', 'qa@example.com']);
  git(dir, ['config', 'user.name', 'QA']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  await put(dir, 'apps/web/page.txt', 'base\n');
  await put(dir, 'apps/web/shared.txt', 'base\n');
  await put(dir, 'apps/api/handler.txt', 'base\n');
  await put(dir, 'apps/api/shared.txt', 'base\n');
  git(dir, ['add', '-A']);
  commit(dir, 'base');
  const mergeBase = git(dir, ['rev-parse', 'HEAD']).stdout.trim();

  // Main moves after the candidate branched off. The old workflow overwrote these.
  await put(dir, 'apps/web/shared.txt', 'main\n');
  await put(dir, 'apps/api/shared.txt', 'main\n');
  await put(dir, 'apps/web/main-only.txt', 'new\n');
  git(dir, ['add', '-A']);
  commit(dir, 'main moves');

  git(dir, ['switch', '-q', '-c', 'candidate', mergeBase]);
  await put(dir, 'apps/web/page.txt', 'candidate\n');
  await put(dir, 'apps/web/added.txt', 'candidate\n');
  await put(dir, 'apps/api/handler.txt', 'candidate\n');
  git(dir, ['add', '-A']);
  commit(dir, 'candidate');
  git(dir, ['switch', '-q', 'main']);
  return { dir, mergeBase };
}

test('layers stack and keep every file the base moved since the merge-base', async () => {
  const { dir, mergeBase } = await repo();
  try {
    const result = runIn(dir, ['--candidate', 'candidate', '--base', 'main', '--layer', 'web=apps/web', '--layer', 'api=apps/api']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /layer\/web/);
    assert.match(result.stdout, /layer\/api/);

    assert.equal(show(dir, 'layer/web', 'apps/web/page.txt'), 'candidate\n');
    assert.equal(show(dir, 'layer/web', 'apps/web/added.txt'), 'candidate\n');
    assert.equal(show(dir, 'layer/web', 'apps/web/shared.txt'), 'main\n');
    assert.equal(show(dir, 'layer/web', 'apps/web/main-only.txt'), 'new\n');
    assert.equal(show(dir, 'layer/web', 'apps/api/handler.txt'), 'base\n');

    assert.equal(show(dir, 'layer/api', 'apps/web/page.txt'), 'candidate\n');
    assert.equal(show(dir, 'layer/api', 'apps/api/handler.txt'), 'candidate\n');
    assert.equal(show(dir, 'layer/api', 'apps/api/shared.txt'), 'main\n');
    assert.equal(show(dir, 'layer/api', 'apps/api/shared.txt'), 'main\n');

    assert.equal(git(dir, ['rev-parse', 'layer/web^']).stdout.trim(), git(dir, ['rev-parse', 'main']).stdout.trim());
    assert.equal(git(dir, ['rev-parse', 'layer/api^']).stdout.trim(), git(dir, ['rev-parse', 'layer/web']).stdout.trim());
    assert.equal(git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim(), 'main');
    assert.deepEqual(revertedFiles({ base: 'main', mergeBase, branch: 'layer/web', cwd: dir }), []);
    assert.deepEqual(revertedFiles({ base: 'main', mergeBase, branch: 'layer/api', cwd: dir }), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a branch that restores a base-changed file to its merge-base copy is reported', async () => {
  const { dir, mergeBase } = await repo();
  try {
    git(dir, ['switch', '-q', '-c', 'bad', 'main']);
    git(dir, ['restore', '--source', mergeBase, '--', 'apps/web/shared.txt']);
    commit(dir, 'revert main');
    assert.deepEqual(revertedFiles({ base: 'main', mergeBase, branch: 'bad', cwd: dir }), ['apps/web/shared.txt']);
    assert.deepEqual(revertedFiles({ base: 'main', mergeBase, branch: 'main', cwd: dir }), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a layer that conflicts with a base change fails and restores the original branch', async () => {
  const { dir } = await repo();
  try {
    git(dir, ['switch', '-q', 'candidate']);
    await put(dir, 'apps/web/shared.txt', 'candidate changed it too\n');
    commit(dir, 'candidate touches a moved file');
    git(dir, ['switch', '-q', 'main']);

    const result = runIn(dir, ['--candidate', 'candidate', '--base', 'main', '--layer', 'web=apps/web']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not apply/);
    assert.equal(git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim(), 'main');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an empty layer fails instead of producing a branch with no diff', async () => {
  const { dir } = await repo();
  try {
    const result = runIn(dir, ['--candidate', 'candidate', '--base', 'main', '--layer', 'docs=docs']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /layer "docs" has no changes/);
    assert.equal(git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim(), 'main');
    assert.notEqual(git(dir, ['rev-parse', '--verify', '--quiet', 'refs/heads/layer/docs']).status, 0, 'a failed run leaves no branch');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('layer arguments are validated before any branch is created', () => {
  assert.deepEqual(parseLayers(['web=apps/web', 'api=apps/api/src, apps/api/test ']), [
    { name: 'web', paths: ['apps/web'] },
    { name: 'api', paths: ['apps/api/src', 'apps/api/test'] },
  ]);
  assert.throws(() => parseLayers([]), /at least one --layer/);
  assert.throws(() => parseLayers(['apps/web']), /name=path/);
  assert.throws(() => parseLayers(['web=']), /no paths/);
  assert.throws(() => parseLayers(['bad name=apps/web']), /layer name/);
  assert.throws(() => parseLayers(['web=apps/web', 'web=apps/api']), /named twice/);
});
