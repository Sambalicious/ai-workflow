import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { draftPrd, featurePlan } from './feature-runner.mjs';
import { fixRun } from './fix-runner.mjs';

async function setup(verdict = 'READY_FEATURE') {
  const dir = await mkdtemp(join(tmpdir(), 'feat-'));
  const reportPath = join(dir, 'report.md');
  const prdPath = join(dir, 'prd.md');
  await writeFile(reportPath, `Triage\nVerdict: ${verdict}\n`);
  await writeFile(prdPath, '# PRD\n');
  await writeFile(join(dir, 'packet.md'), 'Title: Add export\n');
  return { dir, reportPath, prdPath };
}

function fake({ blockOn, gates = {}, ahead = '1' } = {}) {
  const calls = [];
  const run = (bin, args, opts = {}) => {
    calls.push([bin, args, opts.cwd]);
    if (bin === 'opencode') return { status: 0, stdout: 'done', stderr: '' };
    if (bin === 'claude') {
      const prompt = args[1];
      const gate = ['QA', 'Security', 'Code review'].find((g) => prompt.includes(`independent ${g} reviewer`));
      if (gate) return { status: 0, stdout: gates[gate] ?? `${gate === 'QA' ? 'QA' : gate === 'Security' ? 'SECURITY' : 'REVIEW'} PASS\nok` };
      if (blockOn && prompt.includes(blockOn)) return { status: 0, stdout: 'BLOCKER[product-manager]: which currency?\n' };
      return { status: 0, stdout: `doc for ${args[args.indexOf('--model') + 1]}` };
    }
    if (bin === 'git' && args.includes('rev-list')) return { status: 0, stdout: ahead };
    if (bin === 'gh') return { status: 0, stdout: 'https://github.com/o/r/pull/12\n' };
    if (bin === 'node' && args[0].endsWith('which-model.mjs')) return { status: 0, stdout: `model-${args[1]}\n` };
    return { status: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

const opts = (dir, reportPath, prdPath, run) => ({ id: 'o/r#12', reportPath, packetPath: join(dir, 'packet.md'), projectRoot: '/proj', runRoot: dir, factoryRoot: '/factory', run, plan: (ctx) => featurePlan({ ...ctx, prdPath }) });
const ledger = (calls, sub) => calls.filter(([bin, args]) => bin === 'node' && args[0].endsWith('ledger.mjs') && args[1] === sub);

test('approved PRD: five document stages, two worker passes, three gates, one PR, ledger always closed', async () => {
  const { dir, reportPath, prdPath } = await setup();
  const f = fake();
  try {
    const result = await fixRun(opts(dir, reportPath, prdPath, f.run));
    assert.equal(result.status, 'pr');
    const roles = ledger(f.calls, 'add').map(([, a]) => a[a.indexOf('--role') + 1]);
    assert.deepEqual(roles, ['spec-writer', 'architect', 'designer-spec', 'design-consult', 'api-contract', 'qa-gate', 'security-review', 'code-review']);
    assert.equal(ledger(f.calls, 'done').length, 8);
    assert.deepEqual(f.calls.filter(([bin]) => bin === 'opencode').map(([, a]) => a[a.indexOf('--title') + 1].split(' ').pop()), ['tests', 'implementation']);
    assert.equal(await readFile(join(dir, 'features', 'o_r_12', 'spec.md'), 'utf8'), 'doc for model-spec-writer');
    const architectPrompt = f.calls.find(([bin, a]) => bin === 'claude' && a[1].includes('architect.md'))[1][1];
    assert.match(architectPrompt, /spec\.md/, 'later stages receive the earlier documents');
    assert.match(result.url, /pull\/12/);
    assert.match(await readFile(join(dir, 'reports', 'o_r_12.pr-body.md'), 'utf8'), /Implements #12/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a BLOCKER line halts for a human before any worker or PR', async () => {
  const { dir, reportPath, prdPath } = await setup();
  const f = fake({ blockOn: 'architect.md' });
  try {
    const result = await fixRun(opts(dir, reportPath, prdPath, f.run));
    assert.deepEqual([result.status, result.stage], ['halted', 'architect']);
    assert.match(result.reason, /BLOCKER\[product-manager\]/);
    assert.ok(!f.calls.some(([bin]) => bin === 'opencode' || bin === 'gh'));
    assert.equal(ledger(f.calls, 'done').length, ledger(f.calls, 'add').length, 'no entry left running');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a failed gate halts the feature with no PR; a bug report is refused as a feature', async () => {
  const { dir, reportPath, prdPath } = await setup();
  const f = fake({ gates: { 'Code review': 'REVIEW FINDINGS\nCR-1' } });
  try {
    const result = await fixRun(opts(dir, reportPath, prdPath, f.run));
    assert.deepEqual([result.status, result.stage], ['halted', 'code-review']);
    assert.ok(!f.calls.some(([bin]) => bin === 'gh'));
    await writeFile(reportPath, 'Verdict: READY_BUG');
    const g = fake();
    assert.equal((await fixRun(opts(dir, reportPath, prdPath, g.run))).stage, 'precheck');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('draftPrd only drafts for READY_FEATURE reports and returns the printed PRD', async () => {
  const { dir, reportPath } = await setup();
  try {
    const out = await draftPrd({ id: 'o/r#12', reportPath, projectRoot: '/proj', runRoot: dir, run: () => ({ status: 0, stdout: '# PRD' }) });
    assert.deepEqual(out, { ok: true, prd: '# PRD' });
    await writeFile(reportPath, 'Verdict: BLOCKED');
    assert.equal((await draftPrd({ id: 'o/r#12', reportPath, projectRoot: '/proj', runRoot: dir, run: () => assert.fail('no') })).ok, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
