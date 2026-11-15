import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collect, render } from './factory-status.mjs';

test('status joins triage, run reports, progress and the ledger by ticket', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'status-'));
  try {
    await mkdir(join(dir, 'reports'), { recursive: true });
    await mkdir(join(dir, 'state', 'runs'), { recursive: true });
    await writeFile(join(dir, 'reports', 'o_r_1.md'), 'Verdict: READY_BUG');
    await writeFile(join(dir, 'reports', 'o_r_1.fix.md'), 'Status: pr\nurl: https://github.com/o/r/pull/9\n');
    await writeFile(join(dir, 'reports', 'o_r_1.qa-gate.md'), 'QA PASS');
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

test('an empty run root reports nothing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'status-'));
  try { assert.deepEqual(await collect(dir), { tickets: [], dispatches: 0, running: [] }); } finally { await rm(dir, { recursive: true, force: true }); }
});
