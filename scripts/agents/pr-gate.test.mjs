import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reviewProblems, verdictOf, verdictsOf } from './pr-gate.mjs';

const SCRIPT = fileURLToPath(new URL('./pr-gate.mjs', import.meta.url));
const runIn = (cwd, args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd });
const HEAD = 'a'.repeat(40);

const report = (verdict, head = HEAD) =>
  `# Code review\n\n### Verdict and scope\nVerdict: ${verdict}\n\nReviewed head ${head}.\n\n### TL;DR\nNothing else to add.\n`;

test('a verdict line is read in the forms a review report uses', () => {
  assert.equal(verdictOf('Verdict: PASS\n'), 'PASS');
  assert.equal(verdictOf('**Verdict:** CHANGES_REQUIRED\n'), 'CHANGES_REQUIRED');
  assert.equal(verdictOf('### Verdict - BLOCKED\n'), 'BLOCKED');
  assert.equal(verdictOf(report('PASS')), 'PASS');
  assert.equal(verdictOf('# Review\nNo findings.\n'), null);
  assert.equal(verdictOf('### Verdict and scope\nPASS\n'), 'PASS', 'a bare value under the verdict heading is a verdict');
});

test('a template, a mixed report and a fenced example are not a PASS (H3)', () => {
  const cases = [
    'Verdict: PASS|CHANGES_REQUIRED|BLOCKED\n',
    'Verdict: PASS / CHANGES_REQUIRED / BLOCKED\n',
    'Verdict: PASS — not yet; 2 High open\n',
    'Verdict: PASS\nVerdict: CHANGES_REQUIRED\n',
    '## Layer web\nVerdict: PASS\n## Layer api\nVerdict: CHANGES_REQUIRED\n',
    'No verdict here.\n\n```\nPASS\n```\n',
    'No verdict here.\n\n```text\nPASS\n```\n',
  ];
  for (const text of cases) {
    assert.notEqual(verdictOf(text), 'PASS', JSON.stringify(text));
  }
  assert.equal(verdictOf('Verdict: PASS|CHANGES_REQUIRED|BLOCKED\n'), null, 'an unfilled template states no verdict');
  assert.equal(verdictsOf('## Layer web\nVerdict: PASS\n## Layer api\nVerdict: CHANGES_REQUIRED\n').length, 2);
});

test('only one clear PASS lets the pull request open', () => {
  const at = { head: HEAD, report: `/run/reports/code-review-${HEAD}.md`, others: [] };
  assert.deepEqual(reviewProblems({ ...at, text: report('PASS') }), []);
  assert.match(reviewProblems({ ...at, text: report('CHANGES_REQUIRED') })[0], /states CHANGES_REQUIRED; a pull request needs one clear PASS/);
  assert.match(reviewProblems({ ...at, text: report('BLOCKED') })[0], /states BLOCKED/);
  assert.match(reviewProblems({ ...at, text: 'no verdict here' })[0], /states no verdict line/);
  assert.match(reviewProblems({ ...at, text: 'Verdict: PASS|CHANGES_REQUIRED|BLOCKED\n' })[0], /states no verdict line/);
  assert.match(
    reviewProblems({ ...at, text: '## Layer web\nVerdict: PASS\n## Layer api\nVerdict: CHANGES_REQUIRED\n' })[0],
    /states CHANGES_REQUIRED/,
    'one layer rejecting blocks the pull request',
  );
});

test('the review must name the head sha it reviewed (H4)', () => {
  const at = { head: HEAD, report: `/run/reports/code-review-${HEAD}.md`, others: [] };
  const unnamed = reviewProblems({ ...at, text: '### Verdict and scope\nVerdict: PASS\n' });
  assert.equal(unnamed.length, 1);
  assert.match(unnamed[0], /does not name the reviewed commit a{40}/);

  const otherHead = reviewProblems({ ...at, text: report('PASS', 'b'.repeat(40)) });
  assert.equal(otherHead.length, 1);
  assert.match(otherHead[0], /does not name the reviewed commit a{40}/, 'naming another head does not name this one');
});

