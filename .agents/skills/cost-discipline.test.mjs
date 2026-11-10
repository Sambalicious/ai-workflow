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
  assert.match(orchestrator, /Implementation starts only when the `\[5e\]`\s+QA spec files for its Gherkin exist on disk/);
  assert.match(orchestrator, /Evidence in files, verdict in chat/);
});
