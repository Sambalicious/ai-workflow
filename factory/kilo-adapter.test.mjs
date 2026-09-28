import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createKiloAdapter, livePreflight, normalizeOpenRouterReceipt } from './kilo-adapter.mjs';
import { initialize, load, apply } from './store.mjs';
import { reduce } from './controller.mjs';
import { exampleInput } from './example.mjs';

const NOW = 100000;
const artifact = { ref: 'test:artifact', hash: 'c'.repeat(64) };
const binding = { task_id: 'backend', attempt_id: 'attempt-1', session_id: 'ses_worker',
  actor_id: 'author-session', reservation: { tokens: 100, cost_usd: 1 } };
const request = { request_id: 'request-1', attempt_id: binding.attempt_id, session_id: binding.session_id,
  payload: { endpoint: 'offline:test', model: 'fixture-model', messages: ['private fixture prompt'] },
  reservation: { tokens: 40, cost_usd: 0.4 } };
const success = { outcome: 'success', artifact };
function receiptFor(r, usage = {}) {
  return { source: 'openrouter-response', request_id: r.request_id, session_id: r.session_id,
    attempt_id: r.attempt_id, request_hash: r.request_hash,
    response: { id: `gen-${r.request_id}`, usage: { prompt_tokens: 20, completion_tokens: 10,
      total_tokens: 30, cost: 0.2, prompt_tokens_details: { cached_tokens: 15 },
      completion_tokens_details: { reasoning_tokens: 5 }, ...usage } } };
}
async function fixture(t, { input = {}, transport = {}, now = () => NOW } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'kilo-adapter-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runPath = join(directory, 'run.json');
  await initialize(runPath, { ...structuredClone(exampleInput), ...input }, { now: now() });
  let sends = 0;
  const fake = {
    mode: 'offline',
    validate: async r => {
      assert.equal(r.payload.endpoint, 'offline:test');
      assert.equal(r.payload.model, 'fixture-model');
      return { request_hash: r.request_hash, basis: 'enforced-worst-case', reservation: r.reservation, evidence_ref: 'fixture:bound' };
    },
    sendOnce: async r => {
      sends++;
      const persisted = JSON.parse(await readFile(`${runPath}.kilo.json`, 'utf8'));
      assert.equal(persisted.requests.find(p => p.request_id === r.request_id).status, 'reserved');
      const state = await load(runPath);
      assert.equal(state.tasks.flatMap(task => task.attempts).find(a => a.id === r.attempt_id).status, 'running');
      return { outcome: 'success', receipt: receiptFor(r) };
    },
    verifyReceipt: async () => true,
    ...transport,
  };
  const options = { runPath, adapterId: 'local-adapter', transport: fake, mode: 'offline', now };
  const adapter = createKiloAdapter(options);
  return { directory, runPath, fake, adapter, now, reopen: () => createKiloAdapter(options), get sends() { return sends; } };
}
function cli(...args) {
  return spawnSync(process.execPath, [fileURLToPath(new URL('./cli.mjs', import.meta.url)), ...args], { encoding: 'utf8' });
}
async function control(f, type, payload) {
  const state = await load(f.runPath);
  return apply(f.runPath, { type, event_id: `control-${state.version}`, expected_version: state.version,
    actor_id: 'orchestrator', adapter_id: 'local-adapter', attested: true, ...payload }, { now: f.now() });
}

