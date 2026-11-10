import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { caps, entryProblems, parseLedger } from './ledger.mjs';

const SCRIPT = fileURLToPath(new URL('./ledger.mjs', import.meta.url));
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

const entry = (overrides = {}) => ({ round: '1', role: 'gherkin', tier: 'lead', model: 'anthropic/claude-sonnet-5-5', artifact: 'gherkin/', state: 'done', ...overrides });

test('a well formed entry has no problems', () => {
  assert.deepEqual(entryProblems(entry()), []);
});

test('a missing field and a bad state are reported', () => {
  const problems = entryProblems({ round: '1', role: 'gherkin', tier: 'lead', model: 'x', artifact: '', state: 'pending' });
  assert.match(problems.join(' '), /missing artifact/);
  assert.match(problems.join(' '), /state must be one of/);
});

test('the Claude cap counts lead and advisor only', () => {
  const entries = [
    entry({ role: 'a', tier: 'lead' }),
    entry({ role: 'b', tier: 'advisor' }),
    entry({ role: 'c', tier: 'worker' }),
    entry({ role: 'd', tier: 'swarm' }),
  ];
  const summary = caps(entries, { maxClaude: 2, maxConcurrent: 2 });
  assert.equal(summary.claude, 2);
  assert.deepEqual(summary.problems, []);
  assert.equal(caps(entries, { maxClaude: 1, maxConcurrent: 2 }).problems.length, 1);
});

test('the concurrency cap counts running Claude agents only', () => {
  const entries = [entry({ role: 'a', state: 'running' }), entry({ role: 'b', state: 'running' }), entry({ role: 'c', state: 'running', tier: 'worker' })];
  assert.equal(caps(entries, { maxClaude: 8, maxConcurrent: 2 }).concurrent, 2);
  assert.equal(caps(entries, { maxClaude: 8, maxConcurrent: 1 }).problems.length, 1);
});

test('the ledger parser reports a broken line without dropping the rest', () => {
  const { entries, problems } = parseLedger(`${JSON.stringify(entry())}\nnot json\n${JSON.stringify(entry({ role: 'architect' }))}\n`);
  assert.equal(entries.length, 2);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /line 2: not JSON/);
});

test('add appends, check enforces the caps, show lists the rows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-'));
  try {
    const add = (extra) => run(['add', '--run', dir, ...extra]);
    assert.equal(add(['--round', '1', '--role', 'gherkin', '--tier', 'lead', '--model', 'anthropic/claude-sonnet-5-5', '--artifact', 'gherkin/', '--state', 'done']).status, 0);
    assert.equal(add(['--round', '1', '--role', 'architect', '--tier', 'lead', '--model', 'anthropic/claude-sonnet-5-5', '--artifact', 'architecture.md', '--state', 'done']).status, 0);
    assert.equal(run(['check', '--run', dir, '--max-claude', '2']).status, 0);
    const over = run(['add', '--run', dir, '--round', '2', '--role', 'designer', '--tier', 'advisor', '--model', 'anthropic/claude-opus-5-5', '--artifact', 'design.md', '--state', 'running', '--max-claude', '2']);
    assert.equal(over.status, 1);
    assert.match(over.stderr, /exceeds the cap of 2/);
    const lines = (await readFile(join(dir, 'dispatch-ledger.jsonl'), 'utf8')).trim().split('\n');
    assert.equal(lines.length, 2, 'a refused dispatch is not written');
    const show = run(['show', '--run', dir]);
    assert.equal(show.status, 0);
    assert.match(show.stdout, /gherkin \| lead/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
