import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, lstat, mkdtemp, mkdir, readFile, readlink, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDirty, syncSkills } from './sync-skills.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

async function fixture() {
  const source = await mkdtemp(join(tmpdir(), 'skills-source-'));
  const target = await mkdtemp(join(tmpdir(), 'skills-target-'));
  await mkdir(join(source, '.agents/skills/alpha'), { recursive: true });
  await mkdir(join(source, '.agents/commands'), { recursive: true });
  await writeFile(join(source, '.agents/skills/alpha/SKILL.md'), '---\nname: alpha\n---\nAlpha.\n');
  await writeFile(join(source, '.agents/commands/go.md'), '---\ndescription: Go\n---\nRun.\n');
  return { source, target };
}

test('a fresh target receives the skill payload and command links', async () => {
  const { source, target } = await fixture();
  try {
    const report = await syncSkills({ source, target });
    assert.deepEqual(report.added.sort(), [
      '.agents/commands/go.md',
      '.agents/skills/alpha/SKILL.md',
      '.claude/commands/go.md',
      '.kilo/command/go.md',
    ]);
    assert.deepEqual(report.extra, []);
    assert.equal(await readFile(join(target, '.agents/skills/alpha/SKILL.md'), 'utf8'), '---\nname: alpha\n---\nAlpha.\n');
    for (const dir of ['.claude/commands', '.kilo/command']) {
      assert.ok((await lstat(join(target, dir, 'go.md'))).isSymbolicLink());
      assert.equal(await readlink(join(target, dir, 'go.md')), '../../.agents/commands/go.md');
    }
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test('a second run reports no drift and leaves the target byte-identical', async () => {
  const { source, target } = await fixture();
  try {
    await syncSkills({ source, target });
    const before = await readFile(join(target, '.agents/skills/alpha/SKILL.md'));
    const report = await syncSkills({ source, target });
    assert.deepEqual(report.added, []);
    assert.deepEqual(report.updated, []);
    assert.ok(report.unchanged.includes('.agents/skills/alpha/SKILL.md'));
    assert.ok(report.unchanged.includes('.claude/commands/go.md'));
    assert.equal(isDirty(report), false);
    assert.ok(before.equals(await readFile(join(target, '.agents/skills/alpha/SKILL.md'))));
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test('check mode reports drift without writing', async () => {
  const { source, target } = await fixture();
  try {
    await syncSkills({ source, target });
    await writeFile(join(target, '.agents/skills/alpha/SKILL.md'), 'stale\n');
    const report = await syncSkills({ source, target, check: true });
    assert.deepEqual(report.updated, ['.agents/skills/alpha/SKILL.md']);
    assert.equal(isDirty(report), true);
    assert.equal(await readFile(join(target, '.agents/skills/alpha/SKILL.md'), 'utf8'), 'stale\n');
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test('a hand-copied command file becomes a symlink, and target-only skills survive', async () => {
  const { source, target } = await fixture();
  try {
    await mkdir(join(target, '.claude/commands'), { recursive: true });
    await writeFile(join(target, '.claude/commands/go.md'), 'hand copied\n');
    await mkdir(join(target, '.agents/skills/local-only'), { recursive: true });
    await writeFile(join(target, '.agents/skills/local-only/SKILL.md'), '---\nname: local-only\n---\nMine.\n');

    const report = await syncSkills({ source, target });
    assert.ok(report.updated.includes('.claude/commands/go.md'));
    assert.deepEqual(report.extra, ['local-only']);
    assert.ok((await lstat(join(target, '.claude/commands/go.md'))).isSymbolicLink());
    assert.equal(await readFile(join(target, '.agents/skills/local-only/SKILL.md'), 'utf8'), '---\nname: local-only\n---\nMine.\n');
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test('copied files keep their mode', async () => {
  const { source, target } = await fixture();
  try {
    const script = join(source, '.agents/skills/alpha/run.sh');
    await writeFile(script, '#!/bin/sh\n');
    await chmod(script, 0o755);
    await syncSkills({ source, target });
    assert.equal((await stat(join(target, '.agents/skills/alpha/run.sh'))).mode & 0o777, 0o755);
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test('a symlinked payload path is replaced without writing through the link', async () => {
  const { source, target } = await fixture();
  try {
    const external = join(target, 'external.md');
    await writeFile(external, 'do not touch\n');
    await mkdir(join(target, '.agents/skills/alpha'), { recursive: true });
    await symlink(external, join(target, '.agents/skills/alpha/SKILL.md'));
    await syncSkills({ source, target });
    assert.equal(await readFile(external, 'utf8'), 'do not touch\n');
    assert.equal((await lstat(join(target, '.agents/skills/alpha/SKILL.md'))).isSymbolicLink(), false);
    assert.equal(await readFile(join(target, '.agents/skills/alpha/SKILL.md'), 'utf8'), '---\nname: alpha\n---\nAlpha.\n');
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test('the target records which factory commit its skills came from', async () => {
  const { source, target } = await fixture();
  try {
    const git = (...args) => spawnSync('git', ['-C', source, ...args], { encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('-c', 'user.email=a@b', '-c', 'user.name=t', 'commit', '-qm', 'fixture');

    await syncSkills({ source, target });
    const recorded = JSON.parse(await readFile(join(target, '.agents/skills-source.json'), 'utf8'));
    assert.equal(recorded.branch, 'main');
    assert.equal(recorded.dirty, false);
    assert.equal(recorded.commit, git('rev-parse', 'HEAD').stdout.trim());

    await rm(join(target, '.agents/skills-source.json'));
    await syncSkills({ source, target, check: true });
    await assert.rejects(readFile(join(target, '.agents/skills-source.json'), 'utf8'), /ENOENT/);
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test('--source points the CLI at another factory checkout', async () => {
  const { source, target } = await fixture();
  try {
    const result = spawnSync(process.execPath,
      [join(root, 'scripts/agents/sync-skills.mjs'), target, '--source', source],
      { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Source: .*not a git checkout/m);
    assert.equal(await readFile(join(target, '.agents/skills/alpha/SKILL.md'), 'utf8'), '---\nname: alpha\n---\nAlpha.\n');
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test('the CLI exits 0 when in sync and 1 when the target drifts', async () => {
  const target = await mkdtemp(join(tmpdir(), 'skills-cli-'));
  try {
    const cli = ['scripts/agents/sync-skills.mjs', target];
    assert.equal(spawnSync(process.execPath, cli, { cwd: root }).status, 0);
    assert.equal(spawnSync(process.execPath, [...cli, '--check'], { cwd: root }).status, 0);
    await writeFile(join(target, '.agents/skills/retro/SKILL.md'), 'stale\n');
    assert.equal(spawnSync(process.execPath, [...cli, '--check'], { cwd: root }).status, 1);
    assert.equal(spawnSync(process.execPath, ['scripts/agents/sync-skills.mjs'], { cwd: root }).status, 2);
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});
