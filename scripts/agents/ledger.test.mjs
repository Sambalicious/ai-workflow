import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { caps, entryProblems, parseLedger } from './ledger.mjs';

const SCRIPT = fileURLToPath(new URL('./ledger.mjs', import.meta.url));
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const runIn = (cwd, args, env = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd, env: { ...process.env, ...env } });

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
  assert.deepEqual(summary.warnings, []);
});

test('the lifetime budget warns instead of refusing, so a busy run keeps its approved plan', () => {
  const entries = Array.from({ length: 9 }, (_, index) => entry({ role: `role-${index}`, state: 'done' }));
  const summary = caps(entries, { maxClaude: 8 });
  assert.equal(summary.claude, 9);
  assert.deepEqual(summary.problems, [], 'nine dispatches is a warning, not a refusal');
  assert.equal(summary.warnings.length, 1);
  assert.match(summary.warnings[0], /exceeds the lifetime budget of 8/);
  assert.deepEqual(caps(entries).warnings, [], 'the default budget is larger than a normal run');
  assert.equal(caps([...entries, ...entries], { maxClaude: 8 }).warnings.length, 1, 'a retry of the same role and artifact counts once');
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

test('add appends, check warns on the lifetime budget, and the concurrency cap still refuses', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-'));
  try {
    const receipt = (role) => writeFile(join(dir, `.preflight-${role}.json`), JSON.stringify({ role, at: new Date().toISOString() }));
    const add = (extra) => run(['add', '--run', dir, ...extra]);
    await receipt('spec-writer');
    await receipt('architect');
    assert.equal(add(['--round', '1', '--role', 'spec-writer', '--tier', 'lead', '--model', 'anthropic/claude-sonnet-5-5', '--artifact', 'specs/', '--state', 'done']).status, 0);
    assert.equal(add(['--round', '1', '--role', 'architect', '--tier', 'lead', '--model', 'anthropic/claude-sonnet-5-5', '--artifact', 'architecture.md', '--state', 'done']).status, 0);
    const warned = run(['check', '--run', dir, '--max-claude', '1']);
    assert.equal(warned.status, 0, 'the lifetime budget warns instead of refusing');
    assert.match(warned.stderr, /warning: 2 Claude dispatches exceeds the lifetime budget of 1/);

    await receipt('designer');
    await receipt('qa-gate');
    assert.equal(add(['--round', '2', '--role', 'designer', '--tier', 'advisor', '--model', 'anthropic/claude-opus-5-5', '--artifact', 'design.md', '--state', 'running']).status, 0);
    assert.equal(add(['--round', '2', '--role', 'qa-gate', '--tier', 'lead', '--model', 'anthropic/claude-sonnet-5-5', '--artifact', 'qa/', '--state', 'running']).status, 0);
    const over = add(['--round', '2', '--role', 'architect', '--tier', 'lead', '--model', 'anthropic/claude-sonnet-5-5', '--artifact', 'architecture.r1.md', '--state', 'running']);
    assert.equal(over.status, 1);
    assert.match(over.stderr, /3 Claude agents running exceeds the cap of 2/);
    const lines = (await readFile(join(dir, 'dispatch-ledger.jsonl'), 'utf8')).trim().split('\n');
    assert.equal(lines.length, 4, 'a refused dispatch is not written');
    const show = run(['show', '--run', dir]);
    assert.equal(show.status, 0);
    assert.match(show.stdout, /spec-writer \| lead/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a forced dispatch is recorded as forced, so a bypass stays visible', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-'));
  try {
    const args = ['add', '--run', dir, '--round', '1', '--role', 'spec-writer', '--tier', 'lead', '--model', 'anthropic/claude-sonnet-5-5', '--artifact', 'specs/', '--state', 'done'];
    assert.equal(run(args).status, 1, 'no receipt yet');
    assert.equal(run([...args, '--force']).status, 0);
    const entryLine = JSON.parse((await readFile(join(dir, 'dispatch-ledger.jsonl'), 'utf8')).trim());
    assert.equal(entryLine.forced, true);
    assert.equal(run(['check', '--run', dir]).status, 0, 'a forced entry is well formed');
    assert.match(run(['show', '--run', dir]).stdout, /done \(forced\)/);
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

test('fail closes a rate-limited entry as failed, records why, and frees the slot', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-'));
  try {
    const add = (role) => run(['add', '--run', dir, '--round', '1', '--role', role, '--tier', 'advisor', '--model', 'opus', '--artifact', 'a', '--state', 'running', '--force']);
    assert.equal(add('security-review').status, 0);
    assert.equal(add('code-review').status, 1, 'the advisor cap still holds while the first runs');
    const failed = run(['fail', '--run', dir, '--role', 'security-review', '--reason', 'rate_limit']);
    assert.equal(failed.status, 0, failed.stderr);
    assert.match(failed.stdout, /closed 1 security-review entry as failed \(rate_limit\)/);
    const [entryLine] = (await readFile(join(dir, 'dispatch-ledger.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(entryLine.state, 'failed');
    assert.equal(entryLine.reason, 'rate_limit');
    assert.match(run(['show', '--run', dir]).stdout, /security-review \| advisor \| opus \| a \| failed \(forced\) \(rate_limit\)/);
    assert.equal(add('code-review').status, 0, 'the same tier is free once the 429 is recorded');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fail needs a reason and a running entry, so a typo cannot pass as a recorded failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-'));
  try {
    assert.equal(run(['add', '--run', dir, '--round', '1', '--role', 'qa-gate', '--tier', 'lead', '--model', 'sonnet', '--artifact', 'qa/', '--state', 'running', '--force']).status, 0);
    const noReason = run(['fail', '--run', dir, '--role', 'qa-gate']);
    assert.equal(noReason.status, 1);
    assert.match(noReason.stderr, /fail --run <dir> --role <r> --reason <reason>/);
    assert.equal(run(['fail', '--run', dir, '--role', 'qa-gate', '--reason', 'Rate Limit']).status, 1);
    const wrongRole = run(['fail', '--run', dir, '--role', 'no-such-role', '--reason', 'rate_limit']);
    assert.equal(wrongRole.status, 1);
    assert.match(wrongRole.stderr, /no running no-such-role entry to fail/);
    assert.match(await readFile(join(dir, 'dispatch-ledger.jsonl'), 'utf8'), /qa-gate/);
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

async function ledgerDir(lines) {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-'));
  await writeFile(join(dir, 'dispatch-ledger.jsonl'), lines);
  return dir;
}
const good = (role, state) => `${JSON.stringify(entry({ role, state, tier: 'worker' }))}\n`;

test('a corrupt ledger line fails check and names the file', async () => {
  const dir = await ledgerDir(`${good('a', 'done')}{not json\n`);
  try {
    const result = run(['check', '--run', dir]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(join(dir, 'dispatch-ledger.jsonl')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('an unreadable ledger fails instead of reading as empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-'));
  try {
    await mkdir(join(dir, 'dispatch-ledger.jsonl'));
    const result = run(['check', '--run', dir]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('dispatch-ledger.jsonl'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('done closes one entry, keeps the other two, and leaves no temp file', async () => {
  const dir = await ledgerDir(good('a', 'done') + good('qa', 'running') + good('b', 'running'));
  try {
    assert.equal(run(['done', '--run', dir, '--role', 'qa']).status, 0);
    const lines = (await readFile(join(dir, 'dispatch-ledger.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => `${l.role}:${l.state}`), ['a:done', 'qa:done', 'b:running']);
    assert.deepEqual((await readdir(dir)).filter((f) => f.endsWith('.tmp')), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('done refuses a ledger with a corrupt line and leaves it untouched', async () => {
  const text = `${good('qa', 'running')}{bad\n`;
  const dir = await ledgerDir(text);
  try {
    assert.equal(run(['done', '--run', dir, '--role', 'qa']).status, 1);
    assert.equal(await readFile(join(dir, 'dispatch-ledger.jsonl'), 'utf8'), text);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

const project = async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ledger-project-'));
  const runDir = join(cwd, 'features', 'active', 'FEAT-0017-job-added-skills');
  await mkdir(runDir, { recursive: true });
  return { cwd, runDir };
};
const addArgs = (feature) => ['add', '--run', feature, '--round', '1', '--role', 'worker-impl', '--tier', 'worker', '--model', 'opencode-go/deepseek-v4.1-flash', '--artifact', 'code', '--state', 'done'];

test('a feature id resolves to its features/active folder instead of a new directory at the root', async () => {
  const { cwd, runDir } = await project();
  try {
    const result = runIn(cwd, addArgs('FEAT-0017-job-added-skills'));
    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(join(runDir, 'dispatch-ledger.jsonl'), 'utf8'), /worker-impl/);
    assert.deepEqual((await readdir(cwd)).filter((name) => name.startsWith('FEAT-')), [], 'no run directory at the project root');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('a feature prefix resolves when it names exactly one folder, and an unknown id fails without creating one', async () => {
  const { cwd, runDir } = await project();
  try {
    assert.equal(runIn(cwd, addArgs('FEAT-0017')).status, 0);
    assert.ok((await readdir(runDir)).includes('dispatch-ledger.jsonl'));
    const missing = runIn(cwd, addArgs('FEAT-9999-missing'));
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /matches no existing directory/);
    assert.ok(!(await readdir(cwd)).includes('FEAT-9999-missing'), 'the run directory is never created');
    assert.match(runIn(cwd, ['check', '--run', 'FEAT-9999-missing']).stderr, /matches no existing directory/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('RUN_ROOT resolves a feature id in an external run', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ledger-project-'));
  const RUN_ROOT = join(cwd, 'private-runs', 'run-001');
  const artifacts = join(RUN_ROOT, 'features', 'FEAT-0017-job-added-skills');
  await mkdir(artifacts, { recursive: true });
  try {
    assert.equal(runIn(cwd, addArgs('FEAT-0017-job-added-skills'), { RUN_ROOT }).status, 0);
    assert.ok((await readdir(RUN_ROOT)).includes('dispatch-ledger.jsonl'), 'the ledger lives in the run root');
    assert.deepEqual((await readdir(cwd)).filter((name) => name.startsWith('FEAT-')), [], 'no run directory in the project');
    assert.equal(runIn(cwd, addArgs('run-001'), { RUN_ROOT }).status, 0, 'the run root itself is named by its basename');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
