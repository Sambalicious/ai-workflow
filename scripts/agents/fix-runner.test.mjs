import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fixRun, gateVerdict, parseRepo, slugOf } from './fix-runner.mjs';

async function setup(verdict = 'READY_BUG') {
  const dir = await mkdtemp(join(tmpdir(), 'fix-'));
  const reportPath = join(dir, 'report.md');
  await writeFile(reportPath, `Triage\n**Verdict: ${verdict}**\n`);
  await writeFile(join(dir, 'packet.md'), 'Title: Restore fails\n');
  return { dir, reportPath };
}

// A fake process runner that records calls and answers by command.
function fake({ gates = {}, workerStatus = 0, ahead = '1' } = {}) {
  const calls = [];
  const run = (bin, args, opts = {}) => {
    calls.push([bin, args, opts.cwd]);
    if (bin === 'opencode') return { status: workerStatus, stdout: 'done', stderr: '' };
    if (bin === 'claude') {
      const role = ['QA', 'Security', 'code'].find((r) => args[1].includes(`independent ${r === 'code' ? 'Code review' : r}`));
      return { status: 0, stdout: gates[role] ?? { QA: 'QA PASS\nok', Security: 'SECURITY PASS\nok', code: 'REVIEW PASS\nok' }[role] };
    }
    if (bin === 'git' && args.includes('rev-list')) return { status: 0, stdout: ahead };
    if (bin === 'gh') return { status: 0, stdout: 'https://github.com/o/r/pull/9\n' };
    if (bin === 'node' && args[0].endsWith('which-model.mjs')) return { status: 0, stdout: `model-${args[1]}\n` };
    return { status: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

const base = (dir, reportPath, run) => ({ id: 'o/r#7', reportPath, packetPath: join(dir, 'packet.md'), projectRoot: '/proj', runRoot: dir, factoryRoot: '/factory', run });

test('helpers', () => {
  assert.equal(slugOf('o/r#7'), 'o_r_7');
  assert.deepEqual(parseRepo('o/r#7'), { repo: 'o/r', number: 7 });
  assert.equal(parseRepo('o/projects/3:o/r#7'), null);
  assert.equal(gateVerdict('\nQA PASS\nx', { pass: 'QA PASS' }).pass, true);
  assert.equal(gateVerdict('Security findings: QA PASS earlier', { pass: 'QA PASS' }).pass, false);
  assert.equal(gateVerdict('REVIEW FINDINGS\n', { pass: 'REVIEW PASS' }).pass, false);
  assert.equal(gateVerdict('', { pass: 'QA PASS' }).pass, false);
});

test('all gates pass: serial gates, ledger closed each time, one PR, no merge', async () => {
  const { dir, reportPath } = await setup();
  const f = fake();
  try {
    const result = await fixRun(base(dir, reportPath, f.run));
    assert.equal(result.status, 'pr');
    assert.equal(result.url, 'https://github.com/o/r/pull/9');
    const cmds = f.calls.map(([bin, args]) => `${bin} ${args.slice(0, 3).join(' ')}`);
    assert.ok(cmds.some((c) => c.startsWith('opencode run -m model-worker')));
    assert.equal(f.calls.filter(([bin]) => bin === 'claude').length, 3);
    assert.equal(f.calls.filter(([bin, args]) => bin === 'node' && args[0].endsWith('ledger.mjs') && args[1] === 'done').length, 3);
    assert.ok(!f.calls.some(([bin, args]) => bin === 'gh' && args.includes('merge')));
    const claudeCwd = f.calls.filter(([bin]) => bin === 'claude').map((c) => c[2]);
    assert.ok(claudeCwd.every((cwd) => cwd.endsWith('worktrees/o_r_7')));
    const body = await readFile(join(dir, 'reports', 'o_r_7.pr-body.md'), 'utf8');
    assert.match(body, /Fixes #7/);
    const pr = f.calls.find(([bin]) => bin === 'gh');
    assert.ok(pr[1].includes('fix: Restore fails'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a failing gate halts for a human: no later gate, no push, no PR', async () => {
  const { dir, reportPath } = await setup();
  const f = fake({ gates: { Security: 'SECURITY FINDINGS\nS1 high' } });
  try {
    const result = await fixRun(base(dir, reportPath, f.run));
    assert.equal(result.status, 'halted');
    assert.equal(result.stage, 'security-review');
    assert.equal(f.calls.filter(([bin]) => bin === 'claude').length, 2);
    assert.ok(!f.calls.some(([bin, args]) => bin === 'gh' || (bin === 'git' && args.includes('push'))));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a worker with no commit halts before any gate', async () => {
  const { dir, reportPath } = await setup();
  const f = fake({ ahead: '0' });
  try {
    const result = await fixRun(base(dir, reportPath, f.run));
    assert.deepEqual([result.status, result.stage], ['halted', 'worker']);
    assert.ok(!f.calls.some(([bin]) => bin === 'claude'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('only READY_BUG reports run; bad ids and relative paths are refused', async () => {
  const { dir, reportPath } = await setup('BLOCKED');
  const f = fake();
  try {
    const result = await fixRun(base(dir, reportPath, f.run));
    assert.equal(result.stage, 'precheck');
    assert.equal(f.calls.length, 0);
    await assert.rejects(fixRun({ ...base(dir, reportPath, f.run), id: 'nope' }), /owner\/name#number/);
    await assert.rejects(fixRun({ ...base(dir, reportPath, f.run), runRoot: 'rel' }), /absolute/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a resumed run skips finished steps and runs the one that stopped it', async () => {
  const { dir, reportPath } = await setup();
  try {
    const first = fake({ gates: { Security: 'SECURITY FINDINGS\n1 high' } });
    const halted = await fixRun(base(dir, reportPath, first.run));
    assert.equal(halted.stage, 'security-review');
    // The worktree is a real directory only once something creates it; the fake git does not.
    await mkdir(join(dir, 'worktrees', 'o_r_7'), { recursive: true });
    const refused = await fixRun(base(dir, reportPath, fake().run));
    assert.match(refused.reason, /--resume/);
    const second = fake();
    const done = await fixRun({ ...base(dir, reportPath, second.run), resume: true });
    assert.equal(done.status, 'pr');
    assert.equal(second.calls.filter((c) => c[0] === 'opencode').length, 0);
    const claudes = second.calls.filter((c) => c[0] === 'claude').length;
    assert.equal(claudes, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a repair wave runs one worker and the gates again, then pushes without a new PR', async () => {
  const { dir, reportPath } = await setup();
  try {
    const first = fake();
    const pr = await fixRun(base(dir, reportPath, first.run));
    assert.equal(pr.status, 'pr');
    await mkdir(join(dir, 'worktrees', 'o_r_7'), { recursive: true });
    await writeFile(join(dir, 'feedback.md'), '# Feedback');
    const calls = [];
    let heads = 0;
    const run = (bin, args, opts) => {
      calls.push([bin, args]);
      if (bin === 'git' && args.includes('rev-parse')) return { status: 0, stdout: `sha${heads++}\n` };
      return fake().run(bin, args, opts);
    };
    const done = await fixRun({ ...base(dir, reportPath, run), repair: { feedbackPath: join(dir, 'feedback.md'), wave: 1 } });
    assert.equal(done.status, 'repaired');
    const workers = calls.filter((c) => c[0] === 'opencode');
    assert.equal(workers.length, 1);
    assert.match(workers[0][1].at(-1), /Repair wave 1/);
    assert.equal(calls.filter((c) => c[0] === 'claude').length, 3);
    assert.equal(calls.filter((c) => c[0] === 'gh').length, 0);
    const none = await fixRun({ ...base(dir, reportPath, fake().run), repair: { feedbackPath: '/x', wave: 1 }, id: 'o/r#8' });
    assert.equal(none.stage, 'repair');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
