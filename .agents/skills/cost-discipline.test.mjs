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
