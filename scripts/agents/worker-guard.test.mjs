import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classify, isLeadTierModel, shouldWarn, warning } from './worker-guard.mjs';

const SCRIPT = fileURLToPath(new URL('./worker-guard.mjs', import.meta.url));

const run = (input) => spawnSync(process.execPath, [SCRIPT], { input, encoding: 'utf8' });

const hook = (tool, input) => ({ tool_name: tool, tool_input: input });

test('implementation prompt on sonnet warns with the worker reminder', () => {
  assert.equal(classify('Implement the retry queue for failed uploads'), 'implementation');
  const payload = hook('Agent', {
    model: 'sonnet',
    subagent_type: 'general-purpose',
    description: 'Retry queue',
    prompt: 'Implement the retry queue for failed uploads.',
  });
  assert.equal(shouldWarn(payload), true);

  const result = run(JSON.stringify(payload));
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
  const context = output.hookSpecificOutput.additionalContext;
  assert.match(context, /delegate_task/);
  assert.match(context, /deepseek-v4\.1-flash/);
  assert.match(context, /one failed Flash rewrite/);
  assert.match(context, /metrics\.md/);
  assert.equal(warning().hookSpecificOutput.hookEventName, 'PreToolUse');
});

test('omitted model warns because it inherits the lead model', () => {
  assert.equal(isLeadTierModel(undefined), true);
  const payload = hook('Agent', {
    description: 'Add feature',
    prompt: 'Refactor the upload pipeline and add feature flags.',
  });
  assert.equal(shouldWarn(payload), true);
  assert.match(run(JSON.stringify(payload)).stdout, /additionalContext/);
  assert.equal(shouldWarn(hook('Agent', { prompt: 'Implement the change' })), true);
});

test('design, QA, review and audit prompts stay silent', () => {
  for (const prompt of [
    'Design the session schema and write the ADR.',
    'Review this diff for correctness.',
    'Run QA on the Gherkin scenarios and report gaps.',
    'Audit the repo for stale dependencies.',
    'Advise on the migration plan.',
  ]) {
    assert.equal(shouldWarn(hook('Agent', { model: 'opus', prompt })), false, prompt);
  }
  assert.equal(shouldWarn(hook('Agent', {
    model: 'sonnet',
    prompt: 'Review the auth refactor for security issues and audit the QA plan.',
  })), false);
});

test('haiku explore does not warn', () => {
  const payload = hook('Agent', {
    model: 'haiku',
    subagent_type: 'Explore',
    description: 'Search call sites',
    prompt: 'Search the repo for implement and fix call sites.',
  });
  assert.equal(shouldWarn(payload), false);
  assert.equal(run(JSON.stringify(payload)).stdout, '');
});

test('non-Agent tools do not warn', () => {
  assert.equal(shouldWarn(hook('Bash', { model: 'sonnet', prompt: 'Implement the fix' })), false);
  assert.equal(shouldWarn(hook('Edit', { command: 'node scripts/x.mjs' })), false);
  assert.equal(run(JSON.stringify(hook('Bash', { prompt: 'Implement the fix' }))).stdout, '');
});

test('bad or empty input never throws', () => {
  for (const input of ['', '   ', 'not json at all', '{"tool_name":"Agent",', 'null', '[]', '{"tool_input":{}}']) {
    const result = run(input);
    assert.equal(result.status, 0, `stdin: ${input}`);
    assert.equal(result.stdout, '', `stdin: ${input}`);
  }
  for (const payload of [null, undefined, {}, [], { tool_name: 'Agent' }, { tool_name: 'Agent', tool_input: null }]) {
    assert.doesNotThrow(() => shouldWarn(payload));
    assert.equal(shouldWarn(payload), false);
  }
  assert.equal(classify(undefined), 'other');
});
