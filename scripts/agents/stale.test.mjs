import test from 'node:test';
import assert from 'node:assert/strict';
import { staleReport } from './stale.mjs';

test('a current base with matching policy is clean', () => {
  assert.deepEqual(staleReport({ behind: 0, modelsDiffer: false }), {
    ok: true,
    problems: [],
    behind: 0,
  });
});

test('too far behind fails with the allowance named', () => {
  const report = staleReport({ behind: 41, modelsDiffer: false, maxBehind: 30 });
  assert.equal(report.ok, false);
  assert.match(report.problems[0], /41 commits behind .*allowance 30/);
});

test('a stale models.json fails even when the distance is small', () => {
  const report = staleReport({ behind: 2, modelsDiffer: true });
  assert.equal(report.ok, false);
  assert.match(report.problems.join(' '), /tier policy on this branch is stale/);
});

test('the allowance is inclusive', () => {
  assert.equal(staleReport({ behind: 30, modelsDiffer: false, maxBehind: 30 }).ok, true);
});

test('a non-numeric allowance fails instead of disabling the check', () => {
  const report = staleReport({ behind: 1, modelsDiffer: false, maxBehind: Number('abc') });
  assert.equal(report.ok, false);
  assert.match(report.problems.join(' '), /--max-behind must be a number/);
});