test('offline admission, settlement, controller CLI and all mandatory gates integrate', async t => {
  const f = await fixture(t, { now: Date.now });
  await f.adapter.bind(binding);
  const settled = await f.adapter.execute(request);
  assert.deepEqual(settled.settlement.usage, { tokens: 30, cost_usd: 0.2 });
  assert.equal(f.sends, 1);
  await f.adapter.complete(binding.attempt_id, success);
  await control(f, 'publish', { candidate: artifact });
  for (const taskId of ['qa', 'security', 'review']) {
    const { controller } = await f.adapter.inspect();
    const assignment = controller.ready.find(r => r.task_id === taskId);
    const next = { ...binding, task_id: taskId, attempt_id: `${taskId}-attempt`,
      session_id: `ses_${taskId}`, actor_id: assignment.eligible_actors[0] };
    await f.adapter.bind(next);
    await f.adapter.execute({ ...request, attempt_id: next.attempt_id, session_id: next.session_id, request_id: `${taskId}-request` });
    await f.adapter.complete(next.attempt_id, { ...success,
      evidence: assignment.checks.map(check => ({ check, artifact, candidate: assignment.candidate })) });
  }
  const state = await load(f.runPath);
  assert.deepEqual(state.usage, { invocations: 4, tokens: 120, cost_usd: 0.8 });
  const shown = cli('show', f.runPath);
  assert.equal(shown.status, 0, shown.stderr);
  const output = JSON.parse(shown.stdout);
  assert.equal(output.status, 'VERIFIED');
  assert.deepEqual(output.usage, state.usage);
  assert.equal((await f.adapter.inspect()).controller.status, 'VERIFIED');
  assert.equal(state.tasks.some(task => ['growth', 'data-analyst', 'release-manager'].includes(task.role)), false);
  const ledgerText = await readFile(`${f.runPath}.kilo.json`, 'utf8');
  assert.equal(ledgerText.includes('private fixture prompt'), false);
  const ledger = JSON.parse(ledgerText);
  assert.equal(ledger.audit.filter(a => a.type === 'reserved').length, 4);
  assert.equal(ledger.audit.filter(a => a.type === 'settled').length, 4);
  assert.deepEqual(ledger.audit.find(a => a.type === 'completed').request_ids, ['request-1']);
});

test('live mode blocks before writes or transport; preflight CLI exits nonzero', async t => {
  const f = await fixture(t);
  assert.equal(livePreflight().status, 'BLOCKED');
  const live = createKiloAdapter({ runPath: f.runPath, adapterId: 'local-adapter', transport: f.fake });
  await assert.rejects(live.bind(binding), /Live preflight BLOCKED/);
  assert.equal(f.sends, 0);
  assert.equal((await load(f.runPath)).version, 0);
  await assert.rejects(readFile(`${f.runPath}.kilo.json`), { code: 'ENOENT' });
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./kilo-adapter.mjs', import.meta.url)), 'preflight'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).status, 'BLOCKED');
});

test('duplicates survive restart without dispatch or double charging; collisions fail', async t => {
  const f = await fixture(t);
  await f.adapter.bind(binding);
  const settled = await f.adapter.execute(request);
  const second = f.reopen();
  await second.bind(binding);
  assert.deepEqual(await second.execute(request), settled);
  assert.deepEqual(await second.settle(request.request_id, settled.settlement.receipt, 'success'), settled);
  await assert.rejects(second.execute({ ...request, payload: { changed: true } }), /collision/);
  await assert.rejects(second.bind({ ...binding, session_id: 'ses_other' }), /collision/);
  await assert.rejects(second.settle(request.request_id, receiptFor(settled, { cost: 0.1 }), 'success'), /Conflicting/);
  await second.complete(binding.attempt_id, success);
  await second.complete(binding.attempt_id, success);
  await assert.rejects(second.complete(binding.attempt_id, { outcome: 'failed', reason: 'changed' }), /collision/);
  assert.equal(f.sends, 1);
  assert.equal((await load(f.runPath)).usage.tokens, 30);
});

