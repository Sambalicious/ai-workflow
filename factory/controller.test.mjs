import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRun, reduce, report, routeFinding, DEFAULT_BUDGET } from './controller.mjs';
import { initialize, load, apply } from './store.mjs';
import { exampleInput, exampleInputWithRelease, exampleEvents } from './example.mjs';

const NOW = 100000;
const artifact = (n = 1) => ({ ref: `artifact:${n}`, hash: n.toString(16).padStart(64, '0') });
const task = (id, role, kind, depends_on, artifact_kind, extra = {}) => ({
  id, role, kind, depends_on, artifact_kind, required: true,
  ...(kind === 'work' ? {} : { checks: ['declared-check'] }), ...extra,
});
function input(extra = {}) {
  return {
    run_id: 'run-1', work_item_id: 'ITEM-1', repository: '/local/repository', cost_mode: 'strict',
    base_sha: 'a'.repeat(40), factory_version: 'pilot-1', trusted_adapter_id: 'adapter',
    authorization: { approved: true, approved_by: 'test-operator', scope_ref: 'test:approved-scope' },
    candidate: artifact(),
    actors: [
      { id: 'control', roles: ['controller'] },
      { id: 'backend', roles: ['backend-engineer'] },
      { id: 'frontend', roles: ['frontend-engineer'] },
      { id: 'quality', roles: ['qa'] },
      { id: 'reviewer', roles: ['code-review'] },
      { id: 'security', roles: ['security'] },
      { id: 'quality-two', roles: ['qa'] },
      { id: 'release', roles: ['release-manager'] },
      { id: 'release-two', roles: ['release-manager'] },
      { id: 'growth', roles: ['growth'] },
    ],
    tasks: [
      task('code', 'backend-engineer', 'work', [], 'code', { component: 'backend' }),
      task('qa', 'qa', 'verification', ['code'], 'test'),
      task('review', 'code-review', 'review', ['code'], 'review'),
      task('release', 'release-manager', 'release', ['qa', 'review'], 'release'),
      task('security', 'security', 'verification', ['code'], 'security'),
    ], ...extra,
  };
}
function harness(config = input()) {
  let state = createRun(config, { now: NOW });
  let sequence = 0;
  const controller = config.actors.find(a => a.roles.includes('controller')).id;
  const event = (type, fields = {}, actor_id = controller) => ({
    type, event_id: `event-${++sequence}`, expected_version: state.version,
    adapter_id: config.trusted_adapter_id, attested: true, actor_id, ...fields,
  });
  const send = (type, fields, actor_id, now = NOW) => {
    const e = event(type, fields, actor_id); state = reduce(state, e, { now }); return e;
  };
  const start = (id, options = {}) => {
    if (state.tasks.find(t => t.id === id).kind !== 'work' && !state.candidate_published) {
      send('publish', { candidate: artifact(state.candidate.revision + 1000) });
    }
    const assignment = report(state, { now: NOW }).ready.find(t => t.task_id === id);
    assert.ok(assignment, `Expected ready assignment ${id}`);
    const actor = options.actor_id ?? assignment.eligible_actors[0];
    const attempt_id = `${id}-${++sequence}`;
    send('start', { task_id: id, attempt_id, candidate: assignment.candidate,
      inputs: assignment.inputs, reservation: { tokens: 100, cost_usd: 0.1 }, ...options }, actor);
    return attempt_id;
  };
  const complete = (id, fields = {}, now = NOW) => {
    const t = state.tasks.find(t => t.id === id); const a = t.attempts.at(-1);
    const evidence = t.kind === 'work' ? {} : { evidence: t.checks.map(check => ({
      check, artifact: artifact(sequence + 100), candidate: state.candidate,
    })) };
    return send('complete', { task_id: id, attempt_id: a.id, outcome: 'success',
      usage: config.cost_mode === 'strict' ? { tokens: 80, cost_usd: 0.08 } : undefined,
      artifact: artifact(sequence + 10),
      ...evidence, ...fields }, a.actor_id, now);
  };
  const run = id => {
    if (id === 'release' && state.tasks.some(t => t.id === 'security' && t.status === 'pending')) run('security');
    start(id); complete(id);
  };
  const finding = (id = 'finding-1', source = 'code', category = 'code') => {
    const t = state.tasks.find(t => t.id === source);
    return send('finding', { finding_id: id, category, subtype: 'regression',
      source_task_id: source, source_attempt_id: t.attempts.at(-1).id,
      source_revision: t.revision, candidate: state.candidate, evidence: artifact(500) }, 'quality');
  };
  const repair = () => send('repair', { finding_ids: state.findings.filter(f => f.status !== 'resolved').map(f => f.id) });
  const resolveFinding = (id = 'finding-1', gate) => {
    gate ??= state.findings.find(f => f.id === id).recheck_task_id;
    if (state.tasks.find(t => t.id === gate).status === 'pending') run(gate);
    const t = state.tasks.find(t => t.id === gate);
    return send('resolve', { finding_id: id, verification_task_id: gate,
      verification_attempt_id: t.attempts.at(-1).id, candidate: state.candidate }, t.attempts.at(-1).actor_id);
  };
  return { get state() { return state; }, event, send, start, complete, run, finding, repair, resolveFinding };
}

test('complete initial pass derives production readiness, not production execution', () => {
  const h = harness();
  assert.deepEqual(h.state.budget, DEFAULT_BUDGET);
  h.run('code'); h.run('qa'); h.run('review'); h.run('release');
  const status = report(h.state, { now: NOW });
  assert.equal(status.status, 'PRODUCTION_READY');
  assert.match(status.assurance, /Local trusted-adapter attestations/);
  assert.equal(status.usage.invocations, 5);
  assert.equal(status.usage.tokens, 400);
  assert.equal(h.state.audit.length, 11);
  const noRelease = harness(input({ tasks: input().tasks.slice(0, 3) }));
  noRelease.run('code'); noRelease.run('qa'); noRelease.run('review');
  assert.equal(report(noRelease.state, { now: NOW }).status, 'VERIFIED');
});

test('failure routes to source owner, repairs, independently verifies, then releases', () => {
  const h = harness();
  h.start('code'); h.complete('code', { outcome: 'failed', reason: 'Compiler failed' });
  assert.equal(h.state.usage.tokens, 80);
  h.finding();
  assert.equal(h.state.findings[0].owner, 'backend-engineer');
  h.repair(); h.run('code'); h.run('qa'); h.run('review');
  assert.equal(report(h.state, { now: NOW }).ready.some(t => t.task_id === 'release'), false);
  h.resolveFinding(); h.run('release');
  assert.equal(report(h.state, { now: NOW }).status, 'PRODUCTION_READY');
  assert.equal(h.state.tasks[0].attempts.length, 2);
  assert.equal(h.state.findings[0].resolutions[0].source_revision, 2);
});

test('three correction waves are global across backend/frontend, not per role', () => {
  const config = input();
  config.tasks.splice(1, 0, task('ui', 'frontend-engineer', 'work', ['code'], 'code', { component: 'frontend' }));
  config.tasks[2].depends_on.push('ui'); config.tasks[3].depends_on.push('ui');
  config.tasks.find(t => t.id === 'security').depends_on.push('ui');
  const h = harness(config); h.run('code'); h.run('ui');
  for (let round = 1; round <= 3; round++) {
    h.finding(`f-${round}`, round % 2 ? 'code' : 'ui');
    h.repair();
    if (h.state.tasks[0].status === 'pending') h.run('code');
    h.run('ui'); h.run('qa'); h.run('review');
    for (const f of h.state.findings) h.resolveFinding(f.id);
  }
  h.finding('f-4', 'ui'); h.repair();
  assert.equal(h.state.repair_waves, 3);
  assert.match(h.state.stopped.reason, /Global repair wave limit exhausted/);
  assert.equal(report(h.state, { now: NOW }).status, 'STOPPED');
});

