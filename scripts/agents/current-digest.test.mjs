import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  REQUIRED_SECTIONS,
  digestProblems,
  digestReport,
  freshnessProblems,
  newestReport,
  resolveFeature,
} from './current-digest.mjs';

const script = fileURLToPath(new URL('./current-digest.mjs', import.meta.url));
const templatePath = fileURLToPath(new URL('../../.agents/templates/CURRENT.md', import.meta.url));

const SHA = '0f3c2b1a9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f40';

const digest = (overrides = {}) => {
  const sections = {
    'Pipeline position': '[4] API contract in progress; next [5a]-[5e] in parallel.',
    'Open PRs': `- PR #42 head ${SHA} - contract handoff`,
    'Decisions made': '- One contract writer - backend-engineer.',
    'Open blockers': '- none',
    'Next step': 'Dispatch [5a] backend on the contract.',
    Reports: '- [QA report](RUN_ROOT/reports/FEAT-0001-qa.md)',
    ...overrides,
  };
  const body = Object.entries(sections)
    .map(([name, text]) => `## ${name}\n\n${text}\n`)
    .join('\n');
  return `# CURRENT - FEAT-0001-example\n\n${body}`;
};

test('a complete digest with a fresh mtime passes', () => {
  assert.deepEqual(digestProblems(digest()), []);
  assert.deepEqual(digestReport({ text: digest(), digestMtime: 2000, latestReport: { path: 'r.md', mtime: 1000 } }), {
    ok: true,
    problems: [],
  });
});

test('a missing heading is named, every one of them', () => {
  for (const name of REQUIRED_SECTIONS) {
    const text = digest().replace(`## ${name}`, `### not ${name}`);
    const problems = digestProblems(text);
    assert.ok(
      problems.some((problem) => problem.includes(`no "## ${name}" section`)),
      `missing ${name}: ${problems.join(' | ')}`,
    );
  }
});

test('an empty section fails even when its heading exists', () => {
  const problems = digestProblems(digest({ 'Next step': '' }));
  assert.match(problems.join(' '), /"## Next step" is empty/);
});

test('a pipeline position without a stage fails', () => {
  const problems = digestProblems(digest({ 'Pipeline position': 'Waiting for the contract.' }));
  assert.match(problems.join(' '), /names no stage/);
});