test('timeout retains reservation, blocks retries globally, and reconciles without resend', async t => {
  let sent;
  const f = await fixture(t, { transport: { sendOnce: async r => { sent = r; throw new Error('accepted then timed out'); } } });
  await f.adapter.bind(binding);
  await assert.rejects(f.adapter.execute(request), /timed out/);
  const second = f.reopen();
  assert.equal((await second.inspect()).ledger.requests[0].status, 'unknown');
  await assert.rejects(second.execute(request), /duplicate request will not be dispatched/);
  await assert.rejects(second.execute({ ...request, request_id: 'retry-with-new-id' }), /unresolved usage/);
  await assert.rejects(second.bind({ ...binding, attempt_id: 'another' }), /unresolved usage/);
  await assert.rejects(second.complete(binding.attempt_id, { outcome: 'failed', reason: 'timeout' }), /unknown usage/);
  await assert.rejects(second.cancelUndispatched(binding.attempt_id, 'cancel'), /admitted requests/);
  assert.deepEqual((await second.inspect()).controller.reserved, binding.reservation);
  await second.settle(request.request_id, receiptFor(sent), 'failed');
  await assert.rejects(second.cancelUndispatched(binding.attempt_id, 'cancel'), /admitted requests/);
  await assert.rejects(second.execute({ ...request, request_id: 'hidden-retry' }), /explicit task retry/);
  await assert.rejects(second.complete(binding.attempt_id, success), /cannot complete successfully/);
  await second.complete(binding.attempt_id, { outcome: 'failed', reason: 'timeout with confirmed charge' });
  await control(f, 'retry', { task_id: 'backend', reason: 'Explicit bounded retry after reconciliation' });
  await second.bind({ ...binding, attempt_id: 'attempt-2' });
  f.fake.sendOnce = async r => ({ outcome: 'success', receipt: receiptFor(r, { cost: 0.1 }) });
  await second.execute({ ...request, attempt_id: 'attempt-2', request_id: 'retry-2' });
  await second.complete('attempt-2', success);
  const state = await load(f.runPath);
  assert.equal(state.usage.invocations, 2);
  assert.equal(state.usage.tokens, 60);
  assert.equal(state.usage.cost_usd, 0.2 + 0.1);
  assert.equal(state.tasks[0].attempts[0].status, 'failed');
});

test('validated no-dispatch cancellation releases zero usage and permits bounded retry', async t => {
  const f = await fixture(t, { transport: { validate: async () => { throw new Error('invalid model bounds'); } } });
  await f.adapter.bind(binding);
  await assert.rejects(f.adapter.execute(request), /invalid model bounds/);
  assert.equal(f.sends, 0);
  assert.equal((await f.adapter.inspect()).ledger.requests.length, 0);
  await assert.rejects(f.adapter.complete(binding.attempt_id, success), /Missing or unknown/);
  await assert.rejects(f.adapter.cancelUndispatched(binding.attempt_id, ''), /reason/);
  const reason = 'Bounds validation failed before admission';
  const final = await f.reopen().cancelUndispatched(binding.attempt_id, reason);
  assert.equal(final.tasks[0].status, 'blocked');
  assert.deepEqual(final.reserved, { tokens: 0, cost_usd: 0 });
  assert.deepEqual(final.usage, { invocations: 1, tokens: 0, cost_usd: 0 });
  assert.deepEqual(await f.reopen().cancelUndispatched(binding.attempt_id, reason), final);
  await assert.rejects(f.adapter.cancelUndispatched(binding.attempt_id, 'different'), /collision/);
  const { ledger } = await f.adapter.inspect();
  assert.equal(ledger.audit.at(-1).no_dispatch, true);
  assert.deepEqual(ledger.audit.at(-1).request_ids, []);
  await control(f, 'retry', { task_id: 'backend', reason: 'Correct bounds without changing scope' });
  await f.adapter.bind({ ...binding, attempt_id: 'attempt-2' });
  f.fake.validate = async r => ({ request_hash: r.request_hash, basis: 'enforced-worst-case', reservation: r.reservation, evidence_ref: 'fixture:corrected' });
  await f.adapter.execute({ ...request, attempt_id: 'attempt-2', request_id: 'request-2' });
  await f.adapter.complete('attempt-2', success);
  await assert.rejects(f.adapter.cancelUndispatched('attempt-2', 'cancel'), /admitted requests/);
  assert.deepEqual((await load(f.runPath)).usage, { invocations: 2, tokens: 30, cost_usd: 0.2 });
});