test('repair groups every unresolved finding and invalidates fanout including Growth', () => {
  const config = input();
  config.tasks.splice(1, 0, task('growth', 'growth', 'work', ['code'], 'growth'));
  config.tasks[2].depends_on.push('growth'); config.tasks[3].depends_on.push('growth');
  config.tasks.find(t => t.id === 'security').depends_on.push('growth');
  const h = harness(config);
  h.run('code'); h.run('growth'); h.run('qa'); h.run('review'); h.run('release');
  h.finding('one'); h.finding('two');
  assert.throws(() => h.send('repair', { finding_ids: ['one'] }), /all unresolved/);
  h.repair();
  assert.ok(h.state.tasks.every(t => t.status === 'pending' && (t.revision === 2 || t.id.startsWith('recheck:'))));
  assert.deepEqual(report(h.state, { now: NOW }).ready.map(t => t.task_id), ['code']);
});

test('candidate repair invalidates unrelated gates and old resolved evidence', () => {
  const h = harness(); h.run('code'); h.finding(); h.repair(); h.run('code'); h.run('qa'); h.run('review'); h.resolveFinding();
  const oldResolution = h.state.findings[0].resolutions[0];
  h.finding('another'); h.repair();
  assert.equal(h.state.findings[0].status, 'verifying');
  assert.equal(h.state.findings[0].resolutions.length, 1);
  assert.notEqual(oldResolution.candidate.revision, h.state.candidate.revision);
  assert.equal(h.state.tasks.find(t => t.id === 'review').status, 'pending');
});

test('idempotency preserves metering, collision and stale versions are rejected', () => {
  const h = harness();
  h.start('code'); const event = h.complete('code'); const state = h.state;
  assert.equal(reduce(state, event, { now: NOW }), state);
  assert.throws(() => reduce(state, { ...event, usage: { tokens: 1, cost_usd: 0 } }, { now: NOW }), /collision/);
  assert.throws(() => h.send('tick', { expected_version: 0 }), /Stale event/);
  assert.equal(h.state.usage.tokens, 80);
  assert.throws(() => h.send('start', { task_id: 'qa', attempt_id: 'old', inputs: {},
    reservation: { tokens: 100, cost_usd: 0.1 }, candidate: { ...state.candidate, revision: 0 } }, 'quality'), /candidate.revision/);
});

test('strict schemas, identity, candidate and dependency snapshots reject bad events', () => {
  const h = harness();
  assert.throws(() => h.send('tick', { attested: false }), /attestation/);
  assert.throws(() => h.send('tick', {}, 'imposter'), /Undeclared actor/);
  assert.throws(() => h.send('tick', { adapter_id: 'other' }), /attestation/);
  assert.throws(() => h.send('tick', { budget: { tokens: 900000 } }), /Unknown event field/);
  for (const type of ['merge', 'deploy', 'rule-update', 'production-ready']) assert.throws(() => h.send(type), /disabled/);
  h.run('code');
  h.send('publish', { candidate: artifact(1001) });
  const assignment = report(h.state, { now: NOW }).ready[0];
  assert.throws(() => h.send('start', { task_id: 'qa', attempt_id: 'bad-input', candidate: assignment.candidate,
    reservation: { tokens: 100, cost_usd: 0.1 }, inputs: {} }, 'quality'), /dependency/);
  const badInputs = structuredClone(assignment.inputs); badInputs.code.revision++;
  assert.throws(() => h.send('start', { task_id: 'qa', attempt_id: 'bad-revision', candidate: assignment.candidate,
    reservation: { tokens: 100, cost_usd: 0.1 }, inputs: badInputs }, 'quality'), /dependency/);
  assert.throws(() => h.send('finding', { finding_id: 'x', category: 'code', subtype: 'x', source_task_id: 'code',
    source_attempt_id: 'wrong', source_revision: 1, candidate: h.state.candidate, evidence: artifact() }, 'quality'), /current completed/);
  assert.throws(() => h.send('skip', { task_id: 'qa', reason: 'skip' }, 'quality'), /Controller actor/);
});

test('gate authors must be distinct actor identities, including multiple contexts/roles', () => {
  const config = input(); config.actors.find(a => a.id === 'backend').roles.push('qa');
  const h = harness(config); h.run('code');
  assert.throws(() => h.start('qa', { actor_id: 'backend' }), /Independent gate actor/);
  const config2 = input(); config2.actors.find(a => a.id === 'quality').roles.push('code-review');
  config2.tasks.find(t => t.id === 'review').depends_on.push('qa');
  const second = harness(config2); second.run('code'); second.run('qa');
  assert.throws(() => second.start('review', { actor_id: 'quality' }), /Independent gate actor/);
});

test('missing or stale gate evidence blocks result while preserving actual usage', () => {
  for (const fields of [{ evidence: [] }, { evidence: undefined },
    { evidence: [{ check: 'declared-check', artifact: artifact(), candidate: { ...artifact(), revision: 9 } }] },
    { artifact: { ref: 'bad', hash: 'not-hash' } }]) {
    const h = harness(); h.run('code'); h.start('qa'); h.complete('qa', fields);
    assert.equal(h.state.tasks.find(t => t.id === 'qa').status, 'blocked');
    assert.match(h.state.tasks.find(t => t.id === 'qa').reason, /Result rejected/);
    assert.equal(h.state.usage.tokens, 160);
    assert.notEqual(report(h.state, { now: NOW }).status, 'PRODUCTION_READY');
  }
});

test('each declared check is required exactly once', () => {
  const config = input(); config.tasks[1].checks = ['unit', 'integration'];
  const h = harness(config); h.run('code'); h.start('qa');
  h.complete('qa', { evidence: ['unit', 'unit'].map(check => ({ check, artifact: artifact(), candidate: h.state.candidate })) });
  assert.match(h.state.tasks[1].reason, /Duplicate or missing gate checks/);
});

test('security routes to explicit code component and requires security verifier', () => {
  const h = harness(); h.run('code'); h.finding('security-1', 'code', 'security');
  assert.equal(h.state.findings[0].owner, 'backend-engineer');
  assert.equal(h.state.findings[0].verifier_role, 'security');
  h.repair(); h.run('code'); h.run('qa'); h.run('review');
  assert.throws(() => h.resolveFinding('security-1', 'qa'), /dedicated finding recheck/);
  h.resolveFinding('security-1'); h.run('release');
  assert.equal(report(h.state, { now: NOW }).status, 'PRODUCTION_READY');
});

test('router uses category, artifact kind and source owner, not reporter role', () => {
  for (const [category, role] of Object.entries({ contract: 'backend-engineer', product: 'product-manager',
    spec: 'product-manager', gherkin: 'gherkin', architecture: 'architect', design: 'designer', test: 'qa', infra: 'devops' })) {
    assert.equal(routeFinding({ artifact_kind: category, role, kind: 'work' }, category).owner, role);
  }
  assert.equal(routeFinding({ artifact_kind: 'code', component: 'frontend', role: 'frontend-engineer' }, 'code').owner, 'frontend-engineer');
  assert.equal(routeFinding({ artifact_kind: 'code', role: 'backend-engineer' }, 'security').owner, null);
  assert.equal(routeFinding({ artifact_kind: 'code', component: 'frontend', role: 'backend-engineer' }, 'code').owner, null);
  const h = harness(); h.run('code'); h.finding('unknown', 'code', 'ambiguous');
  assert.equal(report(h.state, { now: NOW }).status, 'BLOCKED');
  h.repair(); assert.equal(h.state.stopped, null);
  assert.match(report(h.state, { now: NOW }).reason, /Unknown\/inconsistent finding owner/);
});

test('global invocation reserve protects remaining required gates', () => {
  const impossible = harness(input({ budget: { invocations: 3 } }));
  assert.match(impossible.state.stopped.reason, /Insufficient invocation/);
  const config = input({ budget: { invocations: 5 } });
  config.tasks.push(task('optional', 'growth', 'work', [], 'growth', { required: false }));
  const h = harness(config); h.start('optional');
  assert.match(h.state.stopped.reason, /remaining required work\/gates/);
  assert.equal(h.state.usage.invocations, 0);
});

