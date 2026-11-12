import test from 'node:test';
import assert from 'node:assert/strict';
import { compare, failedTests, parseKnownFailures, reportProblems } from './known-failures.mjs';

const DOC = `# Known failures

## Known failures

| test | reason | owner |
|---|---|---|
| lead forces RLS | migration 0038 | someone |
| simplify-eve seeds | same | someone |

## Elsewhere
`;

test('the doc table is read, and only under its own heading', () => {
  assert.deepEqual(
    parseKnownFailures(DOC).map((entry) => entry.name),
    ['lead forces RLS', 'simplify-eve seeds'],
  );
});

test('failures come from the vitest json shape', () => {
  const report = {
    testResults: [
      {
        assertionResults: [
          { fullName: 'a', status: 'failed' },
          { fullName: 'b', status: 'passed' },
        ],
      },
    ],
  };
  assert.deepEqual(failedTests(report), ['a']);
});

test('a new red and a stale row are both reported', () => {
  const { unexpected, stale, expected } = compare(['lead forces RLS', 'brand new failure'], parseKnownFailures(DOC));
  assert.deepEqual(unexpected, ['brand new failure']);
  assert.deepEqual(stale, ['simplify-eve seeds']);
  assert.deepEqual(expected, ['lead forces RLS']);
});

test('an unusable report is a problem, not a green run', () => {
  assert.deepEqual(reportProblems({}), ['report has no testResults']);
  assert.deepEqual(reportProblems({ testResults: [], success: false }), [
    'report says success: false but lists no failed test',
  ]);
  const loadFailure = { success: false, testResults: [{ name: 'a.test.ts', status: 'failed', assertionResults: [] }] };
  assert.match(reportProblems(loadFailure).join(' '), /suite failed to run: a\.test\.ts/);
});

test('a healthy report has no problems', () => {
  assert.deepEqual(
    reportProblems({
      success: false,
      testResults: [{ name: 'a', status: 'failed', assertionResults: [{ fullName: 'x', status: 'failed' }] }],
    }),
    [],
  );
});
