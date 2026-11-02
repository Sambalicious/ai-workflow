import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentFiles, priceCall, summarize, DEFAULT_PRICES } from './usage.mjs';
import { createRun, reduce, report } from '../../controller.mjs';
import { exampleInput, exampleEvents } from '../../example.mjs';

const prices = JSON.parse(await readFile(DEFAULT_PRICES, 'utf8'));
const cli = fileURLToPath(new URL('./usage.mjs', import.meta.url));

function call(id, usage, { model = 'claude-opus-5-5', toolUse } = {}) {
  const content = toolUse ? [{ type: 'tool_use', id: toolUse, name: 'Agent', input: {} }] : [{ type: 'text', text: 'ok' }];
  return JSON.stringify({ type: 'assistant', message: { id, model, content, usage } });
}
const cached = (input, output, read, h1, m5 = 0) => ({
  input_tokens: input, output_tokens: output, cache_read_input_tokens: read,
  cache_creation_input_tokens: h1 + m5,
  cache_creation: { ephemeral_1h_input_tokens: h1, ephemeral_5m_input_tokens: m5 },
  service_tier: 'standard', speed: 'standard',
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('repeated log lines for one call are counted once', () => {
  const line = call('msg_1', cached(1000, 500, 0, 0));
  const { usage, details } = summarize([{ path: 'a.jsonl', text: [line, line, line].join('\n') }], prices);
  assert.equal(details.calls, 1);
  assert.equal(usage.tokens, 1500);
  close(usage.cost_usd, 1000 * 4e-6 + 500 * 20e-6);
  assert.equal(usage.cost_complete, true);
  assert.equal(usage.reason, undefined);
});

test('every token kind uses its own published price', () => {
  // 1M of each kind on Opus 5.5: input 4 + output 20 + read 0.2 + 1h write 8 + 5m write 5.
  close(priceCall({ model: 'claude-opus-5-5', usage: cached(1e6, 1e6, 1e6, 1e6, 1e6) }, prices).cost, 37.2);
  // Sonnet 5.5 cache reads are 0.05x input.
  close(priceCall({ model: 'claude-sonnet-5-5', usage: cached(0, 0, 1e6, 0) }, prices).cost, 0.1);
  // Fast mode doubles Opus 5.5 prices, cache multipliers included.
  close(priceCall({ model: 'claude-opus-5-5', usage: { ...cached(1e6, 0, 1e6, 0), speed: 'fast' } }, prices).cost, 8.4);
  const search = { ...cached(0, 0, 0, 0), server_tool_use: { web_search_requests: 3 } };
  close(priceCall({ model: 'claude-opus-5-5', usage: search }, prices).cost, 0.03);
});

test('Haiku 5.5 prompts over 100K tokens use the higher tier, cache included', () => {
  close(priceCall({ model: 'claude-haiku-5-5', usage: cached(100000, 0, 0, 0) }, prices).cost, 0.01);
  close(priceCall({ model: 'claude-haiku-5-5', usage: cached(1, 0, 100000, 0) }, prices).cost, 0.5e-6 + 100000 * 0.05e-6);
});

test('calls that cannot be priced exactly make cost incomplete with a reason', () => {
  const cases = [
    [{ model: 'unknown-model' }, cached(1, 1, 0, 0), /No price for model unknown-model/],
    [{}, { ...cached(1, 1, 0, 0), service_tier: 'priority' }, /service tier priority/],
    [{}, { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 10 }, /no 5-minute\/1-hour split/],
    [{}, { ...cached(1, 1, 0, 0), iterations: [{ type: 'advisor_message' }] }, /advisor_message/],
    [{ model: 'claude-sonnet-5-5' }, { ...cached(1, 1, 0, 0), speed: 'fast' }, /No fast-mode price/],
  ];
  for (const [options, usage, reason] of cases) {
    const result = summarize([{ path: 'a.jsonl', text: call('m', usage, options) }], prices).usage;
    assert.equal(result.cost_complete, false);
    assert.match(result.reason, reason);
  }
  const unfinished = summarize([{ path: 'a.jsonl', text: call('m', cached(1, 1, 0, 0)), finished: false }], prices).usage;
  assert.match(unfinished.reason, /not finished/);
});

test('empty logs report unavailable instead of zero', () => {
  const { usage } = summarize([{ path: 'a.jsonl', text: '{"type":"user"}\nnot json\n' }], prices);
  assert.deepEqual(usage, { tokens: null, cost_usd: null, reason: 'No API calls found in the logs' });
});

test('--agent includes nested agents once and ignores unrelated siblings', async t => {
  const root = await mkdtemp(join(tmpdir(), 'claude-usage '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'project', 'session-1', 'subagents');
  await mkdir(directory, { recursive: true });
  const write = (name, lines, meta) => Promise.all([
    writeFile(join(directory, `agent-${name}.jsonl`), lines.join('\n')),
    writeFile(join(directory, `agent-${name}.meta.json`), JSON.stringify({ finished: true, ...meta })),
  ]);
  await write('role', [call('r1', cached(1000, 0, 0, 0), { toolUse: 'toolu_child' })], { toolUseId: 'toolu_role' });
  await write('child', [call('c1', cached(0, 1000, 0, 0), { toolUse: 'toolu_grandchild' })], { toolUseId: 'toolu_child' });
  await write('grandchild', [call('g1', cached(0, 0, 1000, 0))], { toolUseId: 'toolu_grandchild' });
  await write('sibling', [call('s1', cached(9e6, 0, 0, 0))], { toolUseId: 'toolu_other' });

  const files = await agentFiles('role', root);
  assert.deepEqual(files.map(f => f.path.split('agent-')[1]).sort(), ['child.jsonl', 'grandchild.jsonl', 'role.jsonl']);
  const result = spawnSync(process.execPath, [cli, '--agent', 'role', '--projects', root], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const usage = JSON.parse(result.stdout);
  assert.equal(usage.tokens, 3000);
  close(usage.cost_usd, 1000 * 4e-6 + 1000 * 20e-6 + 1000 * 0.2e-6);
  assert.match(usage.source_ref, /^claude-code-logs:sha256=[0-9a-f]{64};files=.*;prices=anthropic-api-/);

  await assert.rejects(agentFiles('../escape', root), /letters, digits/);
  await assert.rejects(agentFiles('missing', root), /No Claude Code log found/);
});

test('output is accepted by the controller as observed usage', () => {
  const { usage } = summarize([{ path: 'a.jsonl', text: call('m', cached(1000, 500, 0, 0)) }], prices);
  let state = createRun(exampleInput, { now: 1 });
  state = reduce(state, { ...exampleEvents.start, event_id: 'e1', expected_version: state.version }, { now: 2 });
  state = reduce(state, { ...exampleEvents.complete, event_id: 'e2', expected_version: state.version, usage }, { now: 3 });
  const costs = report(state, { now: 4 }).costs;
  close(costs.known_subtotal_usd, usage.cost_usd);
  assert.equal(costs.subtotal_is_partial, true);
  assert.equal(costs.unknown_attempts.length, 0);
});
