import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readlink, rm, writeFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportClient } from './export.mjs';

async function factory() {
  const source = await mkdtemp(join(tmpdir(), 'export-src-'));
  await mkdir(join(source, '.agents/agents'), { recursive: true });
  await mkdir(join(source, '.agents/commands'), { recursive: true });
  await mkdir(join(source, '.agents/skills'), { recursive: true });
  await writeFile(join(source, '.agents/models.json'), JSON.stringify({
    clients: {
      'claude-code': { lead: 'sonnet', advisor: 'opus', swarm: 'p/swarm' },
      opencode: { lead: 'p/lead', advisor: 'p/advisor', swarm: 'p/swarm' },
    },
  }));
  await writeFile(join(source, '.agents/agents/advisor.md'), '---\nname: advisor\ndescription: Review.\ntier: advisor\naccess: read-only\n---\nBody.\n');
  await writeFile(join(source, '.agents/agents/explore.md'), '---\nname: explore\ndescription: Search.\ntier: swarm\naccess: read-only\noverrides-builtin: true\n---\nBody.\n');
  await writeFile(join(source, '.agents/qa.md'), '# QA\n');
  await writeFile(join(source, '.agents/commands/retro.md'), 'retro\n');
  await writeFile(join(source, '.agents/skills/architect.md'), 'arch\n');
  return source;
}

test('claude-code export links roles, skills and commands, and skips tiers it cannot run', async () => {
  const source = await factory();
  const target = await mkdtemp(join(tmpdir(), 'export-dst-'));
  try {
    await mkdir(join(target, '.claude'));
    await writeFile(join(target, '.claude/settings.json'), JSON.stringify({ permissions: { allow: [] } }));
    await exportClient({ client: 'claude-code', target, source });
    assert.match(await readFile(join(target, '.claude/agents/advisor.md'), 'utf8'), /^model: opus$/m);
    await assert.rejects(lstat(join(target, '.claude/agents/Explore.md')), { code: 'ENOENT' });
    assert.equal(await readlink(join(target, '.claude/agents/qa.md')), join(source, '.agents/qa.md'));
    assert.equal(await readlink(join(target, '.claude/skills/architect.md')), join(source, '.agents/skills/architect.md'));
    assert.equal(await readlink(join(target, '.claude/commands/retro.md')), join(source, '.agents/commands/retro.md'));
    const settings = JSON.parse(await readFile(join(target, '.claude/settings.json'), 'utf8'));
    assert.deepEqual(settings.permissions, { allow: [] });
    assert.equal(settings.model, 'sonnet');
    assert.match(settings.hooks.PreToolUse[0].hooks[0].command, /FACTORY_ROOT.*worker-guard\.mjs/);
    assert.deepEqual(await exportClient({ client: 'claude-code', target, source, check: true }), []);
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test('opencode export generates agents and the model setting', async () => {
  const source = await factory();
  const target = await mkdtemp(join(tmpdir(), 'export-dst-'));
  try {
    await exportClient({ client: 'opencode', target, source });
    assert.match(await readFile(join(target, '.opencode/agents/explore.md'), 'utf8'), /^model: p\/swarm$/m);
    assert.equal(JSON.parse(await readFile(join(target, 'opencode.json'), 'utf8')).model, 'p/lead');
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test('--check reports stale files and writes nothing; unknown client and relative target fail', async () => {
  const source = await factory();
  const target = await mkdtemp(join(tmpdir(), 'export-dst-'));
  try {
    const stale = await exportClient({ client: 'kilo', target, source, check: true });
    assert.deepEqual(stale, ['.kilo/command/retro.md']);
    await assert.rejects(lstat(join(target, '.kilo')), { code: 'ENOENT' });
    await assert.rejects(exportClient({ client: 'nope', target, source }), /unknown client/);
    await assert.rejects(exportClient({ client: 'kilo', target: 'rel', source }), /absolute/);
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});
