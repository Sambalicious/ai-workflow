import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSource, sync } from './sync.mjs';

test('the AGENTS.md tier table matches models.json in this repo', async () => {
  assert.deepEqual(await sync({ check: true }), []);
});

test('sources need name, description, tier and a known access level', () => {
  assert.throws(() => parseSource('---\nname: x\n---\nbody', 'x.md'), /missing description/);
  assert.throws(
    () => parseSource('---\nname: x\ndescription: d\ntier: swarm\naccess: write\n---\nbody', 'x.md'),
    /access must be/,
  );
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
