import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reviewProblems, verdictOf } from './pr-gate.mjs';

const SCRIPT = fileURLToPath(new URL('./pr-gate.mjs', import.meta.url));
const runIn = (cwd, args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd });
const HEAD = 'a'.repeat(40);

const report = (verdict) => `# Code review\n\n### Verdict and scope\n${verdict}\n\n### TL;DR\n${verdict}\n`;

test('a verdict line is read in the forms a review report uses', () => {
  assert.equal(verdictOf('Verdict: PASS\n'), 'PASS');
  assert.equal(verdictOf('**Verdict:** CHANGES_REQUIRED\n'), 'CHANGES_REQUIRED');
  assert.equal(verdictOf('### Verdict - BLOCKED\n'), 'BLOCKED');
  assert.equal(verdictOf(report('PASS')), 'PASS');
  assert.equal(verdictOf('# Review\nNo findings.\n'), null);
});

test('only a PASS lets the pull request open', () => {
  const at = { head: HEAD, report: `/run/reports/code-review-${HEAD}.md`, others: [] };
  assert.deepEqual(reviewProblems({ ...at, text: report('PASS') }), []);
  assert.match(reviewProblems({ ...at, text: report('CHANGES_REQUIRED') })[0], /states CHANGES_REQUIRED; a pull request needs PASS/);
  assert.match(reviewProblems({ ...at, text: report('BLOCKED') })[0], /states BLOCKED/);
  assert.match(reviewProblems({ ...at, text: 'no verdict here' })[0], /states no verdict line/);
});

test('a missing review names the path it expected and the reviews that do exist', () => {
  const problems = reviewProblems({ head: HEAD, report: '/run/reports/code-review-aaa.md', text: null, others: ['code-review-bbb.md'] });
  assert.match(problems[0], /no code review for a{40}/);
  assert.match(problems[0], /code-review-bbb\.md/, 'a stale review is visible in the refusal');
});

test('the gate passes on a PASS report for the head and refuses every other state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pr-gate-'));
  try {
    const reports = join(dir, 'reports');
    await mkdir(reports, { recursive: true });
    const missing = runIn(dir, ['--run', dir, '--head', HEAD]);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, new RegExp(`pr-gate: no code review for ${HEAD}: expected ${reports}/code-review-${HEAD}.md`));

    await writeFile(join(reports, `code-review-${HEAD}.md`), report('CHANGES_REQUIRED'));
    const refused = runIn(dir, ['--run', dir, '--head', HEAD]);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /states CHANGES_REQUIRED/);

    await writeFile(join(reports, `code-review-${HEAD}.md`), report('PASS'));
    const passed = runIn(dir, ['--run', dir, '--head', HEAD]);
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, new RegExp(`pr-gate: PASS on ${HEAD}`));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the head is read from the branch, so a review of an earlier candidate cannot pass', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'pr-gate-repo-'));
  try {
    const git = (...args) => {
      const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'qa@example.com');
    git('config', 'user.name', 'QA');
    git('config', 'commit.gpgsign', 'false');
    await writeFile(join(repo, 'file.txt'), 'x\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    const head = git('rev-parse', 'HEAD');
    const reports = join(repo, 'run', 'reports');
    await mkdir(reports, { recursive: true });
    await writeFile(join(reports, 'code-review-stale.md'), report('PASS'));

    const stale = runIn(repo, ['--run', join(repo, 'run')]);
    assert.equal(stale.status, 1, 'only the head commit counts');
    assert.match(stale.stderr, new RegExp(head));

    await writeFile(join(reports, `code-review-${head}.md`), report('PASS'));
    assert.equal(runIn(repo, ['--run', join(repo, 'run')]).status, 0);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test('usage fails without a run, and an unknown run is named rather than created', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pr-gate-'));
  try {
    assert.equal(runIn(dir, ['--head', HEAD]).status, 1);
    const unknown = runIn(dir, ['--run', 'FEAT-9999-missing', '--head', HEAD]);
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /matches no existing directory/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
