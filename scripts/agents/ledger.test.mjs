import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { caps, entryProblems, parseLedger } from './ledger.mjs';

const SCRIPT = fileURLToPath(new URL('./ledger.mjs', import.meta.url));
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

const entry = (overrides = {}) => ({ round: '1', role: 'spec-writer', tier: 'lead', model: 'anthropic/claude-sonnet-5-5', artifact: 'specs/', state: 'done', ...overrides });

test('a well formed entry has no problems', () => {
  assert.deepEqual(entryProblems(entry()), []);
});

test('a missing field and a bad state are reported', () => {
  const problems = entryProblems({ round: '1', role: 'spec-writer', tier: 'lead', model: 'x', artifact: '', state: 'pending' });
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

test('one advisor session runs at a time, so a parallel [7] and [8] fails', () => {
  const parallelGates = [
    entry({ role: 'security-review', tier: 'advisor', state: 'running' }),
    entry({ role: 'code-review', tier: 'advisor', state: 'running' }),
  ];
  const summary = caps(parallelGates, { maxClaude: 8, maxConcurrent: 2 });
  assert.equal(summary.advisorConcurrent, 2);
  assert.match(summary.problems.join(' '), /2 advisor agents running exceeds the cap of 1/);

  const serialized = [parallelGates[0], { ...parallelGates[1], state: 'done' }];
  assert.equal(caps(serialized, { maxClaude: 8, maxConcurrent: 2 }).advisorConcurrent, 1);
  assert.deepEqual(caps(serialized, { maxClaude: 8, maxConcurrent: 2 }).problems, []);
});

test('a lead session and an advisor session may run together', () => {
  const entries = [
    entry({ role: 'qa-gate', tier: 'lead', state: 'running' }),
    entry({ role: 'designer-review', tier: 'lead', state: 'running' }),
    entry({ role: 'security-review', tier: 'advisor', state: 'running' }),
  ];
  assert.deepEqual(caps(entries, { maxClaude: 8, maxConcurrent: 3 }).problems, []);
});

test('the cap counts advisor consults, not only the gates', () => {
  const entries = [
    entry({ role: 'security-review', tier: 'advisor', state: 'running' }),
    entry({ role: 'advisor-consult', tier: 'advisor', state: 'running' }),
  ];
  assert.match(caps(entries, { maxClaude: 8, maxConcurrent: 2 }).problems.join(' '), /advisor agents running exceeds/);
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
    const receipt = (role) => writeFile(join(dir, `.preflight-${role}.json`), JSON.stringify({ role, at: new Date().toISOString() }));
    const add = (extra) => run(['add', '--run', dir, ...extra]);
    await receipt('spec-writer');
    await receipt('architect');
    assert.equal(add(['--round', '1', '--role', 'spec-writer', '--tier', 'lead', '--model', 'anthropic/claude-sonnet-5-5', '--artifact', 'specs/', '--state', 'done']).status, 0);
    assert.equal(add(['--round', '1', '--role', 'architect', '--tier', 'lead', '--model', 'anthropic/claude-sonnet-5-5', '--artifact', 'architecture.md', '--state', 'done']).status, 0);
    assert.equal(run(['check', '--run', dir, '--max-claude', '2']).status, 0);
    await receipt('designer');
    const over = run(['add', '--run', dir, '--round', '2', '--role', 'designer', '--tier', 'advisor', '--model', 'anthropic/claude-opus-5-5', '--artifact', 'design.md', '--state', 'running', '--max-claude', '2']);
    assert.equal(over.status, 1);
    assert.match(over.stderr, /exceeds the cap of 2/);
    const lines = (await readFile(join(dir, 'dispatch-ledger.jsonl'), 'utf8')).trim().split('\n');
    assert.equal(lines.length, 2, 'a refused dispatch is not written');
    const show = run(['show', '--run', dir]);
    assert.equal(show.status, 0);
    assert.match(show.stdout, /spec-writer \| lead/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a Claude dispatch without a preflight receipt is refused, and --force overrides it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-'));
  try {
    const args = ['add', '--run', dir, '--round', '1', '--role', 'spec-writer', '--tier', 'lead', '--model', 'anthropic/claude-sonnet-5-5', '--artifact', 'specs/', '--state', 'done'];
    const refused = run(args);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /no fresh preflight receipt for spec-writer/);
    assert.equal(run([...args, '--force']).status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('done closes a role\'s running entries so the concurrency cap frees up', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-'));
  try {
    const add = (role) => run(['add', '--run', dir, '--round', '1', '--role', role, '--tier', 'advisor', '--model', 'opus', '--artifact', 'a', '--state', 'running', '--force']);
    assert.equal(add('security-review').status, 0);
    assert.equal(add('code-review').status, 1, 'second advisor refused while the first runs');
    const closed = run(['done', '--run', dir, '--role', 'security-review']);
    assert.equal(closed.status, 0);
    assert.match(closed.stdout, /closed 1 security-review entry as done/);
    assert.equal(add('code-review').status, 0);
    assert.match(run(['show', '--run', dir]).stdout, /security-review \| advisor \| opus \| a \| done/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a retry of the same role on the same artifact counts once toward the cap', () => {
  const attempt = (state) => ({ round: '1', role: 'designer-spec', tier: 'lead', model: 'sonnet', artifact: 'design-spec.md', state });
  const other = { round: '1', role: 'architect', tier: 'lead', model: 'sonnet', artifact: 'architecture.md', state: 'done' };
  const summary = caps([attempt('done'), attempt('failed'), attempt('done'), other], { maxClaude: 2, maxConcurrent: 2 });
  assert.equal(summary.claude, 2);
  assert.deepEqual(summary.problems, []);
});
