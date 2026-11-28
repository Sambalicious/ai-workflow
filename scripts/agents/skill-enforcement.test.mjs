import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { featurePlan } from './feature-runner.mjs';
import { fixRun } from './fix-runner.mjs';
import { REQUIRED, ROLE_SKILLS, requiredSkills, skillBlock, unreadSkills } from './skill-map.mjs';

const everything = (prompt) => `Skills read: ${prompt.match(/\S+\/\.agents\/skills\/\S+\.md/g)?.join(', ')}`;

// answer(session) returns the report for the nth session of its kind (opencode, or a gate or stage).
function harness(answer, { start = 0, commits = true } = {}) {
  const calls = [];
  let head = start;
  const seen = new Map();
  const run = (bin, args) => {
    calls.push([bin, args]);
    if (bin === 'opencode' || bin === 'claude') {
      const prompt = bin === 'opencode' ? args.at(-1) : args[1];
      const kind = bin === 'opencode' ? 'worker' : ['QA', 'Security', 'Code review'].find((g) => prompt.includes(`independent ${g} reviewer`)) ?? prompt.match(/\.agents\/([\w-]+)\.md/)?.[1] ?? 'stage';
      seen.set(kind, (seen.get(kind) ?? 0) + 1);
      if (bin === 'opencode' && commits) head += 1;
      const pass = { QA: 'QA PASS', Security: 'SECURITY PASS', 'Code review': 'REVIEW PASS' }[kind];
      const reply = answer({ kind, n: seen.get(kind), prompt }) ?? (prompt.includes('Skills read') ? everything(prompt) : '');
      return { status: 0, stdout: `${pass ? `${pass}\n` : ''}${reply}`, stderr: '' };
    }
    if (bin === 'git' && args.includes('rev-list')) return { status: 0, stdout: '1' };
    if (bin === 'git' && args.includes('rev-parse')) return { status: 0, stdout: `sha${head}` };
    if (bin === 'gh') return { status: 0, stdout: 'https://github.com/o/r/pull/9\n' };
    if (bin === 'node' && args[0].endsWith('which-model.mjs')) return { status: 0, stdout: `model-${args[1]}\n` };
    return { status: 0, stdout: '', stderr: '' };
  };
  const of = (bin) => calls.filter(([name]) => name === bin).map(([, args]) => args);
  return { run, of };
}

async function inRun(body) {
  const dir = await mkdtemp(join(tmpdir(), 'skills-'));
  const reportPath = join(dir, 'report.md');
  await writeFile(reportPath, 'Verdict: READY_BUG\n');
  const options = { id: 'o/r#7', reportPath, projectRoot: '/proj', runRoot: dir, factoryRoot: '/factory' };
  try { await body({ dir, options }); } finally { await rm(dir, { recursive: true, force: true }); }
}

const sessionOf = (args) => args[args.indexOf('--session') + 1];

