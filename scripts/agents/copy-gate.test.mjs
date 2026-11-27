import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approvedText, findingsFromDiff, flaggedStrings, report, unapproved } from './copy-gate.mjs';

const SCRIPT = fileURLToPath(new URL('./copy-gate.mjs', import.meta.url));

test('the marker is found case-insensitively in added lines only', () => {
  const source = [
    'diff --git a/src/card.tsx b/src/card.tsx',
    '--- a/src/card.tsx',
    '+++ b/src/card.tsx',
    '@@ -1,2 +1,3 @@',
    '-const old = "Pending Copywriter approval: Old";',
    ' const kept = "nothing pending";',
    '+const next = "PENDING copywriter approval: Card declined.";',
    '',
  ].join('\n');
  const findings = findingsFromDiff(source);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0], {
    file: 'src/card.tsx',
    line: 2,
    text: 'PENDING copywriter approval: Card declined.',
  });
});

test('a new file, an unquoted line and a JSX line are all flagged', () => {
  const source = [
    'diff --git a/src/new.tsx b/src/new.tsx',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/src/new.tsx',
    '@@ -0,0 +1,2 @@',
    '+<p>Pending copywriter: choose a plan</p>',
    "+const label = 'pending COPYWRITER approval';",
    '',
  ].join('\n');
  const findings = findingsFromDiff(source);
  assert.deepEqual(findings.map((finding) => finding.text), [
    '<p>Pending copywriter: choose a plan</p>',
    'pending COPYWRITER approval',
  ]);
  assert.deepEqual(findings.map((finding) => finding.line), [1, 2]);
});

test('removed lines, diff headers and prose without the marker are ignored', () => {
  const source = [
    'diff --git a/README.md b/README.md',
    '--- a/README.md',
    '+++ b/README.md',
    '@@ -3,2 +3,2 @@',
    ' The copywriter reviews copy.',
    "-PENDING copywriter approval: old string",
    '+Final copy.',
    '',
  ].join('\n');
  assert.deepEqual(findingsFromDiff(source), []);
  assert.deepEqual(findingsFromDiff('not a diff at all'), []);
  assert.deepEqual(findingsFromDiff(''), []);
});

test('a quoted marker reports the string, not the surrounding code', () => {
  assert.deepEqual(flaggedStrings('const copy = { title: \'PENDING copywriter approval: Save\' };'), [
    'PENDING copywriter approval: Save',
  ]);
  assert.deepEqual(flaggedStrings('  <span>Pending copywriter approval</span>  '), [
    '<span>Pending copywriter approval</span>',
  ]);
});

test('only the Copy pending approval section approves a string', () => {
  const body = [
    '## Summary',
    'Mentions PENDING copywriter approval in prose only.',
    '',
    '## Copy pending approval',
    '- PENDING copywriter approval: Card declined.',
    '',
    '### Notes',
    '- PENDING copywriter approval: Not approved here.',
  ].join('\n');
  const section = approvedText(body);
  assert.match(section, /Card declined/);
  assert.doesNotMatch(section, /prose only|Not approved here/);
  assert.equal(approvedText('No heading here.'), '');
});

test('unapproved keeps every string the body does not list, across line wrapping', () => {
  const findings = [
    { file: 'a.tsx', line: 1, text: 'PENDING copywriter approval: Card declined.' },
    { file: 'b.tsx', line: 4, text: 'PENDING copywriter approval: Try another card.' },
  ];
  const listed = ['## Copy pending approval', '', '- PENDING copywriter approval:', '  Card declined.'].join('\n');
  assert.deepEqual(unapproved(findings, listed), [findings[1]]);
  assert.deepEqual(unapproved([], 'anything'), []);
});

test('the report names each unlisted string and clears a listed one', () => {
  const findings = [{ file: 'src/card.tsx', line: 12, text: 'PENDING copywriter approval: Card declined.' }];
  assert.equal(report([], []), 'Copy gate: clear.');
  assert.match(report(findings, findings), /src\/card\.tsx:12\s+PENDING copywriter approval: Card declined\./);
  assert.match(report(findings, findings), /Copy pending approval/);
  assert.match(report(findings, []), /clear\. 1 pending string/);
});

// End to end against a real repository: the gate reads `git diff <base>...HEAD`.
function withRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'copy-gate-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  return { repo, git, run: (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: repo }) };
}

test('the CLI fails on an unlisted marker and passes once the body lists it', () => {
  const { repo, git, run: atRepo } = withRepo();
  try {
    writeFileSync(join(repo, 'card.tsx'), 'export const title = "Ready";\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    writeFileSync(join(repo, 'card.tsx'), 'export const title = "PENDING copywriter approval: Card declined.";\n');
    git('commit', '-qam', 'pending copy');

    const failed = atRepo(['--base', 'HEAD~1']);
    assert.equal(failed.status, 1, failed.stderr);
    assert.match(failed.stdout, /PENDING copywriter approval: Card declined\./);

    writeFileSync(join(repo, 'body.md'), '## Copy pending approval\n- PENDING copywriter approval: Card declined.\n');
    const passed = atRepo(['--base', 'HEAD~1', '--body', join(repo, 'body.md')]);
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, /clear/);

    writeFileSync(join(repo, 'body.md'), '## Summary\nNothing pending here.\n');
    assert.equal(atRepo(['--base', 'HEAD~1', '--body', join(repo, 'body.md')]).status, 1);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('usage errors and a bad base exit 2, and a clean diff exits 0', () => {
  const { repo, git, run: atRepo } = withRepo();
  try {
    writeFileSync(join(repo, 'readme.md'), 'no pending copy\n');
    git('add', '.');
    git('commit', '-qm', 'base');

    assert.equal(atRepo([]).status, 2);
    assert.equal(atRepo(['--base']).status, 2);
    assert.equal(atRepo(['--base', 'HEAD', '--body']).status, 2);
    assert.equal(atRepo(['--base', 'no-such-ref']).status, 2);
    const clean = atRepo(['--base', 'HEAD']);
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, /^Copy gate: clear\.$/m);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
