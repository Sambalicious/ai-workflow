import test from 'node:test';
import assert from 'node:assert/strict';
import { mainHealthReport, staleReport } from './stale.mjs';

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

const stub = (answers) => (args) => {
  const key = args.slice(0, 2).join(' ');
  if (!(key in answers)) throw Object.assign(new Error(`unexpected gh ${key}`), { code: 'ENOENT' });
  if (answers[key] instanceof Error) throw answers[key];
  return typeof answers[key] === 'string' ? answers[key] : JSON.stringify(answers[key]);
};

const runs = (...entries) => entries.map(([conclusion, createdAt, databaseId = 1]) => ({ conclusion, createdAt, databaseId, status: 'completed' }));

test('a green latest run on main is reported as ok', () => {
  const gh = stub({ 'run list': runs(['failure', '2026-11-20T09:00:00Z', 1], ['success', '2026-11-20T12:00:00Z', 2]) });
  assert.deepEqual(mainHealthReport(gh), { level: 'ok', problems: [] });
});

test('a red latest run warns with its conclusion, and a never-started job carries its annotation', () => {
  const gh = stub({
    'run list': runs(['success', '2026-11-20T09:00:00Z', 1], ['failure', '2026-11-20T12:00:00Z', 2]),
    'run view': { jobs: [{ name: 'api', conclusion: 'failure', databaseId: 55, steps: [] }, { name: 'web', conclusion: 'success', databaseId: 56, steps: [{ name: 'build' }] }] },
    'repo view': { nameWithOwner: 'o/r' },
    'api repos/o/r/check-runs/55/annotations': 'The job was not started because recent account payments have failed',
  });
  const report = mainHealthReport(gh);
  assert.equal(report.level, 'warn');
  assert.match(report.problems[0], /latest completed run on main \(#2\) finished failure/);
  assert.match(report.problems[1], /api: The job was not started because recent account payments have failed/);
  assert.equal(report.problems.length, 2, 'a job that started and passed adds no annotation');
});

test('gh missing or unauthenticated degrades to a warning, never a failure', () => {
  const missing = mainHealthReport(stub({}));
  assert.equal(missing.level, 'unknown');
  assert.match(missing.problems[0], /gh is missing or unauthenticated/);
  assert.equal(staleReport({ behind: 0, modelsDiffer: false }).ok, true);
});

test('a cancelled or in-progress run is not the latest completed one', () => {
  const gh = stub({ 'run list': [{ status: 'completed', conclusion: 'cancelled', createdAt: '2026-11-20T12:00:00Z', databaseId: 3 }, { status: 'in_progress', conclusion: null, createdAt: '2026-11-20T13:00:00Z', databaseId: 4 }, { status: 'completed', conclusion: 'success', createdAt: '2026-11-20T09:00:00Z', databaseId: 5 }] });
  assert.deepEqual(mainHealthReport(gh), { level: 'ok', problems: [] });
  assert.equal(mainHealthReport(stub({ 'run list': [] })).level, 'unknown');
});