test('required skills are mapped to their role and listed apart from the triggered ones', () => {
  for (const [role, skills] of Object.entries(REQUIRED)) {
    for (const skill of skills) assert.ok(ROLE_SKILLS[role].some(([name]) => name === skill), `${role} requires unmapped ${skill}`);
  }
  assert.deepEqual(requiredSkills(['backend-engineer', 'frontend-engineer']).sort(), ['clean-code/SKILL.md', 'principle-prove-it-works/SKILL.md', 'tdd/SKILL.md', 'unslop/SKILL.md']);
  assert.deepEqual(requiredSkills(['architect']), []);
  const block = skillBlock(['backend-engineer', 'frontend-engineer'], '/f');
  assert.match(block, /Required in every session[^\n]*\n- \/f\//);
  assert.equal(block.match(/unslop\/SKILL\.md/g).length, 1);
});

test('only the last "Skills read" statement counts, and a similar name does not', () => {
  const need = ['tdd/SKILL.md', 'clean-code/SKILL.md'];
  assert.deepEqual(unreadSkills('**Skills read:** /f/.agents/skills/tdd/SKILL.md, /f/.agents/skills/clean-code/SKILL.md', need), []);
  assert.deepEqual(unreadSkills('Skills read:\n- `tdd/SKILL.md`\n- `clean-code/SKILL.md`', need), []);
  assert.deepEqual(unreadSkills('I must read tdd/SKILL.md and clean-code/SKILL.md.\nSkills read: none (small change)', need), need);
  assert.deepEqual(unreadSkills('Skills read: /f/tdd/SKILL.md, /f/my-clean-code/SKILL.md', need), ['clean-code/SKILL.md']);
  assert.deepEqual(unreadSkills('done', need), need);
  assert.deepEqual(unreadSkills('done', []), []);
});

test('common report formatting counts, and a list that disclaims reading does not', () => {
  const need = ['tdd/SKILL.md', 'clean-code/SKILL.md'];
  for (const line of [
    'Skills read: **tdd/SKILL.md**, **clean-code/SKILL.md**',
    'Skills read: "tdd/SKILL.md", [clean-code](/f/skills/clean-code/SKILL.md)',
    'Skills read (2): /f/tdd/SKILL.md, /f/clean-code/SKILL.md',
    'Skills read: tdd, clean-code.',
    'Skills read: tdd,\nclean-code',
    '**Skills read:**\n\n1. tdd\n2. clean-code',
  ]) assert.deepEqual(unreadSkills(line, need), [], line);
  for (const line of [
    'Skills read: none (tdd/SKILL.md and clean-code/SKILL.md did not apply)',
    'Skills read:\n- none: tdd, clean-code did not apply',
  ]) assert.deepEqual(unreadSkills(line, need), need, line);
  for (const line of [
    'Skills read: /f/tdd/SKILL.md\n\nNot read: /f/clean-code/SKILL.md',
    'Skills read:\n- /f/tdd/SKILL.md\n\nSkipped: clean-code',
    'Skills read: /f/tdd/SKILL.md, clean-code-principles, /f/clean-code/reference.md',
  ]) assert.deepEqual(unreadSkills(line, need), ['clean-code/SKILL.md'], line);
  assert.deepEqual(unreadSkills('Skills read: impeccable', ['impeccable/reference/audit.md']), ['impeccable/reference/audit.md']);
});

test('a required file keeps the limit on how much of it to read', () => {
  assert.match(skillBlock(['security'], '/f'), /owasp-security\/SKILL\.md \(read only the sections for the surfaces in scope\)/);
});

test('a worker that skips a required skill gets one follow-up in the same session', () => inRun(async ({ dir, options }) => {
  const f = harness(({ kind, n, prompt }) => (kind === 'worker' && n === 1 ? everything(prompt).replace(/, \S+unslop\/SKILL\.md/, '') : kind === 'worker' ? 'Skills read: /factory/.agents/skills/unslop/SKILL.md' : null));
  const result = await fixRun({ ...options, run: f.run });
  assert.equal(result.status, 'pr');
  const [first, second, ...more] = f.of('opencode');
  assert.equal(more.length, 0);
  assert.match(sessionOf(first), /^ses_[0-9a-f]{24}$/);
  assert.equal(sessionOf(second), sessionOf(first));
  assert.match(second.at(-1), /\/factory\/\.agents\/skills\/unslop\/SKILL\.md/);
  assert.doesNotMatch(second.at(-1), /tdd\/SKILL\.md/);
  assert.match(await readFile(join(dir, 'reports', 'o_r_7.worker.md'), 'utf8'), /--- follow-up ---/);
}));

test('a worker that still skips it halts before any gate or push', () => inRun(async ({ options }) => {
  const f = harness(({ kind }) => (kind === 'worker' ? 'Skills read: none' : null));
  const result = await fixRun({ ...options, run: f.run });
  assert.deepEqual([result.status, result.stage], ['halted', 'worker']);
  assert.match(result.reason, /required skills not read: .*unslop/);
  assert.equal(f.of('opencode').length, 2);
  assert.equal(f.of('claude').length, 0);
  assert.equal(f.of('gh').length, 0);
}));

const ledgerCalls = (f) => f.of('node').filter((args) => args[0].endsWith('ledger.mjs')).map((args) => `${args[1]} ${args[args.indexOf('--role') + 1]}`);

test('a gate follow-up is recorded, keeps the first report and cannot rerun the checks', () => inRun(async ({ dir, options }) => {
  const f = harness(({ kind, n }) => (kind === 'QA' && n === 1 ? 'first evidence\nSkills read: none' : null));
  assert.equal((await fixRun({ ...options, run: f.run, qaTools: ['Bash(pnpm:*)'] })).status, 'pr');
  assert.deepEqual(ledgerCalls(f).filter((call) => call.endsWith('qa-gate')), ['add qa-gate', 'fail qa-gate', 'add qa-gate', 'done qa-gate']);
  const [first, second] = f.of('claude');
  assert.ok(first.includes('Bash(pnpm:*)'));
  assert.ok(!second.includes('Bash(pnpm:*)'));
  const attempt = join(dir, 'reports', 'o_r_7.qa-gate.attempt1.md');
  assert.ok(second[1].includes(attempt));
  assert.match(second[1], /do not run the project's checks again/);
  assert.match(await readFile(attempt, 'utf8'), /first evidence/);
  assert.match(await readFile(join(dir, 'logs', 'o_r_7.qa-gate.log'), 'utf8'), /first evidence[\s\S]*--- follow-up ---/);
}));

test('a passing gate without its required skill is rerun once, then halts', () => inRun(async ({ options }) => {
  const f = harness(({ kind }) => (kind === 'Security' ? 'Skills read: none' : null));
  const result = await fixRun({ ...options, run: f.run });
  assert.deepEqual([result.status, result.stage], ['halted', 'security-review']);
  assert.match(result.reason, /required skills not read: owasp-security/);
  assert.equal(f.of('claude').length, 3, 'QA, Security, Security follow-up');
  assert.equal(f.of('gh').length, 0);
}));

test('a gate that fixes its reading on the follow-up passes', () => inRun(async ({ options }) => {
  const f = harness(({ kind, n }) => (kind === 'Security' && n === 1 ? 'Skills read: none' : null));
  assert.equal((await fixRun({ ...options, run: f.run })).status, 'pr');
  assert.equal(f.of('claude').length, 4);
}));

test('a document stage that skips its required skill halts after one follow-up', () => inRun(async ({ dir, options }) => {
  const f = harness(({ kind }) => (kind === 'backend-engineer' ? 'Skills read: none' : null));
  const prdPath = join(dir, 'report.md');
  const result = await fixRun({ ...options, run: f.run, plan: (ctx) => featurePlan({ ...ctx, prdPath }) });
  assert.deepEqual([result.status, result.stage], ['halted', 'api-contract']);
  const [, again] = f.of('claude').filter((args) => args[1].includes('contract mode'));
  assert.equal(f.of('claude').filter((args) => args[1].includes('contract mode')).length, 2);
  assert.match(again[1], /api-contract\.attempt1\.md[\s\S]*complete corrected document/);
  assert.deepEqual(ledgerCalls(f).filter((call) => call.endsWith('api-contract')), ['add api-contract', 'fail api-contract', 'add api-contract', 'done api-contract']);
  assert.equal(f.of('opencode').length, 0);
}));

test('a repair halted for unread skills can be rerun without a new commit', () => inRun(async ({ dir, options }) => {
  await mkdir(join(dir, 'worktrees', 'o_r_7'), { recursive: true });
  const repair = { feedbackPath: join(dir, 'report.md'), wave: 1 };
  const skipped = harness(({ kind }) => (kind === 'worker' ? 'Skills read: none' : null));
  assert.match((await fixRun({ ...options, run: skipped.run, repair })).reason, /required skills not read/);
  // The fix is already committed, so the rerun adds nothing.
  const rerun = harness(() => null, { start: 1, commits: false });
  assert.equal((await fixRun({ ...options, run: rerun.run, repair })).status, 'repaired');
}));