test('receipt snapshots survive caller mutation during asynchronous verification', async t => {
  for (const path of ['settle', 'execute']) {
    await t.test(path, async t => {
      let callerReceipt;
      const f = await fixture(t, { transport: { sendOnce: async r => {
        callerReceipt = receiptFor(r);
        if (path === 'settle') throw new Error('timeout');
        return { receipt: callerReceipt, outcome: 'success' };
      } } });
      await f.adapter.bind(binding);
      if (path === 'settle') await assert.rejects(f.adapter.execute(request), /timeout/);
      let entered;
      const entering = new Promise(resolve => { entered = resolve; });
      let release;
      const wait = new Promise(resolve => { release = resolve; });
      let verified;
      f.fake.verifyReceipt = async (_request, receipt, outcome) => {
        verified = structuredClone({ receipt, outcome });
        entered(); await wait; return true;
      };
      const pending = path === 'settle'
        ? f.adapter.settle(request.request_id, callerReceipt, 'success')
        : f.adapter.execute(request);
      await entering;
      callerReceipt.response.id = 'gen-unauthenticated';
      callerReceipt.response.usage.cost = 0;
      callerReceipt.response.usage.total_tokens = 0;
      callerReceipt.session_id = 'ses_unauthenticated';
      release();
      const settled = await pending;
      assert.deepEqual(settled.settlement.receipt, verified.receipt);
      assert.equal(settled.settlement.outcome, verified.outcome);
      assert.deepEqual(settled.settlement.usage, { tokens: 30, cost_usd: 0.2 });
      const { ledger } = await f.reopen().inspect();
      assert.deepEqual(ledger.requests[0].settlement, settled.settlement);
      assert.equal(ledger.audit.at(-1).provider_request_id, verified.receipt.response.id);
      await assert.rejects(f.adapter.settle('../invalid', verified.receipt, 'success'), /Invalid identifier/);
      assert.deepEqual(await f.adapter.settle(request.request_id, verified.receipt, 'success'), settled);
    });
  }
});

test('no-dispatch cancellation recovers its write-ahead event without erasing invocation', async t => {
  const f = await fixture(t);
  await f.adapter.bind(binding);
  const started = await load(f.runPath);
  await f.adapter.cancelUndispatched(binding.attempt_id, 'No request needed');
  const ledgerPath = `${f.runPath}.kilo.json`;
  const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
  ledger.pending = ledger.attempts[0].completion;
  await writeFile(ledgerPath, JSON.stringify(ledger));
  await writeFile(f.runPath, JSON.stringify(started));
  const recovered = await f.reopen().cancelUndispatched(binding.attempt_id, 'No request needed');
  assert.equal(recovered.tasks[0].status, 'blocked');
  assert.deepEqual(recovered.usage, { invocations: 1, tokens: 0, cost_usd: 0 });
  assert.equal((await load(f.runPath)).audit.length, 2);
  assert.equal((await f.adapter.inspect()).ledger.pending, null);
});

test('zero authoritative usage is valid; missing, coerced and unproven costs are not', async t => {
  const f = await fixture(t, { transport: {
    sendOnce: async r => ({ outcome: 'success', receipt: receiptFor(r, {
      prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost: 0,
      prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 },
    }) }),
  } });
  await f.adapter.bind(binding);
  await f.adapter.execute(request);
  await f.adapter.complete(binding.attempt_id, success);
  assert.deepEqual((await load(f.runPath)).usage, { invocations: 1, tokens: 0, cost_usd: 0 });
  const boundRequest = { ...request, request_hash: 'a'.repeat(64) };
  for (const cost of [undefined, null, '0', NaN, Infinity, -1]) {
    assert.throws(() => normalizeOpenRouterReceipt(boundRequest, receiptFor(boundRequest, { cost })), /amount/);
  }
  assert.throws(() => normalizeOpenRouterReceipt(boundRequest, { ...receiptFor(boundRequest), source: 'kilo-stored-cost' }), /Authoritative/);
  assert.throws(() => normalizeOpenRouterReceipt(boundRequest, receiptFor(boundRequest, { total_tokens: 45 })), /totals/);
  assert.throws(() => normalizeOpenRouterReceipt(boundRequest, receiptFor(boundRequest, { completion_tokens_details: { reasoning_tokens: 11 } })), /subset/);
  assert.throws(() => normalizeOpenRouterReceipt(request, receiptFor(request)), /request_hash/);
});

