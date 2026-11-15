import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolveModel } from './which-model.mjs';

const SCRIPT = fileURLToPath(new URL('./which-model.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

const MODELS = {
  tiers: { lead: 'lead prose', advisor: 'advisor prose', swarm: 'swarm prose', worker: 'worker prose' },
  clients: {
    opencode: { lead: 'anthropic/claude-sonnet-5-5', advisor: 'anthropic/claude-opus-5-5', swarm: 'opencode-go/deepseek-v4.1-flash', worker: 'opencode-go/deepseek-v4.1-flash' },
    'claude-code': { lead: 'sonnet', advisor: 'opus', swarm: 'haiku', worker: 'opencode-go/deepseek-v4.1-flash' },
  },
  roles: { 'product-manager': 'lead', 'spec-writer': 'lead', 'api-contract': 'advisor', 'code-review': 'advisor', explore: 'swarm', audit: 'swarm' },
};

test('a role resolves through its tier to the client model', () => {
  assert.deepEqual(resolveModel(MODELS, 'spec-writer', 'opencode'), { question: 'spec-writer', tier: 'lead', client: 'opencode', model: 'anthropic/claude-sonnet-5-5' });
  assert.equal(resolveModel(MODELS, 'api-contract', 'opencode').model, 'anthropic/claude-opus-5-5');
  assert.equal(resolveModel(MODELS, 'explore', 'opencode').model, 'opencode-go/deepseek-v4.1-flash');
});

test('a tier name resolves too, so a section with no role can still be pinned', () => {
  assert.equal(resolveModel(MODELS, 'worker', 'opencode').model, 'opencode-go/deepseek-v4.1-flash');
});

test('the claude-code client maps the same role to its own model', () => {
  assert.equal(resolveModel(MODELS, 'spec-writer', 'claude-code').model, 'sonnet');
});

test('an unknown role fails loudly and lists what is known', () => {
  assert.throws(() => resolveModel(MODELS, 'spec-writter', 'opencode'), /unknown role or tier "spec-writter"\. Known: .*spec-writer/);
});

test('an unknown client fails loudly', () => {
  assert.throws(() => resolveModel(MODELS, 'spec-writer', 'cursor'), /unknown client "cursor"/);
});

test('a client without a model for the tier fails instead of returning nothing', () => {
  const partial = { ...MODELS, clients: { opencode: { lead: 'anthropic/claude-sonnet-5-5' } } };
  assert.throws(() => resolveModel(partial, 'api-contract', 'opencode'), /no model for tier "advisor"/);
});

test('the script prints the model and exits 0', () => {
  const result = run('spec-writer');
  assert.equal(result.status, 0);
  assert.match(result.stdout.trim(), /^sonnet$/);
});

test('the script exits 1 with nothing on stdout for an unknown role', () => {
  const result = run('not-a-role');
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /which-model: unknown role or tier/);
});

test('the real models.json resolves every documented role', async () => {
  const models = JSON.parse(await readFile(new URL('../../.agents/models.json', import.meta.url), 'utf8'));
  for (const role of Object.keys(models.roles)) {
    for (const client of Object.keys(models.clients)) {
      const { model } = resolveModel(models, role, client);
      assert.ok(model, `${role} on ${client}`);
    }
  }
});