test('reservations consume capacity before starts and zero reservations are prohibited', () => {
  const config = input({ budget: { concurrent: 1, tokens: 150 } });
  config.tasks.push(task('optional', 'growth', 'work', [], 'growth', { required: false }));
  const h = harness(config);
  assert.throws(() => h.start('code', { reservation: { tokens: 0, cost_usd: 0 } }), /positive/);
  h.start('code');
  assert.deepEqual(report(h.state, { now: NOW }).reserved, { tokens: 100, cost_usd: 0.1 });
  assert.throws(() => h.start('optional'), /Concurrent task limit/);
  h.complete('code'); h.start('optional');
  assert.match(h.state.stopped.reason, /token\/cost budget/);
  const cost = harness(input({ budget: { cost_usd: 0.01 } })); cost.start('code');
  assert.match(cost.state.stopped.reason, /token\/cost budget/);
});

test('usage exceeding a reservation stops and records billable usage; in-flight results drain', () => {
  const config = input(); config.tasks.push(task('optional', 'growth', 'work', [], 'growth', { required: false }));
  const h = harness(config); h.start('code'); h.start('optional');
  h.complete('code', { usage: { tokens: 101, cost_usd: 1 } });
  assert.equal(h.state.usage.tokens, 101);
  assert.equal(h.state.tasks[0].attempts[0].status, 'rejected');
  assert.match(h.state.stopped.reason, /usage exceeded reservation/);
  h.complete('optional');
  assert.equal(h.state.usage.tokens, 181);
  assert.deepEqual(report(h.state, { now: NOW }).reserved, { tokens: 0, cost_usd: 0 });
});

test('runs have no elapsed deadline unless the input sets one', () => {
  const h = harness(input()); h.start('code');
  assert.equal(h.state.budget.elapsed_ms, null);
  const muchLater = NOW + 30 * 24 * 60 * 60 * 1000;
  assert.equal(report(h.state, { now: muchLater }).status, 'RUNNING');
  h.complete('code', {}, muchLater);
  assert.equal(h.state.stopped, null);
  assert.equal(h.state.tasks[0].status, 'done');
});

test('an explicit elapsed deadline has no pilot cap but must be a positive integer', () => {
  const week = 7 * 24 * 60 * 60 * 1000;
  assert.equal(createRun(input({ budget: { elapsed_ms: week } }), { now: NOW }).budget.elapsed_ms, week);
  assert.equal(createRun(input({ budget: { elapsed_ms: null } }), { now: NOW }).budget.elapsed_ms, null);
  for (const bad of [0, -1, 1.5, '90']) {
    assert.throws(() => createRun(input({ budget: { elapsed_ms: bad } })), /elapsed_ms must be a positive integer/);
  }
});

test('deadline uses API clock and records late completion usage without accepting output', () => {
  const h = harness(input({ budget: { elapsed_ms: 10 } })); h.start('code');
  assert.equal(report(h.state, { now: NOW + 10 }).status, 'STOPPED');
  h.complete('code', {}, NOW + 10);
  assert.equal(h.state.usage.tokens, 80);
  assert.match(h.state.stopped.reason, /deadline/);
  assert.equal(h.state.tasks[0].status, 'blocked');
  assert.throws(() => reduce(h.state, h.event('tick'), { now: NOW + 9 }), /backwards/);
});

test('optional failure cannot suppress required dependencies', () => {
  const config = input(); config.tasks[0].required = false;
  const h = harness(config); assert.equal(h.state.tasks[0].effective_required, true);
  h.start('code'); h.complete('code', { outcome: 'failed', reason: 'broken' });
  assert.throws(() => h.send('skip', { task_id: 'code', reason: 'optional' }), /ancestor of a required/);
  assert.equal(report(h.state, { now: NOW }).ready.length, 0);
  assert.equal(report(h.state, { now: NOW }).status, 'BLOCKED');
  const optionalConfig = input(); optionalConfig.tasks.push(task('optional', 'growth', 'work', [], 'growth', { required: false }));
  const optional = harness(optionalConfig); optional.start('optional');
  optional.complete('optional', { outcome: 'blocked', reason: 'Not in scope' });
  optional.send('skip', { task_id: 'optional', reason: 'No required consumers' });
  optional.run('code'); optional.run('qa'); optional.run('review'); optional.run('release');
  assert.equal(report(optional.state, { now: NOW }).status, 'PRODUCTION_READY');
});

test('input rejects unknown fields, missing/cyclic dependencies, missing coverage, and budget extension', () => {
  assert.throws(() => createRun(input({ budegt: {} })), /Unknown input field/);
  assert.throws(() => createRun(input({ authorization: undefined })), /authorization must be an object/);
  assert.throws(() => createRun(input({ authorization: { approved: false, approved_by: 'person', scope_ref: 'ref' } })), /approved implementation scope/);
  assert.throws(() => createRun(input({ budget: { invocations: 33 } })), /pilot cap/);
  assert.throws(() => createRun(input({ budget: { concurrent: 1.5 } })), /integer/);
  const missing = input(); missing.tasks[0].depends_on = ['absent'];
  assert.throws(() => createRun(missing), /Missing dependency/);
  const cycle = input(); cycle.tasks[0].depends_on = ['qa'];
  assert.throws(() => createRun(cycle), /DAG cycle/);
  const noGate = input(); noGate.tasks = noGate.tasks.filter(t => t.id !== 'release' && t.id !== 'review');
  assert.throws(() => createRun(noGate), /required review task/);
  const unrelatedGate = input(); unrelatedGate.tasks[1].depends_on = [];
  assert.throws(() => createRun(unrelatedGate), /must feed a required verification/);
  const noChecks = input(); noChecks.tasks[1].checks = [];
  assert.throws(() => createRun(noChecks), /checks must be an array/);
});

test('exact candidate, source and gate revisions are required for resolving findings', () => {
  const h = harness(); h.run('code'); h.finding(); const oldCandidate = structuredClone(h.state.candidate);
  h.repair(); h.run('code'); h.run('qa'); h.run('review');
  const attempt = h.state.tasks.find(t => t.id === 'qa').attempts.at(-1);
  const resolution = { finding_id: 'finding-1', verification_task_id: 'qa', verification_attempt_id: attempt.id, candidate: h.state.candidate };
  assert.throws(() => h.send('resolve', { ...resolution, candidate: oldCandidate }, 'quality'), /Stale candidate/);
  assert.throws(() => h.send('resolve', { ...resolution, verification_attempt_id: 'wrong' }, 'quality'), /dedicated finding recheck/);
  assert.throws(() => h.send('resolve', resolution, 'reviewer'), /dedicated finding recheck/);
  h.resolveFinding(); assert.equal(h.state.findings[0].status, 'resolved');
});

test('repair preserves unaffected work but reruns candidate-specific gates', () => {
  const config = input();
  config.tasks.splice(1, 0, task('ui', 'frontend-engineer', 'work', [], 'code', { component: 'frontend' }));
  config.tasks[2].depends_on.push('ui'); config.tasks[3].depends_on.push('ui');
  config.tasks.find(t => t.id === 'security').depends_on.push('ui');
  const h = harness(config); h.run('code'); h.run('ui'); h.run('qa'); h.run('review');
  const uiBefore = structuredClone(h.state.tasks.find(t => t.id === 'ui'));
  const oldComplete = h.event('complete', { task_id: 'qa', attempt_id: h.state.tasks.find(t => t.id === 'qa').attempts.at(-1).id,
    outcome: 'success', artifact: artifact(999), usage: { tokens: 1, cost_usd: 0 } }, 'quality');
  h.finding(); h.repair();
  assert.deepEqual(h.state.tasks.find(t => t.id === 'ui'), uiBefore);
  assert.equal(h.state.tasks.find(t => t.id === 'review').revision, 2);
  assert.throws(() => reduce(h.state, { ...oldComplete, expected_version: h.state.version }, { now: NOW }), /No matching running/);
  h.run('code'); h.run('qa'); h.run('review'); h.resolveFinding(); h.run('release');
  assert.equal(report(h.state, { now: NOW }).status, 'PRODUCTION_READY');
});

