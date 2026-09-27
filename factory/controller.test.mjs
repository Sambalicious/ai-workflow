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
    run_id: 'run-1', work_item_id: 'ITEM-1', repository: '/local/repository',
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
      usage: { tokens: 80, cost_usd: 0.08 }, artifact: artifact(sequence + 10),
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

for (const [role, kind] of [['growth', 'growth'], ['data-analyst', 'data']]) {
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
  for (const [category, role] of [['growth', 'growth'], ['data', 'data-analyst'], ['review', 'code-review'],
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
