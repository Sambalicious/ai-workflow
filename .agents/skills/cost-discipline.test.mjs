import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Portable across the factory and every project that vendors it: this file reads only
// AGENTS.md, so it enforces the four cost-discipline rules wherever it is installed.
const root = new URL('../../', import.meta.url);

test('cost discipline rules are binding', async () => {
  const orchestrator = await readFile(new URL('AGENTS.md', root), 'utf8');
  assert.match(orchestrator, /## Cost discipline/);
  assert.match(orchestrator, /Dispatch Claude sessions at `medium` effort/);
  assert.match(
    orchestrator,
    /Run a project's full suite only when the change touches a\s+contract, schema, migration, configuration, dependency, or shared module/,
  );
  assert.match(orchestrator, /Never run\s+the same suite twice against an unchanged candidate/);
  assert.match(orchestrator, /Implementation starts only when the `\[5e\]`\s+QA test files for its spec cases exist on disk/);
  assert.match(orchestrator, /Evidence in files, verdict in chat/);
});

// Haiku is retired from every tier: swarm, explore and audit run DeepSeek V4.1 Flash.
test('no client tier runs on Haiku', async () => {
  const models = JSON.parse(await readFile(new URL('.agents/models.json', root), 'utf8'));
  for (const [client, tiers] of Object.entries(models.clients)) {
    for (const [tier, model] of Object.entries(tiers)) {
      assert.doesNotMatch(model, /haiku/i, `${client}.${tier} must not run on Haiku`);
    }
  }
});

// One source of truth: .agents/models.json, rendered into the table by
// scripts/agents/sync.mjs. A model named again in prose is the copy that goes stale
// (an installed AGENTS.md once had swarm = haiku in prose while models.json said Flash).
test('no policy file names a model outside the generated tier table', async () => {
  const models = JSON.parse(await readFile(new URL('.agents/models.json', root), 'utf8'));
  const families = new Set(['haiku']);
  for (const tiers of Object.values(models.clients)) {
    for (const model of Object.values(tiers)) {
      families.add(model.split('/').pop().split('-')[0]);
    }
  }
  let table;
  for (const file of ['AGENTS.md', '.agents/reference/role-model-policy.md']) {
    const text = await readFile(new URL(file, root), 'utf8');
    const match = text.match(/<!-- tier-table:start[\s\S]*?<!-- tier-table:end -->/);
    if (match) table = match[0];
    const prose = match ? text.replace(match[0], '') : text;
    for (const family of families) {
      assert.doesNotMatch(
        prose,
        new RegExp(`\\b${family}\\b`, 'i'),
        `${file} names "${family}" outside the tier table; resolve it with pnpm agents:model`,
      );
    }
  }
  assert.ok(table, 'a policy file needs the generated tier table');
});
