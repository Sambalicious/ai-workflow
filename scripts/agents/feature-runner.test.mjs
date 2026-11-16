import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { featurePlan } from './feature-runner.mjs';
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

function fake({ blockOn, blockText = 'BLOCKER[product-manager]: which currency?\n', gates = {}, ahead = '1' } = {}) {
  const calls = [];
  const run = (bin, args, opts = {}) => {
    calls.push([bin, args, opts.cwd]);
    if (bin === 'opencode') return { status: 0, stdout: 'done', stderr: '' };
    if (bin === 'claude') {
      const prompt = args[1];
      const gate = ['QA', 'Security', 'Code review'].find((g) => prompt.includes(`independent ${g} reviewer`));
      if (gate) return { status: 0, stdout: gates[gate] ?? `${gate === 'QA' ? 'QA' : gate === 'Security' ? 'SECURITY' : 'REVIEW'} PASS\nok` };
      if (blockOn && prompt.includes(blockOn)) return { status: 0, stdout: blockText };
      return { status: 0, stdout: `doc for ${args[args.indexOf('--model') + 1]}` };
    }
    if (bin === 'git' && args.includes('rev-list')) return { status: 0, stdout: ahead };
    if (bin === 'gh') return { status: 0, stdout: 'https://github.com/o/r/pull/12\n' };
    if (bin === 'node' && args[0].endsWith('which-model.mjs')) return { status: 0, stdout: `model-${args[1]}\n` };
    return { status: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

const opts = (dir, reportPath, prdPath, run) => ({ id: 'o/r#12', packetPath: join(dir, 'packet.md'), projectRoot: '/proj', runRoot: dir, factoryRoot: '/factory', run, plan: (ctx) => featurePlan({ ...ctx, prdPath }) });
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

test('a failed gate halts the feature with no PR, and no triage report is needed', async () => {
  const { dir, reportPath, prdPath } = await setup();
  const f = fake({ gates: { 'Code review': 'REVIEW FINDINGS\nCR-1' } });
  try {
    const result = await fixRun(opts(dir, reportPath, prdPath, f.run));
    assert.deepEqual([result.status, result.stage], ['halted', 'code-review']);
    assert.ok(!f.calls.some(([bin]) => bin === 'gh'));
    const g = fake();
    const noReport = await fixRun({ ...opts(dir, reportPath, prdPath, g.run), reportPath: undefined });
    assert.equal(noReport.status, 'pr', 'a feature run needs no triage report');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a flagged design consult makes the designer revise the existing spec in place', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fp-'));
  try {
    const stage = () => featurePlan({ prdPath: '/p', wt: '/wt', factoryRoot: '/f', artifactsDir: dir }).stages.find((s) => s.role === 'designer-spec').prompt;
    assert.doesNotMatch(stage(), /Edit it in place/);
    await writeFile(join(dir, 'design-spec.md'), 'spec');
    await writeFile(join(dir, 'design-consult.md'), 'BLOCKER[designer]: gap');
    assert.match(stage(), /Edit it in place[\s\S]*design-consult\.md|design-consult\.md[\s\S]*Edit it in place/);
    await writeFile(join(dir, 'design-consult.md'), 'No gaps');
    assert.doesNotMatch(stage(), /Edit it in place/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a bold or quoted BLOCKER line also halts', async () => {
  for (const line of ['**BLOCKER[designer]: gap**', '> BLOCKER[designer]: gap', '- BLOCKER[designer]: gap']) {
    const { dir, reportPath, prdPath } = await setup();
    const f = fake({ blockOn: 'spec-writer.md', blockText: `intro\n${line}\n` });
    try {
      const result = await fixRun(opts(dir, reportPath, prdPath, f.run));
      assert.equal(result.status, 'halted', line);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});