test('default example requires QA, security and fresh review, then completes VERIFIED', () => {
  const h = harness(exampleInput);
  const disabled = ['growth', 'data-analyst', 'release-manager'];
  assert.ok(exampleInput.actors.every(a => a.roles.every(role => !disabled.includes(role))));
  assert.deepEqual(exampleInput.tasks.map(t => t.role), ['backend-engineer', 'qa', 'security', 'code-review']);
  assert.ok(exampleInput.tasks.every(t => t.required));
  for (const id of ['qa', 'security', 'review']) {
    assert.throws(() => h.send('skip', { task_id: id, reason: 'Not requested' }), /required/);
  }
  h.run('backend');
  h.send('publish', { candidate: artifact(1001) });
  for (const id of ['qa', 'security', 'review']) {
    assert.deepEqual(report(h.state, { now: NOW }).ready.map(t => t.task_id), [id]);
    h.run(id);
  }
  const result = report(h.state, { now: NOW });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.usage.invocations, 4);
  assert.deepEqual(result.ready, []);
  assert.equal(new Set(h.state.tasks.map(t => t.attempts[0].actor_id)).size, 4);
});

test('release opt-in adds only a required release gate and waits for current evidence', () => {
  assert.deepEqual(exampleInputWithRelease.tasks.slice(0, -1), exampleInput.tasks);
  assert.deepEqual(exampleInputWithRelease.actors.slice(0, -1), exampleInput.actors);
  const release = exampleInputWithRelease.tasks.at(-1);
  assert.equal(release.role, 'release-manager');
  assert.equal(release.required, true);
  assert.deepEqual(release.depends_on, ['qa', 'security', 'review']);
  const h = harness(exampleInputWithRelease);
  for (const id of ['backend', 'qa', 'security', 'review']) {
    assert.equal(report(h.state, { now: NOW }).ready.some(t => t.task_id === 'release'), false);
    h.run(id);
  }
  assert.notEqual(report(h.state, { now: NOW }).status, 'PRODUCTION_READY');
  assert.deepEqual(report(h.state, { now: NOW }).ready.map(t => t.task_id), ['release']);
  h.run('release');
  assert.equal(report(h.state, { now: NOW }).status, 'PRODUCTION_READY');
  assert.equal(h.state.usage.invocations, 5);
});

test('example gates reject missing evidence with and without release opt-in', () => {
  for (const template of [exampleInput, exampleInputWithRelease]) {
    for (const gate of template.tasks.filter(t => t.kind !== 'work')) {
      const h = harness(template);
      for (const task of template.tasks) {
        if (task.id === gate.id) break;
        h.run(task.id);
      }
      h.start(gate.id); h.complete(gate.id, { evidence: [] });
      assert.equal(h.state.tasks.find(t => t.id === gate.id).status, 'blocked');
      assert.equal(report(h.state, { now: NOW }).status, 'BLOCKED');
      assert.deepEqual(report(h.state, { now: NOW }).ready, []);
    }
  }
});

for (const [role, kind] of [['growth', 'growth'], ['data-analyst', 'data'], ['copywriter', 'copy'], ['seo', 'seo']]) {
  test(`${role} can be explicitly added without enabling other assessments`, () => {
    const config = structuredClone(exampleInput);
    config.actors.push({ id: `${role}-session`, roles: [role] });
    config.tasks.push(task(role, role, 'work', ['backend'], kind));
    config.tasks.find(t => t.id === 'qa').depends_on.push(role);
    const h = harness(config);
    for (const id of ['backend', role, 'qa', 'security', 'review']) h.run(id);
    assert.equal(report(h.state, { now: NOW }).status, 'VERIFIED');
    assert.deepEqual(h.state.tasks.map(t => t.role), [...exampleInput.tasks.map(t => t.role), role]);
  });
}

test('published templates match live schema without claiming verification', () => {
  const state = createRun(exampleInput, { now: NOW });
  const next = reduce(state, exampleEvents.start, { now: NOW });
  assert.equal(next.tasks[0].status, 'running');
  for (const [name, template] of [['input', exampleInput], ['input-with-release', exampleInputWithRelease]]) {
    const result = spawnSync(process.execPath, [resolve('factory/example.mjs'), name], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /TEMPLATE ONLY/);
    assert.deepEqual(JSON.parse(result.stdout), template);
    assert.doesNotThrow(() => createRun(JSON.parse(result.stdout), { now: NOW }));
  }
});

test('actual candidate is published after implementation and after repair, never fabricated in repair event', () => {
  const h = harness();
  assert.equal(h.state.candidate_published, false);
  assert.throws(() => h.send('publish', { candidate: artifact(2) }), /Finish or skip all work/);
  h.start('code');
  assert.throws(() => h.send('publish', { candidate: artifact(2) }), /active attempts/);
  h.complete('code');
  assert.equal(report(h.state, { now: NOW }).ready.length, 0);
  const workBefore = structuredClone(h.state.tasks[0]);
  h.send('publish', { candidate: artifact(47) });
  assert.deepEqual(h.state.tasks[0], workBefore);
  assert.equal(h.state.candidate.hash, artifact(47).hash);
  assert.throws(() => h.send('publish', { candidate: artifact(49) }), /requires a routed repair/);
  h.run('qa'); h.run('review'); h.finding();
  h.repair();
  assert.equal(h.state.candidate.hash, artifact(47).hash);
  assert.equal(h.state.candidate_published, false);
  h.run('code');
  assert.equal(report(h.state, { now: NOW }).ready.length, 0);
  h.send('publish', { candidate: artifact(48) });
  assert.equal(h.state.repair_waves, 1);
  h.run('qa'); h.run('review'); h.resolveFinding(); h.run('release');
  assert.equal(report(h.state, { now: NOW }).status, 'PRODUCTION_READY');
});

test('QA report repair has independent metered recheck rather than a self-verification deadlock', () => {
  const h = harness(); h.run('code'); h.run('qa'); h.finding('qa-report', 'qa', 'test');
  h.repair(); h.run('qa');
  const gate = h.state.findings[0].recheck_task_id;
  assert.equal(report(h.state, { now: NOW }).ready.find(t => t.task_id === gate).eligible_actors.includes('quality'), false);
  assert.throws(() => h.start(gate, { actor_id: 'quality' }), /Independent/);
  h.resolveFinding('qa-report'); h.run('review'); h.run('release');
  assert.equal(h.state.tasks.find(t => t.id === gate).attempts[0].actor_id, 'quality-two');
  assert.equal(report(h.state, { now: NOW }).status, 'PRODUCTION_READY');
});

test('release report correction can finish then receive a distinct metered release-role recheck', () => {
  const h = harness(); h.run('code'); h.run('qa'); h.run('review'); h.run('release');
  h.finding('release-report', 'release', 'release'); h.repair();
  h.run('qa'); h.run('review'); h.run('release');
  assert.notEqual(report(h.state, { now: NOW }).status, 'PRODUCTION_READY');
  h.resolveFinding('release-report');
  assert.equal(h.state.tasks.find(t => t.id === 'recheck:release-report').attempts[0].actor_id, 'release-two');
  assert.equal(report(h.state, { now: NOW }).status, 'PRODUCTION_READY');
});

test('nested release recheck repair completes without waiving unrelated findings or final checks', () => {
  const config = input(); config.actors.push({ id: 'release-three', roles: ['release-manager'] });
  const h = harness(config); h.run('code'); h.run('qa'); h.run('review'); h.run('release');
  h.finding('F1', 'release', 'release'); h.repair();
  h.run('qa'); h.run('review'); h.run('release');
  h.start('recheck:F1'); h.complete('recheck:F1', { outcome: 'failed', reason: 'Release recheck omitted evidence' });
  h.finding('F2', 'recheck:F1', 'release');
  h.finding('unrelated', 'qa', 'test'); h.repair();
  h.run('qa'); h.run('security'); h.run('review');
  assert.equal(report(h.state, { now: NOW }).ready.some(t => t.task_id === 'release'), false);
  h.resolveFinding('unrelated');
  assert.equal(report(h.state, { now: NOW }).ready.some(t => t.task_id === 'release'), true);
  h.run('release'); h.resolveFinding('F1');
  assert.notEqual(report(h.state, { now: NOW }).status, 'PRODUCTION_READY');
  h.run('recheck:F2');
  assert.ok(h.state.tasks.filter(t => t.effective_required).every(t => t.status === 'done'));
  assert.notEqual(report(h.state, { now: NOW }).status, 'PRODUCTION_READY');
  h.resolveFinding('F2');
  assert.equal(report(h.state, { now: NOW }).status, 'PRODUCTION_READY');
  assert.equal(h.state.tasks.find(t => t.id === 'release').attempts.at(-1).actor_id, 'release');
  assert.equal(h.state.tasks.find(t => t.id === 'recheck:F1').attempts.at(-1).actor_id, 'release-two');
  assert.equal(h.state.tasks.find(t => t.id === 'recheck:F2').attempts.at(-1).actor_id, 'release-three');
  assert.equal(h.state.repair_waves, 2);
  assert.equal(h.state.usage.invocations, 17);
});

