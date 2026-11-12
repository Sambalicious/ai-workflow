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
    await writeFile(join(root, '.claude/settings.json'), JSON.stringify({
      permissions: { allow: [] },
      hooks: { PreToolUse: [{ matcher: 'Agent', hooks: [{ type: 'command', command: 'node scripts/agents/worker-guard.mjs' }] }] },
    }));

    await sync({ root });
    const claude = await readFile(join(root, '.claude/agents/Explore.md'), 'utf8');
    const opencode = await readFile(join(root, '.opencode/agents/explore.md'), 'utf8');
    assert.match(claude, /^name: Explore$/m);
    assert.match(claude, /^model: haiku$/m);
    assert.match(opencode, /^mode: subagent$/m);
    assert.match(opencode, /^model: p\/swarm$/m);
    const settings = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    assert.deepEqual(settings, {
      permissions: { allow: [] },
      hooks: { PreToolUse: [{ matcher: 'Agent', hooks: [{ type: 'command', command: 'node scripts/agents/worker-guard.mjs' }] }] },
      model: 'sonnet',
      advisorModel: 'opus',
    });
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

test('a generated claude-code swarm agent is retired, a hand-written file stays', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agents-retire-'));
  try {
    await mkdir(join(root, '.agents/agents'), { recursive: true });
    await mkdir(join(root, '.claude/agents'), { recursive: true });
    await mkdir(join(root, '.opencode/agents'), { recursive: true });
    await writeFile(
      join(root, '.agents/models.json'),
      JSON.stringify({
        clients: {
          'claude-code': {
            lead: 'sonnet',
            advisor: 'opus',
            swarm: 'opencode-go/deepseek-v4.1-flash',
          },
          opencode: { lead: 'p/lead', advisor: 'p/advisor', swarm: 'p/swarm' },
        },
      }),
    );
    await writeFile(
      join(root, '.agents/agents/explore.md'),
      '---\nname: explore\ndescription: Search.\ntier: swarm\naccess: read-only\n---\nBody.\n',
    );
    await writeFile(
      join(root, '.agents/agents/audit.md'),
      '---\nname: audit\ndescription: Run checks.\ntier: swarm\naccess: run-checks\n---\nBody.\n',
    );
    // Both spellings, plus the second swarm source: the generator writes lowercase
    // `explore.md`, so a case-sensitive filesystem would let an `Explore.md`-only
    // assertion pass even with the supports filter removed.
    const retiredPaths = ['.claude/agents/Explore.md', '.claude/agents/audit.md'];
    for (const [path, source] of [
      [retiredPaths[0], 'explore'],
      [retiredPaths[1], 'audit'],
    ]) {
      await writeFile(
        join(root, path),
        `---\nname: ${source}\nmodel: haiku\n---\n\n<!-- Generated from .agents/agents/${source}.md by scripts/agents/sync.mjs. Edit the source, then run npm run agents:sync. -->\n\nOld body.\n`,
      );
    }
    // Hand-written files survive: a plain one, and one that merely quotes the marker
    // in prose rather than carrying it in the generated-notice line.
    const handWritten = join(root, '.claude/agents/qa.md');
    await writeFile(handWritten, '# QA Engineer\n');
    const quoting = join(root, '.claude/agents/notes.md');
    await writeFile(
      quoting,
      '# Notes\n\nFiles generated by scripts/agents/sync.mjs are never edited by hand.\n',
    );

    const checked = await sync({ root, check: true });
    for (const path of retiredPaths) {
      assert.ok(checked.includes(path), `${path} is reported as stale`);
    }
    const written = await sync({ root });
    for (const path of retiredPaths) {
      assert.ok(written.includes(path), `${path} is retired`);
      await assert.rejects(readFile(join(root, path), 'utf8'), /ENOENT/);
    }
    assert.equal(await readFile(handWritten, 'utf8'), '# QA Engineer\n');
    assert.equal(
      await readFile(quoting, 'utf8'),
      '# Notes\n\nFiles generated by scripts/agents/sync.mjs are never edited by hand.\n',
    );
    assert.deepEqual(await sync({ root, check: true }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('--check reports a stale generated file and deletes nothing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agents-check-'));
  try {
    await mkdir(join(root, '.agents/agents'), { recursive: true });
    await mkdir(join(root, '.claude/agents'), { recursive: true });
    await writeFile(
      join(root, '.agents/models.json'),
      JSON.stringify({
        clients: {
          'claude-code': {
            lead: 'sonnet',
            advisor: 'opus',
            swarm: 'opencode-go/deepseek-v4.1-flash',
          },
          opencode: { lead: 'p/lead', advisor: 'p/advisor', swarm: 'p/swarm' },
        },
      }),
    );
    await writeFile(
      join(root, '.agents/agents/audit.md'),
      '---\nname: audit\ndescription: Run checks.\ntier: swarm\naccess: run-checks\n---\nBody.\n',
    );
    const stale = join(root, '.claude/agents/audit.md');
    const staleText =
      '---\nname: audit\nmodel: haiku\n---\n\n<!-- Generated from .agents/agents/audit.md by scripts/agents/sync.mjs. Edit the source, then run npm run agents:sync. -->\n\nOld body.\n';
    await writeFile(stale, staleText);

    const reported = await sync({ root, check: true });
    assert.ok(reported.includes('.claude/agents/audit.md'));
    assert.equal(await readFile(stale, 'utf8'), staleText);
    // A check writes nothing else either: the generated settings files stay absent.
    await assert.rejects(readFile(join(root, 'opencode.json'), 'utf8'), /ENOENT/);
    await assert.rejects(readFile(join(root, '.claude/settings.json'), 'utf8'), /ENOENT/);
    // Still out of sync on a second check: nothing was deleted in between.
    assert.deepEqual(await sync({ root, check: true }), reported);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