test('a missing review names the path it expected and the reviews that do exist', () => {
  const problems = reviewProblems({ head: HEAD, report: '/run/reports/code-review-aaa.md', text: null, others: ['code-review-bbb.md'] });
  assert.match(problems[0], /no code review for a{40}/);
  assert.match(problems[0], /code-review-bbb\.md/, 'a stale review is visible in the refusal');
});

test('the gate passes on a PASS report for the head and refuses every other state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pr-gate-'));
  try {
    const { git } = gitRepo(dir);
    await writeFile(join(dir, 'file.txt'), 'x\n');
    git('add', 'file.txt');
    git('commit', '-q', '-m', 'head');
    const head = git('rev-parse', 'HEAD');
    const reports = join(dir, 'reports');
    await mkdir(reports, { recursive: true });
    const missing = runIn(dir, ['--run', dir, '--head', head]);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, new RegExp(`pr-gate: no code review for ${head}: expected ${reports}/code-review-${head}.md`));

    await writeFile(join(reports, `code-review-${head}.md`), report('CHANGES_REQUIRED', head));
    const refused = runIn(dir, ['--run', dir, '--head', head]);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /states CHANGES_REQUIRED/);

    await writeFile(join(reports, `code-review-${head}.md`), '## Layer web\nVerdict: PASS\n## Layer api\nVerdict: CHANGES_REQUIRED\n');
    assert.equal(runIn(dir, ['--run', dir, '--head', head]).status, 1, 'a mixed verdict is not a PASS');

    await writeFile(join(reports, `code-review-${head}.md`), report('PASS', head));
    const passed = runIn(dir, ['--run', dir, '--head', head]);
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, new RegExp(`pr-gate: PASS on ${head}`));

    await writeFile(join(reports, `code-review-${head}.md`), '### Verdict and scope\nVerdict: PASS\n');
    const unnamed = runIn(dir, ['--run', dir, '--head', head]);
    assert.equal(unnamed.status, 1, 'a PASS that does not name the head sha is not a review of it');
    assert.match(unnamed.stderr, /does not name the reviewed commit/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function gitRepo(dir) {
  const git = (...args) => {
    const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'qa@example.com');
  git('config', 'user.name', 'QA');
  git('config', 'commit.gpgsign', 'false');
  return { git };
}

test('the head is read from the branch, so a review of an earlier candidate cannot pass', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'pr-gate-repo-'));
  try {
    const { git } = gitRepo(repo);
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

    await writeFile(join(reports, `code-review-${head}.md`), report('PASS', head));
    assert.equal(runIn(repo, ['--run', join(repo, 'run')]).status, 0);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test('--head normalises to the full sha and must be HEAD or one of its ancestors (H4)', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'pr-gate-repo-'));
  try {
    const { git } = gitRepo(repo);
    await writeFile(join(repo, 'file.txt'), 'x\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    await mkdir(join(repo, 'run', 'reports'), { recursive: true });
    const head = join(repo, 'run');
    await writeFile(join(head, 'reports', `code-review-${base}.md`), report('PASS', base));

    // A 7-character sha is accepted and resolved, so the report name cannot mismatch it.
    const short = runIn(repo, ['--run', head, '--head', base.slice(0, 7)]);
    assert.equal(short.status, 0, short.stderr);
    assert.match(short.stdout, new RegExp(`PASS on ${base}`));

    await writeFile(join(repo, 'file.txt'), 'y\n');
    git('commit', '-qam', 'a newer head');

    // The reviewed commit is now an ancestor of HEAD: a merge-only update may reuse it,
    // but only because the report names that sha.
    assert.equal(runIn(repo, ['--run', head, '--head', base]).status, 0);

    // A commit that is not in HEAD's history is refused outright.
    git('switch', '-q', '-c', 'side', base);
    await writeFile(join(repo, 'side.txt'), 'side\n');
    git('add', 'side.txt');
    git('commit', '-q', '-m', 'side');
    const side = git('rev-parse', 'HEAD');
    git('switch', '-q', 'main');
    const foreign = runIn(repo, ['--run', head, '--head', side]);
    assert.equal(foreign.status, 1);
    assert.match(foreign.stderr, /is not HEAD .* and is not an ancestor of it/);

    const unknown = runIn(repo, ['--run', head, '--head', 'c'.repeat(40)]);
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /names no commit/);
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