test('retry is bounded per task lifetime, preserves same candidate and bills every attempt', () => {
  const h = harness(); h.run('code'); h.start('qa'); h.complete('qa', { evidence: [] });
  const candidateBefore = structuredClone(h.state.candidate);
  h.send('retry', { task_id: 'qa', reason: 'Correct missing report evidence' });
  h.run('qa');
  assert.deepEqual(h.state.candidate, candidateBefore);
  assert.equal(h.state.usage.invocations, 3);
  assert.equal(h.state.tasks.find(t => t.id === 'qa').retries, 1);
  assert.throws(() => h.send('retry', { task_id: 'qa', reason: 'Rework successful report' }), /successful work requires a routed repair/);
  h.finding('qa-report', 'qa', 'test'); h.repair(); h.start('qa');
  h.complete('qa', { outcome: 'failed', reason: 'Temporary runner unavailable' });
  h.send('retry', { task_id: 'qa', reason: 'Runner restored' }); h.start('qa');
  h.complete('qa', { outcome: 'blocked', reason: 'Runner unavailable again' });
  assert.throws(() => h.send('retry', { task_id: 'qa', reason: 'One more' }), /lifetime retry limit/);
  assert.equal(h.state.tasks.find(t => t.id === 'qa').retries, 2);
});

test('retry cannot bypass a finding awaiting its global repair wave', () => {
  const h = harness(); h.start('code'); h.complete('code', { outcome: 'failed', reason: 'broken' });
  h.finding();
  assert.throws(() => h.send('retry', { task_id: 'code', reason: 'Skip repair' }), /Route unresolved findings/);
  assert.equal(h.state.repair_waves, 0);
});

test('original author cannot review after another actor repairs their output', () => {
  const config = input(); config.actors.find(a => a.id === 'backend').roles.push('code-review');
  config.actors.push({ id: 'backend-two', roles: ['backend-engineer'] });
  const h = harness(config); h.run('code'); h.finding(); h.repair();
  h.start('code', { actor_id: 'backend-two' }); h.complete('code'); h.run('qa');
  assert.throws(() => h.start('review', { actor_id: 'backend' }), /Independent/);
});

test('actual code-review and security are distinct required gates; QA must consume every required work task', () => {
  const wrongReview = input(); wrongReview.tasks.find(t => t.id === 'review').role = 'security';
  assert.throws(() => createRun(wrongReview), /review requires code-review/);
  const noSecurity = input(); noSecurity.tasks = noSecurity.tasks.filter(t => t.id !== 'security');
  assert.throws(() => createRun(noSecurity), /required security verification/);
  const unrelatedQa = input(); unrelatedQa.tasks.find(t => t.id === 'qa').depends_on = [];
  assert.throws(() => createRun(unrelatedQa), /must feed a required verification/);
  const unrelatedSecurity = input(); unrelatedSecurity.tasks.find(t => t.id === 'security').depends_on = [];
  assert.throws(() => createRun(unrelatedSecurity), /must feed required security/);
  const h = harness();
  assert.throws(() => h.send(['tick'], {}, 'backend'), /Unknown event type/);
});

test('Growth, Data, review, security and release report kinds map without guessing', () => {
  for (const [category, role] of [['growth', 'growth'], ['data', 'data-analyst'], ['copy', 'copywriter'], ['seo', 'seo'], ['review', 'code-review'],
    ['security', 'security'], ['release', 'release-manager']]) {
    assert.equal(routeFinding({ artifact_kind: category, role, kind: 'verification' }, category).owner, role);
    assert.equal(routeFinding({ artifact_kind: category, role, kind: 'verification' }, 'schema').owner, role);
    assert.equal(routeFinding({ artifact_kind: category, role, kind: 'verification' }, 'format').owner, role);
  }
  const h = harness(); h.run('code'); h.finding('unknown', 'code', 'unrecognized'); h.repair();
  assert.equal(report(h.state, { now: NOW }).status, 'BLOCKED');
  assert.equal(h.state.stopped, null); assert.equal(h.state.repair_waves, 0);
  assert.match(h.state.blocked_reason, /Preserve this run and its budget/);
});

test('cross-role actor cannot author QA then independently review without a graph dependency', () => {
  const config = input(); config.actors.find(a => a.id === 'quality').roles.push('code-review');
  const h = harness(config); h.run('code'); h.run('qa');
  assert.throws(() => h.start('review', { actor_id: 'quality' }), /Independent/);
});

test('store persists reload, rejects lock contention/stale writes, and never dereferences artifacts', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'factory-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'state.json');
  const sentinel = join(dir, 'sentinel'); await writeFile(sentinel, 'not JSON and must remain untouched');
  const config = input(); config.repository = sentinel; config.candidate.ref = sentinel;
  const state = await initialize(path, config, { now: NOW });
  assert.deepEqual(await load(path), state);
  await assert.rejects(initialize(path, config, { now: NOW }), /already exists/);
  const event = { type: 'tick', event_id: 'tick', expected_version: 0, actor_id: 'control', adapter_id: 'adapter', attested: true };
  await writeFile(`${path}.lock`, 'held externally');
  await assert.rejects(apply(path, event, { now: NOW }), /Concurrent mutation rejected/);
  assert.equal(await readFile(`${path}.lock`, 'utf8'), 'held externally');
  await rm(`${path}.lock`);
  const results = await Promise.allSettled([apply(path, event, { now: NOW }), apply(path, { ...event, event_id: 'other' }, { now: NOW })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(results.find(r => r.status === 'rejected').reason.message, /Concurrent mutation|Stale event/);
  assert.equal((await load(path)).version, 1);
  await assert.rejects(apply(path, { ...event, event_id: 'stale' }, { now: NOW }), /Stale event/);
  assert.equal(await readFile(sentinel, 'utf8'), 'not JSON and must remain untouched');
  assert.deepEqual((await readdir(dir)).sort(), ['sentinel', 'state.json']);
  const link = join(dir, 'linked.json'); await symlink(path, link);
  await assert.rejects(load(link), /non-linked/);
});

test('CLI init/show/apply roundtrip, duplicate events and lock rejection', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'factory-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const statePath = join(dir, 'state.json');
  const cli = resolve('factory/cli.mjs');
  const run = (args, payload) => spawnSync(process.execPath, [cli, ...args], {
    input: payload === undefined ? undefined : JSON.stringify(payload), encoding: 'utf8', timeout: 10000,
  });
  const initial = run(['init', statePath, '-'], input());
  assert.equal(initial.status, 0, initial.stderr);
  assert.equal(JSON.parse(initial.stdout).ready[0].task_id, 'code');
  assert.equal(run(['show', statePath]).status, 0);
  const e = { type: 'start', event_id: 'start', expected_version: 0, actor_id: 'backend', adapter_id: 'adapter', attested: true,
    task_id: 'code', attempt_id: 'attempt', reservation: { tokens: 100, cost_usd: 0.1 },
    inputs: {}, candidate: JSON.parse(initial.stdout).candidate };
  const started = run(['apply', statePath, '-'], e); assert.equal(started.status, 0, started.stderr);
  assert.equal(JSON.parse(started.stdout).usage.invocations, 1);
  const duplicate = run(['apply', statePath, '-'], e); assert.equal(duplicate.status, 0);
  assert.equal(JSON.parse(duplicate.stdout).version, 1);
  const finish = { type: 'complete', event_id: 'finish', expected_version: 1, actor_id: 'backend', adapter_id: 'adapter', attested: true,
    task_id: 'code', attempt_id: 'attempt', outcome: 'success', usage: { tokens: 10, cost_usd: 0.01 }, artifact: artifact(2) };
  const eventPath = join(dir, 'event.json'); await writeFile(eventPath, JSON.stringify(finish));
  assert.equal(run(['apply', statePath, eventPath]).status, 0);
  assert.equal(JSON.parse(run(['show', statePath]).stdout).tasks[0].status, 'done');
  await writeFile(`${statePath}.lock`, 'external');
  const locked = run(['apply', statePath, '-'], finish);
  assert.equal(locked.status, 1); assert.match(locked.stderr, /Concurrent mutation/);
  const invalid = run(['deploy', statePath]); assert.equal(invalid.status, 1);
  assert.equal((await load(statePath)).version, 2);
});

