import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSource, sync } from './sync.mjs';

test('generated client files match the .agents sources', async () => {
  assert.deepEqual(await sync({ check: true }), []);
});

test('sources need name, description, tier and a known access level', () => {
  assert.throws(() => parseSource('---\nname: x\n---\nbody', 'x.md'), /missing description/);
  assert.throws(
    () => parseSource('---\nname: x\ndescription: d\ntier: swarm\naccess: write\n---\nbody', 'x.md'),
    /access must be/,
  );
});

test('each client gets its own model, and other settings keys survive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agents-sync-'));
  try {
    await mkdir(join(root, '.agents/agents'), { recursive: true });
    await mkdir(join(root, '.claude'), { recursive: true });
    await writeFile(join(root, '.agents/models.json'), JSON.stringify({
      clients: {
        'claude-code': { lead: 'sonnet', advisor: 'opus', swarm: 'haiku' },
        opencode: { lead: 'p/lead', advisor: 'p/advisor', swarm: 'p/swarm' },
      },
    }));
    await writeFile(join(root, '.agents/agents/explore.md'),
      '---\nname: explore\ndescription: Search.\ntier: swarm\naccess: read-only\noverrides-builtin: true\n---\nBody.\n');
    await writeFile(join(root, '.claude/settings.json'), '{"permissions":{"allow":[]}}');

    await sync({ root });
    const claude = await readFile(join(root, '.claude/agents/Explore.md'), 'utf8');
    const opencode = await readFile(join(root, '.opencode/agents/explore.md'), 'utf8');
    assert.match(claude, /^name: Explore$/m);
    assert.match(claude, /^model: haiku$/m);
    assert.match(opencode, /^mode: subagent$/m);
    assert.match(opencode, /^model: p\/swarm$/m);
    const settings = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    assert.deepEqual(settings, { permissions: { allow: [] }, model: 'sonnet', advisorModel: 'opus' });
    assert.equal(JSON.parse(await readFile(join(root, 'opencode.json'), 'utf8')).model, 'p/lead');
    assert.deepEqual(await sync({ root, check: true }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the AGENTS.md tier table is generated from models.json and fails without markers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agents-tiers-'));
  try {
    await mkdir(join(root, '.agents/agents'), { recursive: true });
    await writeFile(join(root, '.agents/models.json'), JSON.stringify({
      tiers: { lead: 'x', worker: 'y' },
      clients: { 'claude-code': { lead: 'sonnet', worker: 'deepseek' }, opencode: { lead: 'p/lead', worker: 'p/worker' } },
    }));
    await writeFile(join(root, 'AGENTS.md'), 'Intro\n\n<!-- tier-table:start -->\nstale\n<!-- tier-table:end -->\n');

    await sync({ root });
    const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
    assert.match(agents, /\| lead \| sonnet \| p\/lead \|/);
    assert.match(agents, /\| worker \| deepseek \| p\/worker \|/);
    assert.doesNotMatch(agents, /stale/);
    assert.deepEqual(await sync({ root, check: true }), []);

    await writeFile(join(root, 'AGENTS.md'), 'No markers here\n');
    await assert.rejects(sync({ root }), /missing tier-table markers/);

    await writeFile(join(root, 'AGENTS.md'),
      'Intro\n\n<!-- tier-table:start -->\n<!-- tier-table:end -->\nSee `.agents/reference/gone.md`.\n');
    await assert.rejects(sync({ root }), /references missing \.agents\/reference\/gone\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
