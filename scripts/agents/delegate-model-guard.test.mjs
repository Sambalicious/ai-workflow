import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { violation } from './delegate-model-guard.mjs';

const SCRIPT = fileURLToPath(new URL('./delegate-model-guard.mjs', import.meta.url));
const run = (input, env = {}) => spawnSync(process.execPath, [SCRIPT], { input, encoding: 'utf8', env: { ...process.env, ...env } });
const call = (role, providerInstanceId, model) => ({ role, target: { providerInstanceId, model } });

const FLASH = ['opencode', 'opencode-go/deepseek-v4.1-flash'];

test('Flash may take any role', () => {
  for (const role of ['implementation', 'test', 'research', 'general']) assert.equal(violation(call(role, ...FLASH)), null);
});

test('Sonnet is the lead tier and may take any role', () => {
  assert.equal(violation(call('implementation', 'claudeAgent', 'claude-sonnet-5-5')), null);
  assert.equal(violation(call('general', 'claudeProxy', 'claude-sonnet-5-5')), null);
});

test('Opus and Fable only take design, review and research', () => {
  for (const model of ['claude-opus-5-5', 'claude-fable-5-2']) {
    for (const role of ['design', 'review', 'research']) assert.equal(violation(call(role, 'claudeAgent', model)), null);
    for (const role of ['implementation', 'test', 'general']) assert.match(violation(call(role, 'claudeAgent', model)), /advisor tier/);
  }
});

test('DeepSeek V4 Pro, Haiku and an omitted target are blocked', () => {
  assert.match(violation(call('implementation', 'opencode', 'opencode-go/deepseek-v4-pro')), /not an approved target/);
  assert.match(violation(call('research', 'claudeAgent', 'claude-haiku-5-5')), /not an approved target/);
  assert.match(violation({ role: 'test' }), /no target/);
});

test('the hook exits 2 on a violation, 0 otherwise and for the override or bad JSON', () => {
  const bad = JSON.stringify({ tool_input: call('implementation', 'opencode', 'opencode-go/deepseek-v4-pro') });
  const good = JSON.stringify({ tool_input: call('implementation', ...FLASH) });
  assert.equal(run(bad).status, 2);
  assert.match(run(bad).stderr, /Blocked by AGENTS\.md model routing/);
  assert.equal(run(good).status, 0);
  assert.equal(run(bad, { EVE_ALLOW_LEAD: '1' }).status, 0);
  assert.equal(run('not json').status, 0);
});
