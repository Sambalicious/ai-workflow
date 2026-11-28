import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collect, render } from './factory-status.mjs';

test('status joins triage, run reports, progress and the ledger by ticket', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'status-'));
  try {
    await mkdir(join(dir, 'reports'), { recursive: true });
    await mkdir(join(dir, 'state', 'runs'), { recursive: true });
    await writeFile(join(dir, 'reports', 'o_r_1.md'), 'Verdict: READY_BUG');
    await writeFile(join(dir, 'reports', 'o_r_1.fix.md'), 'Status: pr\nurl: https://github.com/o/r/pull/9\n');
    await writeFile(join(dir, 'reports', 'o_r_1.qa-gate.md'), 'QA PASS');
    await writeFile(join(dir, 'reports', 'o_r_1.qa-gate.attempt1.md'), 'QA PASS');
    await writeFile(join(dir, 'reports', 'o_r_2.md'), 'Verdict: READY_BUG');
    await writeFile(join(dir, 'reports', 'o_r_2.fix.md'), 'Status: halted\nstage: security-review\nreason: SECURITY FINDINGS\n');
    await writeFile(join(dir, 'state', 'runs', 'o_r_2.json'), '{"done":["worker:implementation","gate:qa-gate"]}');
    await writeFile(join(dir, 'reports', 'o_r_3.md'), 'Verdict: NEEDS_INFO');
    await writeFile(join(dir, 'dispatch-ledger.jsonl'), `${JSON.stringify({ role: 'qa-gate', state: 'done' })}\n${JSON.stringify({ role: 'code-review', state: 'running' })}\n`);
    const data = await collect(dir);
    assert.deepEqual(data.tickets.map((t) => [t.ticket, t.status, t.pr]), [['o_r_1', 'pr', 'https://github.com/o/r/pull/9'], ['o_r_2', 'halted', null], ['o_r_3', 'triaged', null]]);
    assert.deepEqual(data.tickets[1].steps, ['worker:implementation', 'gate:qa-gate']);
    assert.deepEqual(data.running, ['code-review']);
    const text = render(data);
    assert.match(text, /stopped at security-review/);
    assert.match(text, /factory:retry/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a run root with no reports directory is an error that names the path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'status-'));
  try {
    await assert.rejects(collect(dir), (error) => error.message.includes(join(dir, 'reports')));
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./factory-status.mjs', import.meta.url)), '--run', dir], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(join(dir, 'reports')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a truncated ledger line or progress file is a row, not a crash', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'status-'));
  try {
    await mkdir(join(dir, 'reports'), { recursive: true });
    await mkdir(join(dir, 'state', 'runs'), { recursive: true });
    await writeFile(join(dir, 'reports', 'o_r_1.md'), 'Verdict: READY_BUG');
    await writeFile(join(dir, 'state', 'runs', 'o_r_1.json'), '{"done":[');
    await writeFile(join(dir, 'dispatch-ledger.jsonl'), `${JSON.stringify({ role: 'qa-gate', state: 'done' })}\n{"role":`);
    const text = render(await collect(dir));
    assert.match(text, /o_r_1\.json: invalid JSON/);
    assert.match(text, /dispatch-ledger\.jsonl line 2: invalid JSON/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