test('missing usage and failed provenance remain unknown and retain holds', async t => {
  for (const type of ['missing', 'forged', 'session', 'attempt', 'hash']) {
    await t.test(type, async t => {
      const f = await fixture(t, { transport: {
        verifyReceipt: async () => type !== 'forged',
        sendOnce: async r => {
          const receipt = receiptFor(r);
          if (type === 'missing') delete receipt.response.usage.cost;
          if (type === 'session') receipt.session_id = 'ses_other';
          if (type === 'attempt') receipt.attempt_id = 'other';
          if (type === 'hash') receipt.request_hash = 'other';
          return { outcome: 'success', receipt };
        },
      } });
      await f.adapter.bind(binding);
      await assert.rejects(f.adapter.execute(request));
      const { ledger, controller } = await f.adapter.inspect();
      assert.equal(ledger.requests[0].status, 'unknown');
      assert.deepEqual(controller.reserved, binding.reservation);
      assert.equal(controller.usage.cost_usd, 0);
    });
  }
});

test('trusted bounds bind session, payload, model and endpoint before dispatch', async t => {
  const f = await fixture(t);
  await f.adapter.bind(binding);
  await assert.rejects(f.adapter.execute({ ...request, session_id: 'ses_wrong' }), /session binding/);
  await assert.rejects(f.adapter.execute({ ...request, payload: { ...request.payload, model: 'wrong' } }));
  await assert.rejects(f.adapter.execute({ ...request, payload: { ...request.payload, endpoint: 'https://wrong' } }));
  await assert.rejects(f.adapter.execute({ ...request, payload: { value: NaN } }), /lossless JSON/);
  f.fake.validate = async r => ({ request_hash: r.request_hash, basis: 'estimate', reservation: r.reservation, evidence_ref: 'bad' });
  await assert.rejects(f.adapter.execute(request), /worst-case/);
  f.fake.validate = async r => ({ request_hash: 'wrong', basis: 'enforced-worst-case', reservation: r.reservation, evidence_ref: 'bad' });
  await assert.rejects(f.adapter.execute(request), /worst-case/);
  assert.equal(f.sends, 0);
  assert.equal((await f.adapter.inspect()).ledger.requests.length, 0);
});

test('attempt and cumulative request budgets refuse dispatch; overspend persists and halts', async t => {
  const f = await fixture(t, { input: { budget: { tokens: 100, cost_usd: 1 } } });
  await f.adapter.bind(binding);
  await f.adapter.execute(request);
  await assert.rejects(f.adapter.execute({ ...request, request_id: 'too-many', reservation: { tokens: 71, cost_usd: 0.1 } }), /remaining attempt/);
  await assert.rejects(f.adapter.execute({ ...request, request_id: 'too-costly', reservation: { tokens: 1, cost_usd: 0.81 } }), /remaining attempt/);
  f.fake.sendOnce = async r => ({ outcome: 'success', receipt: receiptFor(r, { cost: 2 }) });
  await f.adapter.execute({ ...request, request_id: 'transport-violation' });
  await assert.rejects(f.adapter.execute({ ...request, request_id: 'after-overspend' }), /bound violated/);
  const final = await f.adapter.complete(binding.attempt_id, success);
  assert.equal(final.status, 'STOPPED');
  assert.equal(final.usage.cost_usd, 2.2);
  assert.equal(final.tasks[0].attempt.status, 'rejected');
  assert.match((await f.reopen().inspect()).ledger.halted, /bound violated/);
});

test('request overspend within attempt budget still blocks the result', async t => {
  const f = await fixture(t, { transport: { sendOnce: async r => ({ outcome: 'success', receipt: receiptFor(r, { cost: 0.5 }) }) } });
  await f.adapter.bind(binding);
  await f.adapter.execute(request);
  const final = await f.adapter.complete(binding.attempt_id, success);
  assert.equal(final.tasks[0].status, 'blocked');
  assert.equal(final.usage.cost_usd, 0.5);
  await assert.rejects(f.adapter.bind({ ...binding, attempt_id: 'retry' }), /bound violated/);
});