const observed = (cost_usd, extra = {}) => ({
  tokens: null, cost_usd, source_ref: 'test:reliable-attempt-receipt', cost_complete: true, ...extra,
});
const reportingInput = (extra = {}) => input({ cost_mode: undefined, ...extra });
const costs = h => report(h.state, { now: NOW }).costs;

test('new default completes all required gates without telemetry or reservations', () => {
  const h = harness(reportingInput());
  assert.equal(h.state.schema_version, 2);
  assert.equal(h.state.config.cost_mode, 'reporting_only');
  assert.equal(h.state.budget.tokens, null);
  assert.equal(h.state.budget.cost_usd, null);
  assert.equal(costs(h).known_subtotal_usd, null);
  assert.equal(costs(h).actual_cost_usd, null);
  assert.equal(costs(h).estimate.status, 'unavailable');
  assert.match(costs(h).estimate.reason, /No defensible whole-feature/);
  for (const id of ['code', 'qa', 'review', 'security', 'release']) {
    h.start(id, { reservation: undefined }); h.complete(id, { usage: undefined });
  }
  const result = report(h.state, { now: NOW });
  assert.equal(result.status, 'PRODUCTION_READY');
  assert.equal(result.costs.status, 'unavailable');
  assert.equal(result.costs.message, 'Actual cost unavailable');
  assert.equal(result.costs.unknown_attempts.length, 5);
  assert.equal(result.costs.known_subtotal_usd, null);
  assert.equal(result.reserved, null);
  assert.deepEqual(result.usage, { invocations: 5, tokens: null, cost_usd: null });
  assert.ok(h.state.tasks.every(t => t.attempts[0].usage.cost_usd === null));
});

test('whole-feature estimate validates range and assumptions without enforcing the estimate', () => {
  const estimate = { status: 'available', low_usd: 25, high_usd: 200,
    scope: 'Planning, code, tests, QA, Security, review, retries and repairs',
    model: 'Chosen model and expected workload', pricing: 'test:dated-price-source', uncertainty: 'Workload may double' };
  for (const cost_mode of ['reporting_only', 'strict']) {
    const h = harness(input({ cost_mode, cost_estimate: estimate }));
    assert.deepEqual(costs(h).estimate, estimate); assert.equal(h.state.stopped, null);
    h.start('code');
  }
  for (const patch of [{ low_usd: -1 }, { high_usd: Infinity }, { low_usd: NaN },
    { low_usd: '25' }, { high_usd: 24 }, { scope: '' }, { model: undefined },
    { pricing: null }, { uncertainty: ' ' }, { price: 2 }, { status: 'guessed' }]) {
    assert.throws(() => createRun(reportingInput({ cost_estimate: { ...estimate, ...patch } })), /cost_estimate/);
  }
  assert.doesNotThrow(() => createRun(reportingInput({ cost_estimate: { ...estimate, low_usd: 0, high_usd: 0 } })));
  for (const bad of [null, {}, { status: 'unavailable' }, { status: 'unavailable', reason: '' },
    { status: 'unavailable', reason: 'Unknown price', low_usd: 0 }]) {
    assert.throws(() => createRun(reportingInput({ cost_estimate: bad })), /cost_estimate/);
  }
  const unavailable = { status: 'unavailable', reason: 'No reliable pricing source' };
  assert.deepEqual(costs(harness(reportingInput({ cost_estimate: unavailable }))).estimate, unavailable);
});

test('unknown cost, known partial cost and reliable zero stay distinct', () => {
  for (const usage of [undefined, null, { tokens: 123, cost_usd: null, reason: 'No billing' },
    observed(0.5, { cost_complete: false, reason: 'One failed call missing' }), observed(0)]) {
    const h = harness(reportingInput()); h.start('code', { reservation: null }); h.complete('code', { usage });
    const result = report(h.state, { now: NOW });
    assert.equal(result.costs.actual_cost_usd, null, 'Unfinished feature has no actual total');
    assert.equal(result.costs.known_subtotal_usd, usage?.cost_usd ?? null);
    assert.equal(result.costs.unknown_attempts.length, usage?.cost_complete ? 0 : 1);
    assert.equal(result.costs.subtotal_is_partial, true);
    assert.equal(result.usage.tokens, usage?.tokens ?? null);
    assert.equal(result.usage.cost_usd, null);
  }
});

test('reliable zero is a valid actual only after every recorded attempt and gate finishes', () => {
  const h = harness(reportingInput());
  for (const id of ['code', 'qa', 'review', 'security', 'release']) {
    h.start(id); assert.equal(costs(h).actual_cost_usd, null);
    h.complete(id, { usage: observed(0) });
  }
  assert.equal(costs(h).scope, 'recorded_attempts');
  assert.equal(costs(h).status, 'available');
  assert.equal(costs(h).actual_cost_usd, 0);
  assert.equal(costs(h).known_subtotal_usd, 0);
  assert.equal(costs(h).subtotal_is_partial, false);
  assert.deepEqual(costs(h).unknown_attempts, []);
  assert.equal(report(h.state, { now: NOW }).usage.tokens, null, 'Token availability is independent');
});

test('reporting costs reject unreliable numbers, false completeness and malformed fields', () => {
  for (const usage of [{ tokens: 0, cost_usd: 0 }, observed(1, { source_ref: '' }),
    observed(1, { cost_complete: undefined }), observed(1, { cost_complete: 'true' }),
    observed(null), observed(null, { cost_complete: 'false', reason: 'unknown' }),
    observed(-1), observed(Infinity), observed(NaN), observed('1'),
    observed(1, { tokens: -1 }), observed(1, { tokens: 1.5 }),
    observed(1, { tokens: Number.MAX_SAFE_INTEGER + 1 }), observed(1, { tokens: '1' }),
    observed(1, { extra: 1 }), observed(1, { cost_complete: false }), {}, []]) {
    const h = harness(reportingInput()); h.start('code');
    const before = structuredClone(h.state);
    assert.throws(() => h.complete('code', { usage }), /usage|Unknown cost/);
    assert.deepEqual(h.state, before);
  }
});

test('reporting passes token/money caps and reservation overruns; strict still stops', () => {
  const h = harness(reportingInput({ budget: { tokens: 1, cost_usd: 0 } }));
  h.start('code', { reservation: { tokens: 300000, cost_usd: 50 } });
  h.complete('code', { usage: observed(100, { tokens: 400000 }) });
  assert.equal(h.state.stopped, null);
  assert.equal(h.state.tasks[0].status, 'done');
  assert.equal(costs(h).known_subtotal_usd, 100);
  assert.doesNotThrow(() => createRun(reportingInput({ budget: { tokens: 900000, cost_usd: 1000 } })));
  for (const budget of [{ tokens: -1 }, { cost_usd: Infinity }, { concurrent: 5 }, { invocations: 33 }, { repair_waves: 4 }]) {
    assert.throws(() => createRun(reportingInput({ budget })), /budget/);
  }
  const strict = harness(input()); strict.start('code');
  strict.complete('code', { usage: { tokens: 400000, cost_usd: 100 } });
  assert.match(strict.state.stopped.reason, /usage exceeded reservation/);
  assert.equal(strict.state.usage.cost_usd, 100);
  const admission = harness(input()); admission.start('code', { reservation: { tokens: 300000, cost_usd: 50 } });
  assert.match(admission.state.stopped.reason, /Reservation exceeds/);
});

