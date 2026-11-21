import test from 'node:test';
import assert from 'node:assert/strict';
import { latestCompletedRun, parseLog, renderFailureReport, stripAnsi, summarize } from './failures.mjs';

const ANSI = '\u001B[31m';
const jobLine = (job, text, step = 'run tests') => `${job}\t${step}\t${text}`;

const playwrightLog = [
  jobLine('e2e', `${ANSI}Running 12 tests using 2 workers\u001B[0m`),
  jobLine('e2e', '  ✘  [chromium] › tests/registry.spec.ts:12:3 › cross candidate registry stays green (4.2s)'),
  jobLine('e2e', '    Error: expect(received).toBe(expected) // Object.is equality'),
  jobLine('e2e', '    Expected: 200'),
  jobLine('e2e', '    Received: 500'),
  jobLine('e2e', '        at tests/registry.spec.ts:20:5'),
  jobLine('e2e', '    at Runner.runTest (playwright/lib/runner.js:1:1)'),
  jobLine('e2e', '  ✓ a test that passed'),
].join('\n');

test('ANSI escapes and the gh job and step prefixes are stripped', () => {
  assert.equal(stripAnsi(`${ANSI}red\u001B[0m`), 'red');
  const lines = parseLog(`job\tstep\t${ANSI}hello\u001B[0m`);
  assert.deepEqual(lines[0], { job: 'job', step: 'step', text: 'hello' });
  assert.deepEqual(parseLog('plain line')[0], { job: null, step: null, text: 'plain line' });
});

test('a Playwright failure yields the test title and its first error block only', () => {
  const lines = parseLog(playwrightLog);
  const { titles, errors } = summarize(lines);
  assert.deepEqual(titles, ['[chromium] › tests/registry.spec.ts:12:3 › cross candidate registry stays green (4.2s)']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Error: expect\(received\)\.toBe\(expected\)/);
  assert.match(errors[0], /at tests\/registry\.spec\.ts:20:5/);
  assert.doesNotMatch(errors[0], /Runner\.runTest/, 'the block stops at the first at line');
});

const vitestLog = [
  'FAIL  apps/api/src/orders/orders.service.test.ts > orders > rejects a stale candidate',
  'AssertionError: expected 409 to be 500',
  '    at apps/api/src/orders/orders.service.test.ts:42:7',
  '    at processTicksAndRejections (node:internal/process/task_queues:95:5)',
].join('\n');

test('a vitest FAIL line and AssertionError block are extracted', () => {
  const { titles, errors } = summarize(parseLog(vitestLog));
  assert.deepEqual(titles, ['apps/api/src/orders/orders.service.test.ts > orders > rejects a stale candidate']);
  assert.match(errors[0], /AssertionError: expected 409 to be 500/);
  assert.match(errors[0], /orders\.service\.test\.ts:42:7/);
});

test('repeated noise collapses to one line with a count, and single lines are dropped', () => {
  const noisy = [
    '2026-11-20T10:00:01Z ENOENT: no such file or directory, open /tmp/storage/run-8f3a1b2c.log',
    '2026-11-20T10:00:02Z ENOENT: no such file or directory, open /tmp/storage/run-9a4c2d3e.log',
    '2026-11-20T10:00:03Z ENOENT: no such file or directory, open /tmp/storage/run-7b5d3e4f.log',
    'a line that appears once',
  ].join('\n');
  const { noise } = summarize(parseLog(noisy));
  assert.equal(noise.length, 1);
  assert.equal(noise[0].count, 3);
  assert.match(noise[0].text, /ENOENT/);
});

test('ids and timestamps do not split the same noise line into separate groups', () => {
  const same = [
    'worker f3a1b2c4d5 failed after 120ms at 10:00:01',
    'worker 9a4c2d3e4f failed after 340ms at 10:00:02',
  ].join('\n');
  const { noise } = summarize(parseLog(same));
  assert.equal(noise.length, 1);
  assert.equal(noise[0].count, 2);
});

test('the latest completed non-cancelled run wins, and a cancelled one is skipped', () => {
  const runs = [
    { databaseId: 1, status: 'completed', conclusion: 'success', createdAt: '2026-11-20T09:00:00Z' },
    { databaseId: 2, status: 'completed', conclusion: 'cancelled', createdAt: '2026-11-20T11:00:00Z' },
    { databaseId: 3, status: 'in_progress', conclusion: null, createdAt: '2026-11-20T12:00:00Z' },
    { databaseId: 4, status: 'completed', conclusion: 'failure', createdAt: '2026-11-20T10:00:00Z' },
  ];
  assert.equal(latestCompletedRun(runs).databaseId, 4);
  assert.equal(latestCompletedRun([]), null);
});

const jobs = [
  { name: 'api', conclusion: 'failure' },
  { name: 'e2e', conclusion: 'failure' },
  { name: 'lint', conclusion: 'success' },
  { name: 'superseded', conclusion: 'cancelled' },
];

test('the report names each failed job with its annotations and never a passing one', () => {
  const report = renderFailureReport({
    run: { databaseId: 8312345, workflowName: 'ci' },
    jobs,
    log: playwrightLog,
    annotations: { e2e: ['failure: The job was not started because recent account payments have failed'] },
  });
  assert.match(report, /^Run ci 8312345: 2 failed jobs \(api, e2e\)/m);
  assert.match(report, /## e2e[\s\S]*registry\.spec\.ts:12:3/);
  assert.match(report, /annotations:\n {2}- failure: The job was not started/);
  assert.doesNotMatch(report, /## lint/);
  assert.doesNotMatch(report, /## superseded/);
  assert.match(report, /## api\nno failed test titles or error block in the log/);
});

test('a run with no failed jobs says so instead of printing empty sections', () => {
  const report = renderFailureReport({ run: { databaseId: 7, workflowName: 'ci' }, jobs: [jobs[2]], log: '' });
  assert.equal(report, 'Run ci 7: no failed jobs.\n');
});