test('controller rejected reservation cannot dispatch, including duplicate bind', async t => {
  const f = await fixture(t, { input: { budget: { tokens: 99 } } });
  await assert.rejects(f.adapter.bind(binding), /refused reservation/);
  await assert.rejects(f.adapter.bind(binding), /refused reservation/);
  await assert.rejects(f.adapter.execute(request), /stopped or blocked/);
  assert.equal(f.sends, 0);
  assert.equal((await load(f.runPath)).usage.invocations, 0);
});

test('deadline checked again after asynchronous bound validation', async t => {
  let time = NOW;
  const f = await fixture(t, { now: () => time });
  await f.adapter.bind(binding);
  const validate = f.fake.validate;
  f.fake.validate = async r => { time += 90 * 60 * 1000; return validate(r); };
  await assert.rejects(f.adapter.execute(request), /stopped or blocked/);
  assert.equal(f.sends, 0);
  assert.equal((await f.adapter.inspect()).ledger.requests.length, 0);
});

test('single writer rejects concurrent final reservations and controller CLI mutation', async t => {
  let entered;
  const entering = new Promise(resolve => { entered = resolve; });
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { transport: {
    sendOnce: async r => { entered(); await wait; return { outcome: 'success', receipt: receiptFor(r) }; },
  } });
  await f.adapter.bind({ ...binding, reservation: { tokens: 40, cost_usd: 0.4 } });
  const running = f.adapter.execute(request);
  await entering;
  try {
    await assert.rejects(f.reopen().execute({ ...request, request_id: 'concurrent' }), /Concurrent mutation/);
    await assert.rejects(f.reopen().cancelUndispatched(binding.attempt_id, 'cancel'), /Concurrent mutation/);
    const eventPath = join(f.directory, 'tick.json');
    await writeFile(eventPath, JSON.stringify({ type: 'tick', event_id: 'tick', expected_version: 1,
      actor_id: 'orchestrator', adapter_id: 'local-adapter', attested: true }));
    const result = cli('apply', f.runPath, eventPath);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Concurrent mutation/);
  } finally { release(); }
  await running;
  await assert.rejects(f.adapter.execute({ ...request, request_id: 'after-first' }), /remaining attempt/);
  assert.equal((await f.adapter.inspect()).ledger.requests.length, 1);
});

test('controller write-ahead recovery handles both sides of atomic replacement once', async t => {
  for (const side of ['before-controller-write', 'after-controller-write']) {
    await t.test(side, async t => {
      const f = await fixture(t);
      const before = await load(f.runPath);
      await f.adapter.bind(binding);
      const started = await load(f.runPath);
      const ledgerPath = `${f.runPath}.kilo.json`;
      let ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
      ledger.pending = started.audit[0].event;
      await writeFile(ledgerPath, JSON.stringify(ledger));
      if (side === 'before-controller-write') await writeFile(f.runPath, JSON.stringify(before));
      await f.reopen().inspect();
      assert.equal((await load(f.runPath)).usage.invocations, 1);
      await f.adapter.execute(request);
      const beforeComplete = await load(f.runPath);
      await f.adapter.complete(binding.attempt_id, success);
      const completed = await load(f.runPath);
      ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
      ledger.pending = ledger.attempts[0].completion;
      assert.deepEqual(reduce(beforeComplete, ledger.pending, { now: NOW }), completed);
      await writeFile(ledgerPath, JSON.stringify(ledger));
      if (side === 'before-controller-write') await writeFile(f.runPath, JSON.stringify(beforeComplete));
      await f.reopen().complete(binding.attempt_id, success);
      assert.equal((await load(f.runPath)).usage.tokens, 30);
      assert.equal(JSON.parse(await readFile(ledgerPath, 'utf8')).pending, null);
    });
  }
});