test('failed, retried, rejected and invalidated reporting attempts count once', () => {
  const h = harness(reportingInput()); h.start('code');
  const event = h.complete('code', { outcome: 'failed', reason: 'Compiler failed', usage: observed(1) });
  assert.equal(reduce(h.state, event, { now: NOW }), h.state);
  assert.throws(() => reduce(h.state, { ...event, usage: observed(2) }, { now: NOW }), /collision/);
  h.send('retry', { task_id: 'code', reason: 'Compiler restored' }); h.start('code');
  h.complete('code', { usage: observed(2) });
  h.start('qa'); h.complete('qa', { evidence: [], usage: observed(3) });
  assert.equal(h.state.tasks.find(t => t.id === 'qa').attempts[0].status, 'rejected');
  h.send('retry', { task_id: 'qa', reason: 'Correct report' }); h.start('qa'); h.complete('qa', { usage: observed(4) });
  h.finding(); h.repair(); h.start('code'); h.complete('code', { usage: observed(5) });
  assert.equal(costs(h).known_subtotal_usd, 15);
  for (const id of ['qa', 'review', 'security', 'recheck:finding-1']) { h.start(id); h.complete(id, { usage: observed(1) }); }
  h.resolveFinding(); h.start('release'); h.complete('release', { usage: observed(1) });
  assert.equal(costs(h).actual_cost_usd, 20);
  assert.equal(h.state.usage.invocations, 10);
});

test('a failed unknown or partial attempt prevents actual even after a measured retry succeeds', () => {
  for (const usage of [null, observed(2, { cost_complete: false, reason: 'Missing call receipt' })]) {
    const h = harness(reportingInput()); h.start('code');
    h.complete('code', { outcome: 'failed', reason: 'Failure', usage });
    h.send('retry', { task_id: 'code', reason: 'Retry' });
    for (const id of ['code', 'qa', 'review', 'security', 'release']) { h.start(id); h.complete(id, { usage: observed(1) }); }
    assert.equal(report(h.state, { now: NOW }).status, 'PRODUCTION_READY');
    assert.equal(costs(h).status, 'unavailable');
    assert.equal(costs(h).actual_cost_usd, null);
    assert.equal(costs(h).known_subtotal_usd, 5 + (usage?.cost_usd ?? 0));
    assert.equal(costs(h).unknown_attempts.length, 1);
  }
});

test('running attempts prevent actual, but settled measured stopped attempts retain actual', () => {
  const config = reportingInput({ budget: { elapsed_ms: 10 } });
  config.tasks.push(task('optional', 'growth', 'work', [], 'growth', { required: false }));
  const h = harness(config); h.start('code'); h.complete('code', { usage: observed(1) }); h.start('optional');
  assert.equal(costs(h).known_subtotal_usd, 1);
  assert.match(costs(h).unknown_attempts[0].reason, /still running/);
  assert.equal(costs(h).actual_cost_usd, null);
  h.complete('optional', { usage: observed(2) }, NOW + 10);
  const result = report(h.state, { now: NOW + 10 });
  assert.equal(result.status, 'STOPPED');
  assert.equal(result.costs.known_subtotal_usd, 3);
  assert.equal(result.costs.actual_cost_usd, 3);
  assert.equal(result.costs.scope, 'recorded_attempts');
  assert.equal(result.costs.subtotal_is_partial, false);
  assert.match(result.costs.reason, /does not establish feature completion/);
  assert.equal(h.state.tasks.at(-1).attempts[0].status, 'rejected');
});

test('deadline-rejected measured completion reports actual incurred cost without claiming feature completion', () => {
  const h = harness(reportingInput({ budget: { elapsed_ms: 100 } })); h.start('code');
  h.complete('code', { outcome: 'failed', reason: 'Deadline failure', usage: observed(2) }, NOW + 100);
  const result = report(h.state, { now: NOW + 100 });
  assert.equal(result.status, 'STOPPED');
  assert.equal(result.costs.status, 'available');
  assert.equal(result.costs.actual_cost_usd, 2);
  assert.equal(result.usage.cost_usd, 2);
  assert.equal(result.costs.scope, 'recorded_attempts');
  assert.equal(result.costs.subtotal_is_partial, false);
  assert.deepEqual(result.costs.unknown_attempts, []);
  assert.equal(result.costs.pending_tasks.length, 4);
  assert.match(result.costs.reason, /does not establish feature completion/);
  assert.equal(h.state.tasks[0].status, 'blocked');
});

test('advancing report clock cannot erase fully measured finished costs', () => {
  const h = harness({ ...exampleInput, budget: { elapsed_ms: 100 } });
  for (const id of ['backend', 'qa', 'security', 'review']) { h.start(id); h.complete(id, { usage: observed(1) }); }
  const before = structuredClone(h.state);
  assert.equal(report(h.state, { now: NOW }).status, 'VERIFIED');
  assert.equal(costs(h).actual_cost_usd, 4);
  const after = report(h.state, { now: NOW + 100 });
  assert.equal(after.status, 'STOPPED');
  assert.equal(after.costs.actual_cost_usd, 4);
  assert.equal(after.costs.status, 'available');
  assert.equal(after.costs.subtotal_is_partial, false);
  assert.deepEqual(after.costs.unknown_attempts, []);
  assert.deepEqual(h.state, before, 'Report does not modify persisted state');
});

test('stopped unknown, partial and still-active costs remain unavailable', () => {
  for (const usage of [null, observed(2, { cost_complete: false, reason: 'Missing final receipt' })]) {
    const h = harness(reportingInput({ budget: { elapsed_ms: 100 } })); h.start('code');
    h.complete('code', { usage }, NOW + 100);
    const result = report(h.state, { now: NOW + 100 });
    assert.equal(result.status, 'STOPPED');
    assert.equal(result.costs.actual_cost_usd, null);
    assert.equal(result.costs.message, 'Actual cost unavailable');
    assert.equal(result.costs.known_subtotal_usd, usage?.cost_usd ?? null);
    assert.equal(result.costs.unknown_attempts.length, 1);
  }
  const config = reportingInput({ budget: { elapsed_ms: 100 } });
  config.tasks.push(task('optional', 'growth', 'work', [], 'growth', { required: false }));
  const h = harness(config); h.start('code'); h.complete('code', { usage: observed(2) }); h.start('optional');
  const result = report(h.state, { now: NOW + 100 });
  assert.equal(result.status, 'STOPPED');
  assert.equal(result.costs.actual_cost_usd, null);
  assert.equal(result.costs.known_subtotal_usd, 2);
  assert.match(result.costs.unknown_attempts[0].reason, /still running/);
});

test('fully settled failed or blocked gates retain incurred actual without passing verification', () => {
  for (const outcome of ['failed', 'blocked']) {
    const h = harness(exampleInput);
    for (const id of ['backend', 'qa', 'security']) { h.start(id); h.complete(id, { usage: observed(1) }); }
    h.start('review'); h.complete('review', { outcome, reason: 'Review did not pass', usage: observed(1) });
    assert.equal(report(h.state, { now: NOW }).status, 'BLOCKED');
    assert.equal(costs(h).actual_cost_usd, 4);
    assert.equal(costs(h).scope, 'recorded_attempts');
    h.send('retry', { task_id: 'review', reason: 'Retry pending review' });
    assert.equal(costs(h).actual_cost_usd, null);
    assert.equal(costs(h).known_subtotal_usd, 4);
    assert.equal(costs(h).subtotal_is_partial, true);
  }
});