test('open pull requests each carry a head SHA, and none is spelled out', () => {
  assert.deepEqual(digestProblems(digest({ 'Open PRs': '- none' })), []);
  const missing = digestProblems(digest({ 'Open PRs': '- PR #42 - contract handoff' }));
  assert.match(missing.join(' '), /line has no head SHA: PR #42/);
  const notAList = digestProblems(digest({ 'Open PRs': 'PR #42 and #43 are open.' }));
  assert.match(notAList.join(' '), /lists no pull request lines/);
});

test('open blockers use the house tag unless the section says none', () => {
  assert.deepEqual(digestProblems(digest({ 'Open blockers': '- none' })), []);
  assert.deepEqual(digestProblems(digest({ 'Open blockers': '- BLOCKER[backend-engineer]: contract missing' })), []);
  const problems = digestProblems(digest({ 'Open blockers': '- waiting on the designer' }));
  assert.match(problems.join(' '), /no BLOCKER\[agent\] line/);
});

test('reports are links or a path, and none is allowed', () => {
  assert.deepEqual(digestProblems(digest({ Reports: '- none' })), []);
  assert.deepEqual(digestProblems(digest({ Reports: '- RUN_ROOT/reports/FEAT-0001-qa.md' })), []);
  const problems = digestProblems(digest({ Reports: '- QA passed.' }));
  assert.match(problems.join(' '), /links no report/);
});

test('a digest older than the newest report fails and names both', () => {
  const problems = freshnessProblems({
    digestMtime: Date.parse('2026-11-20T09:00:00Z'),
    latestReport: { path: '/run/reports/qa.md', mtime: Date.parse('2026-11-20T10:00:00Z') },
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /older than the latest report .*qa\.md/);
  assert.match(problems[0], /2026-11-20T09:00:00/);
  assert.match(problems[0], /2026-11-20T10:00:00/);
  assert.deepEqual(
    freshnessProblems({ digestMtime: 1000, latestReport: { path: 'r.md', mtime: 1000 } }),
    [],
    'the same instant is current',
  );
  assert.deepEqual(freshnessProblems({ digestMtime: 1, latestReport: null }), []);
});

test('the shipped CURRENT.md template satisfies the check it documents', async () => {
  const template = await readFile(templatePath, 'utf8');
  for (const name of REQUIRED_SECTIONS) assert.match(template, new RegExp(`^## ${name}$`, 'm'));
  assert.deepEqual(digestProblems(template), []);
  assert.match(template, /scripts\/agents\/current-digest\.mjs/);
});

test('the hand-off skill updates the digest and points at the template', async () => {
  const skill = await readFile(new URL('../../.agents/skills/hand-off/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /CURRENT\.md/);
  assert.match(skill, /scripts\/agents\/current-digest\.mjs/);
  assert.match(skill, /\.agents\/templates\/CURRENT\.md/);
});

test('newestReport walks nested directories, reads .md only, and tolerates a missing root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'digest-reports-'));
  await mkdir(join(root, 'screenshots'), { recursive: true });
  const older = join(root, 'qa.md');
  const newer = join(root, 'screenshots', 'notes.md');
  const ignored = join(root, 'screenshots', 'today-375.png');
  await writeFile(older, 'qa\n');
  await writeFile(newer, 'notes\n');
  await writeFile(ignored, 'png\n');
  await utimes(older, 100, 100);
  await utimes(ignored, 900, 900);
  await utimes(newer, 500, 500);
  try {
    const found = await newestReport(root);
    assert.equal(found.path, newer);
    assert.equal(await newestReport(join(root, 'absent')), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('resolveFeature finds a feature by id, and refuses an ambiguous one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'digest-feature-'));
  const active = join(root, 'features', 'active');
  await mkdir(join(active, 'FEAT-0015-order-status'), { recursive: true });
  await mkdir(join(active, 'FEAT-0016-other'), { recursive: true });
  try {
    assert.equal((await resolveFeature('FEAT-0015', { cwd: root, env: {} })).path, join(active, 'FEAT-0015-order-status'));
    assert.equal((await resolveFeature('FEAT-0016-other', { cwd: root, env: {} })).path, join(active, 'FEAT-0016-other'));
    await assert.rejects(resolveFeature('FEAT-9999', { cwd: root, env: {} }), /names no feature folder/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const run = (args, options = {}) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', ...options });

test('the CLI exits 1 when CURRENT.md is missing and names the template', async () => {
  const root = await mkdtemp(join(tmpdir(), 'digest-cli-'));
  const feature = join(root, 'features', 'active', 'FEAT-0001-example');
  await mkdir(feature, { recursive: true });
  try {
    const result = run(['--feature', 'FEAT-0001'], { cwd: root, env: { ...process.env, RUN_ROOT: '' } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /CURRENT\.md: missing/);
    assert.match(result.stderr, /\.agents\/templates\/CURRENT\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the CLI exits 0 when current, and 1 when a report is newer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'digest-cli-'));
  const feature = join(root, 'features', 'active', 'FEAT-0001-example');
  const reports = join(root, 'run', 'reports');
  await mkdir(feature, { recursive: true });
  await mkdir(reports, { recursive: true });
  const current = join(feature, 'CURRENT.md');
  const report = join(reports, 'qa.md');
  await writeFile(current, digest());
  await writeFile(report, '# QA\n');
  try {
    await utimes(report, 100, 100);
    await utimes(current, 200, 200);
    const fresh = run(['--feature', 'FEAT-0001', '--run', join(root, 'run')], { cwd: root });
    assert.equal(fresh.status, 0, fresh.stderr);
    assert.match(fresh.stdout, /CURRENT\.md: current/);

    await utimes(report, 300, 300);
    const stale = run(['--feature', 'FEAT-0001', '--run', join(root, 'run')], { cwd: root });
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /needs refreshing/);
    assert.match(stale.stderr, /older than the latest report .*qa\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the CLI reports a structural gap with its reason and exit 1', async () => {
  const root = await mkdtemp(join(tmpdir(), 'digest-cli-'));
  const feature = join(root, 'features', 'active', 'FEAT-0001-example');
  await mkdir(feature, { recursive: true });
  await writeFile(join(feature, 'CURRENT.md'), digest({ 'Open PRs': '- PR #9 no sha here' }));
  try {
    const result = run(['--feature', feature], { cwd: root, env: { ...process.env, RUN_ROOT: '' } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /line has no head SHA/);
    assert.equal(result.stdout, '', 'a failing digest writes nothing to stdout');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
