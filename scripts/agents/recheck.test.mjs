import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { globToRegExp, matchedSpecs, readConfig } from './recheck.mjs';

const SCRIPT = fileURLToPath(new URL('./recheck.mjs', import.meta.url));
const runIn = (cwd, args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd });
const git = (cwd, args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

const config = {
  paths: {
    'apps/api/src/**/*.controller.ts': ['apps/api/test/cross-candidate-registry.int-spec.ts'],
    '**/guards/**': ['apps/api/test/guards.int-spec.ts', 'apps/api/test/cross-candidate-registry.int-spec.ts'],
    'apps/web/**': [],
  },
};

test('a glob spans directories only for ** and stays inside one for *', () => {
  assert.ok(globToRegExp('**/guards/**').test('apps/api/src/guards/auth.guard.ts'));
  assert.ok(globToRegExp('**/guards/**').test('src/guards/auth.guard.ts'));
  assert.ok(!globToRegExp('**/guards/**').test('src/guardsx/auth.ts'));
  assert.ok(globToRegExp('apps/api/src/**/*.controller.ts').test('apps/api/src/orders/orders.controller.ts'));
  assert.ok(!globToRegExp('apps/api/src/**/*.controller.ts').test('apps/api/src/orders/orders.service.ts'));
  assert.ok(!globToRegExp('apps/*/src').test('apps/api/nested/src'));
  assert.ok(globToRegExp('apps/?.ts').test('apps/a.ts'));
  assert.ok(!globToRegExp('apps/?.ts').test('apps/ab.ts'));
});

test('a guard change pulls the registry spec even though its own suite is untouched', () => {
  const { specs } = matchedSpecs(config, ['apps/api/src/guards/roles.guard.ts']);
  assert.deepEqual(specs, ['apps/api/test/cross-candidate-registry.int-spec.ts', 'apps/api/test/guards.int-spec.ts']);
});

test('specs are deduplicated and sorted across matching globs, and an unrelated diff adds none', () => {
  const { specs, matches } = matchedSpecs(config, ['apps/api/src/orders/orders.controller.ts']);
  assert.deepEqual(specs, ['apps/api/test/cross-candidate-registry.int-spec.ts']);
  assert.equal(matches.length, 1);
  assert.deepEqual(matchedSpecs(config, ['apps/web/src/page.tsx']).specs, []);
  assert.deepEqual(matchedSpecs(config, ['docs/readme.md']).specs, []);
});

test('no config file means no extra specs, and a malformed one is an error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'recheck-'));
  try {
    await mkdir(join(dir, '.agents'), { recursive: true });
    assert.equal(await readConfig(join(dir, '.agents/recheck-always.json')), null);
    await writeFile(join(dir, '.agents/recheck-always.json'), '{ not json');
    await assert.rejects(readConfig(join(dir, '.agents/recheck-always.json')), /must map globs|JSON|not json/);
    await writeFile(join(dir, '.agents/recheck-always.json'), JSON.stringify({ paths: [] }));
    await assert.rejects(readConfig(join(dir, '.agents/recheck-always.json')), /"paths" must map globs/);
    await writeFile(join(dir, '.agents/recheck-always.json'), JSON.stringify({ paths: { 'src/**': 'not-a-list' } }));
    await assert.rejects(readConfig(join(dir, '.agents/recheck-always.json')), /must list spec file paths/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const project = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'recheck-project-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'qa@example.com']);
  git(dir, ['config', 'user.name', 'QA']);
  await mkdir(join(dir, 'apps/api/src/guards'), { recursive: true });
  await mkdir(join(dir, 'apps/api/test'), { recursive: true });
  await mkdir(join(dir, '.agents'), { recursive: true });
  await writeFile(join(dir, 'apps/api/src/guards/roles.guard.ts'), 'export const a = 1;\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  await writeFile(join(dir, 'apps/api/src/guards/roles.guard.ts'), 'export const a = 2;\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'change']);
  return dir;
};

test('the CLI prints the mapped specs for the diff and nothing without a config', async () => {
  const dir = await project();
  try {
    const before = runIn(dir, ['--base', 'HEAD~1']);
    assert.equal(before.status, 0);
    assert.equal(before.stdout, '', 'no config, no extra specs');

    await writeFile(join(dir, '.agents/recheck-always.json'), JSON.stringify(config));
    const after = runIn(dir, ['--base', 'HEAD~1']);
    assert.equal(after.status, 0, after.stderr);
    assert.match(after.stdout, /^apps\/api\/test\/cross-candidate-registry\.int-spec\.ts\napps\/api\/test\/guards\.int-spec\.ts\n$/);

    const json = JSON.parse(runIn(dir, ['--base', 'HEAD~1', '--json']).stdout);
    assert.equal(json.matches[0].glob, '**/guards/**');
    assert.deepEqual(json.matches[0].files, ['apps/api/src/guards/roles.guard.ts']);

    await writeFile(join(dir, '.agents/recheck-always.json'), '{ bad');
    const broken = runIn(dir, ['--base', 'HEAD~1']);
    assert.equal(broken.status, 1);
    assert.match(broken.stderr, /recheck:/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