test('reporting mode preserves approval, independent gates, operational caps and immutable settings', () => {
  assert.throws(() => createRun(reportingInput({ authorization: { approved: false, approved_by: 'test', scope_ref: 'test' } })), /approved/);
  const config = reportingInput({ budget: { concurrent: 1 } });
  config.actors.find(a => a.id === 'backend').roles.push('qa');
  config.tasks.push(task('optional', 'growth', 'work', [], 'growth', { required: false }));
  const h = harness(config); h.start('code');
  assert.throws(() => h.start('optional'), /Concurrent/);
  for (const patch of [{ cost_mode: 'strict' }, { cost_estimate: { status: 'unavailable', reason: 'changed' } },
    { budget: {} }, { factory_version: 'changed' }, { authorization: {} }]) {
    assert.throws(() => h.send('tick', patch), /Unknown event field/);
  }
  assert.throws(() => h.send('tick', { adapter_id: 'other' }), /attestation/);
  assert.throws(() => h.send('tick', {}, 'unknown'), /Undeclared/);
  assert.throws(() => h.send('skip', { task_id: 'qa', reason: 'Cost saving' }), /required/);
  h.complete('code'); h.send('skip', { task_id: 'optional', reason: 'Optional' });
  assert.throws(() => h.start('qa', { actor_id: 'backend' }), /Independent/);
  h.start('qa'); h.complete('qa', { evidence: [] });
  assert.equal(h.state.tasks.find(t => t.id === 'qa').status, 'blocked');
  for (let i = 0; i < 2; i++) {
    h.send('retry', { task_id: 'qa', reason: 'Retry report' }); h.start('qa'); h.complete('qa', { evidence: [] });
  }
  assert.throws(() => h.send('retry', { task_id: 'qa', reason: 'More' }), /lifetime retry/);
  const invocation = harness(reportingInput({ budget: { invocations: 3 } }));
  assert.match(invocation.state.stopped.reason, /Insufficient invocation/);
  const repairs = harness(reportingInput({ budget: { repair_waves: 0 } }));
  repairs.run('code'); repairs.finding(); repairs.repair();
  assert.match(repairs.state.stopped.reason, /repair wave limit/);
});

test('invalid modes and mixed persisted schemas fail without migrating legacy strict runs', async t => {
  for (const mode of [null, 'off', '', 0, {}]) assert.throws(() => createRun(input({ cost_mode: mode })), /cost_mode/);
  const dir = await mkdtemp(join(tmpdir(), 'factory-legacy-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'state.json');
  const legacy = createRun(input(), { now: NOW });
  delete legacy.config.cost_mode; delete legacy.config.cost_estimate;
  await writeFile(path, JSON.stringify(legacy));
  assert.deepEqual(await load(path), legacy);
  assert.equal(report(await load(path), { now: NOW }).costs.mode, 'strict');
  const start = { type: 'start', event_id: 'start', expected_version: 0, actor_id: 'backend', adapter_id: 'adapter', attested: true,
    task_id: 'code', attempt_id: 'legacy-attempt', inputs: {}, candidate: legacy.candidate };
  await assert.rejects(apply(path, start, { now: NOW }), /reservation/);
  await apply(path, { ...start, reservation: { tokens: 100, cost_usd: 0.1 } }, { now: NOW });
  const finish = { type: 'complete', event_id: 'finish', expected_version: 1, actor_id: 'backend', adapter_id: 'adapter', attested: true,
    task_id: 'code', attempt_id: 'legacy-attempt', outcome: 'failed', reason: 'Failure' };
  await assert.rejects(apply(path, finish, { now: NOW }), /usage/);
  await apply(path, { ...finish, usage: { tokens: 101, cost_usd: 0.2 } }, { now: NOW });
  const reloaded = await load(path);
  assert.equal(reloaded.schema_version, 1); assert.equal(reloaded.config.cost_mode, undefined);
  assert.match(reloaded.stopped.reason, /usage exceeded reservation/);
  assert.equal(reloaded.usage.cost_usd, 0.2);
  for (const [schema_version, cost_mode] of [[1, 'reporting_only'], [2, 'strict'], [2, undefined], [3, 'reporting_only'], [1, null]]) {
    const bad = { ...legacy, schema_version, config: { ...legacy.config, cost_mode } };
    await writeFile(path, JSON.stringify(bad));
    await assert.rejects(load(path), /mode\/schema/);
    assert.throws(() => report(bad, { now: NOW }), /mode\/schema/);
    assert.throws(() => reduce(bad, start, { now: NOW }), /mode\/schema/);
  }
});

test('reporting CLI roundtrip preserves nulls, measured partials, replay and immutable mode', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'factory-report-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'state.json');
  const call = (command, payload) => spawnSync(process.execPath, [resolve('factory/cli.mjs'), command, path,
    ...(payload === undefined ? [] : ['-'])], { input: payload === undefined ? undefined : JSON.stringify(payload), encoding: 'utf8' });
  const initial = call('init', reportingInput()); assert.equal(initial.status, 0, initial.stderr);
  assert.equal(JSON.parse(initial.stdout).costs.mode, 'reporting_only');
  let version = 0;
  for (const usage of [null, observed(1, { cost_complete: false, reason: 'Partial receipt' })]) {
    const current = JSON.parse(call('show').stdout);
    const start = { type: 'start', event_id: `start-${version}`, expected_version: version, actor_id: 'backend', adapter_id: 'adapter', attested: true,
      task_id: 'code', attempt_id: `attempt-${version}`, inputs: {}, candidate: current.candidate };
    assert.equal(call('apply', start).status, 0); version++;
    const complete = { ...start, type: 'complete', event_id: `complete-${version}`, expected_version: version, outcome: 'failed', reason: 'Failed', usage };
    delete complete.inputs; delete complete.candidate;
    const result = call('apply', complete); assert.equal(result.status, 0, result.stderr); version++;
    assert.equal(JSON.parse(call('apply', complete).stdout).version, version);
    if (usage === null) {
      const retry = { type: 'retry', event_id: 'retry', expected_version: version, actor_id: 'control', adapter_id: 'adapter', attested: true,
        task_id: 'code', reason: 'Retry' };
      assert.equal(call('apply', retry).status, 0); version++;
    }
  }
  const result = JSON.parse(call('show').stdout);
  assert.equal(result.costs.actual_cost_usd, null); assert.equal(result.costs.known_subtotal_usd, 1);
  assert.equal(result.costs.unknown_attempts.length, 2);
  const state = await load(path); assert.equal(state.schema_version, 2); assert.equal(state.usage.tokens, null);
  assert.equal(state.tasks[0].attempts[0].usage.cost_usd, null);
  const invalid = call('apply', { type: 'tick', event_id: 'switch', expected_version: version, actor_id: 'control', adapter_id: 'adapter', attested: true, cost_mode: 'strict' });
  assert.equal(invalid.status, 1); assert.match(invalid.stderr, /Unknown event field/);
  assert.equal((await load(path)).version, version);
});

test('overflow never serializes an apparent actual cost or token total', () => {
  const h = harness(reportingInput());
  for (const id of ['code', 'qa', 'review', 'security', 'release']) {
    h.start(id); h.complete(id, { usage: observed(Number.MAX_VALUE, { tokens: Number.MAX_SAFE_INTEGER }) });
  }
  const result = report(h.state, { now: NOW });
  assert.equal(result.costs.actual_cost_usd, null); assert.equal(result.costs.known_subtotal_usd, null);
  assert.equal(result.costs.status, 'unavailable'); assert.match(result.costs.reason, /numeric range/);
  assert.equal(result.usage.tokens, null);
});

test('unfinished optional gates prevent final actual even when required gates are verified', () => {
  const config = structuredClone(exampleInput);
  config.tasks.push(task('optional-review', 'code-review', 'review', ['backend'], 'review', { required: false }));
  const h = harness(config);
  for (const id of ['backend', 'qa', 'security', 'review']) { h.start(id); h.complete(id, { usage: observed(1) }); }
  assert.equal(report(h.state, { now: NOW }).status, 'VERIFIED');
  assert.equal(costs(h).actual_cost_usd, null);
  assert.deepEqual(costs(h).pending_tasks, ['optional-review']);
  h.start('optional-review');
  assert.equal(costs(h).actual_cost_usd, null);
  assert.equal(costs(h).unknown_attempts.length, 1);
  h.complete('optional-review', { usage: observed(1) });
  assert.equal(costs(h).actual_cost_usd, 5);
});