test('process death during dispatch leaves durable hold and stale lock; no automatic replay', async t => {
  const f = await fixture(t);
  await f.adapter.bind(binding);
  const moduleUrl = new URL('./kilo-adapter.mjs', import.meta.url).href;
  const code = `import { createKiloAdapter } from ${JSON.stringify(moduleUrl)};
    const adapter = createKiloAdapter({ runPath: ${JSON.stringify(f.runPath)}, adapterId: 'local-adapter',
      mode: 'offline', now: () => ${NOW}, transport: { mode: 'offline',
        validate: async r => ({ request_hash: r.request_hash, basis: 'enforced-worst-case', reservation: r.reservation, evidence_ref: 'fixture:bound' }),
        verifyReceipt: async () => true, sendOnce: async () => process.exit(17) } });
    await adapter.execute(${JSON.stringify(request)});`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.equal(child.status, 17, child.stderr);
  await assert.rejects(f.adapter.inspect(), /stale lock/);
  const ledger = JSON.parse(await readFile(`${f.runPath}.kilo.json`, 'utf8'));
  assert.equal(ledger.requests[0].status, 'reserved');
  // The test has observed child exit and inspected the journal. Production needs
  // the same explicit operator inspection, never timeout-based lock stealing.
  await rm(`${f.runPath}.lock`);
  await assert.rejects(f.reopen().cancelUndispatched(binding.attempt_id, 'cancel'), /admitted requests/);
  await assert.rejects(f.reopen().execute(request), /duplicate request will not be dispatched/);
  await assert.rejects(f.reopen().execute({ ...request, request_id: 'retry' }), /unresolved usage/);
  assert.deepEqual((await f.adapter.inspect()).controller.reserved, binding.reservation);
});

test('provider IDs cannot pay for two requests; sessions cannot alias independent actors', async t => {
  const f = await fixture(t);
  await f.adapter.bind(binding);
  const settled = await f.adapter.execute(request);
  f.fake.sendOnce = async r => {
    const receipt = receiptFor(r); receipt.response.id = settled.settlement.receipt.response.id;
    return { outcome: 'success', receipt };
  };
  await assert.rejects(f.adapter.execute({ ...request, request_id: 'duplicate-provider' }), /already accounted/);
  const unresolved = (await f.adapter.inspect()).ledger.requests[1];
  await f.adapter.settle(unresolved.request_id, receiptFor(unresolved), 'success');
  await f.adapter.complete(binding.attempt_id, success);
  await control(f, 'publish', { candidate: artifact });
  await assert.rejects(f.adapter.bind({ ...binding, task_id: 'qa', actor_id: 'qa-session', attempt_id: 'qa-attempt' }), /impersonate/);
});

test('missing or substituted ledger, bypassed completion and linked state fail closed', async t => {
  const f = await fixture(t);
  await f.adapter.bind(binding);
  const ledgerPath = `${f.runPath}.kilo.json`;
  const original = await readFile(ledgerPath, 'utf8');
  await rm(ledgerPath);
  await assert.rejects(f.adapter.inspect(), /Missing ledger/);
  await writeFile(ledgerPath, original.replace('"config_hash": "', '"config_hash": "bad'));
  await assert.rejects(f.adapter.inspect(), /mismatched/);
  await rm(ledgerPath);
  const other = join(f.directory, 'other.json');
  await writeFile(other, original);
  await symlink(other, ledgerPath);
  await assert.rejects(f.adapter.inspect(), /non-linked/);
  await rm(ledgerPath);
  await writeFile(ledgerPath, original);
  const state = await load(f.runPath);
  await apply(f.runPath, { type: 'complete', event_id: 'bypass', expected_version: state.version,
    actor_id: binding.actor_id, adapter_id: 'local-adapter', attested: true,
    task_id: binding.task_id, attempt_id: binding.attempt_id, ...success, usage: { tokens: 0, cost_usd: 0 } }, { now: NOW });
  await assert.rejects(f.adapter.inspect(), /bypassed Kilo accounting/);
});
