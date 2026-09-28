import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { locked, atomicWrite, checkFile, load } from './store.mjs';
import { reduce, report } from './controller.mjs';

const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const equal = (a, b) => canonical(a) === canonical(b);
function identifier(value) {
  ensure(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value), 'Invalid identifier');
}
function amount(value, integer = false, positive = false) {
  ensure(typeof value === 'number' && Number.isFinite(value) && value >= 0
    && (!integer || Number.isSafeInteger(value)) && (!positive || value > 0), 'Invalid usage or reservation amount');
}
function metering(value, positive = false) {
  ensure(value && equal(Object.keys(value).sort(), ['cost_usd', 'tokens']), 'Expected tokens and cost_usd');
  amount(value.tokens, true, positive); amount(value.cost_usd, false, positive);
}
function fields(value, keys) {
  ensure(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => keys.includes(key)), 'Unexpected or invalid fields');
}

// Billing authority is established by the trusted transport, not by these labels.
// OpenRouter prompt/completion totals already include cached/reasoning subsets.
export function normalizeOpenRouterReceipt(request, receipt) {
  fields(receipt, ['source', 'request_id', 'session_id', 'attempt_id', 'request_hash', 'response']);
  ensure(receipt.source === 'openrouter-response', 'Authoritative direct OpenRouter receipt required');
  for (const key of ['request_id', 'session_id', 'attempt_id', 'request_hash']) {
    if (key === 'request_hash') ensure(typeof receipt[key] === 'string' && /^[a-f0-9]{64}$/.test(receipt[key]), 'Invalid receipt request_hash');
    else identifier(receipt[key]);
    ensure(receipt[key] === request[key], `Receipt ${key} mismatch`);
  }
  fields(receipt.response, ['id', 'usage']);
  identifier(receipt.response.id);
  const usage = receipt.response.usage;
  ensure(usage && typeof usage === 'object', 'Missing authoritative usage');
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens']) amount(usage[key], true);
  amount(usage.cost);
  ensure(Number.isSafeInteger(usage.prompt_tokens + usage.completion_tokens)
    && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens, 'Inconsistent token totals');
  for (const [detail, key, maximum] of [
    ['prompt_tokens_details', 'cached_tokens', usage.prompt_tokens],
    ['completion_tokens_details', 'reasoning_tokens', usage.completion_tokens],
  ]) {
    if (usage[detail]?.[key] !== undefined) {
      amount(usage[detail][key], true);
      ensure(usage[detail][key] <= maximum, 'Token subset exceeds total');
    }
  }
  return { tokens: usage.total_tokens, cost_usd: usage.cost };
}

export function livePreflight() {
  return { status: 'BLOCKED', reasons: [
    'No installed Kilo transport enforces admission before every billable request, retry, or fallback.',
    'No live verifier proves worst-case token/cost bounds and authoritative billing for successes and failures.',
    'Kilo stored cost, estimates, and cost nudges are not billing proof or provider-side hard caps.',
  ] };
}

// Trusted host API, not an agent-facing permission boundary. Offline only until a
// real Kilo transport and its billing/bounds guarantees are independently verified.
export function createKiloAdapter({ runPath, adapterId, transport, mode = 'live', now = Date.now }) {
  identifier(adapterId);
  function offline() {
    ensure(mode === 'offline', `Live preflight BLOCKED: ${livePreflight().reasons.join(' ')}`);
    ensure(transport?.mode === 'offline' && ['validate', 'sendOnce', 'verifyReceipt'].every(k => typeof transport[k] === 'function'),
      'An explicitly trusted offline transport is required');
  }
  async function transaction(action) {
    offline();
    return locked(runPath, async path => {
      let state = await load(path);
      ensure(state.config.trusted_adapter_id === adapterId, 'Controller adapter identity mismatch');
      const ledgerPath = `${path}.kilo.json`;
      await checkFile(ledgerPath, true);
      let ledger;
      try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        ensure(state.usage.invocations === 0, 'Missing ledger for started run; recovery requires original accounting');
        ledger = { schema_version: 1, run_id: state.config.run_id, config_hash: digest(state.config),
          adapter_id: adapterId, attempts: [], requests: [], audit: [], pending: null, halted: null };
      }
      ensure(ledger.schema_version === 1 && ledger.run_id === state.config.run_id
        && ledger.config_hash === digest(state.config) && ledger.adapter_id === adapterId
        && Array.isArray(ledger.attempts) && Array.isArray(ledger.requests) && Array.isArray(ledger.audit), 'Invalid or mismatched Kilo ledger');
      const save = () => atomicWrite(ledgerPath, ledger);
      const audit = (type, details) => ledger.audit.push({ sequence: ledger.audit.length + 1, at: now(), type, ...details });
      async function replay() {
        if (!ledger.pending) return;
        const next = reduce(state, ledger.pending, { now: now() });
        await atomicWrite(path, next);
        state = next; ledger.pending = null; await save();
      }
      await replay();
      // Direct CLI lifecycle writes must not silently bypass request accounting.
      for (const task of state.tasks) for (const attempt of task.attempts) {
        const binding = ledger.attempts.find(a => a.attempt_id === attempt.id);
        ensure(binding && binding.task_id === task.id && binding.actor_id === attempt.actor_id
          && equal(binding.reservation, attempt.reservation), 'Unaccounted controller attempt');
        ensure(attempt.status === 'running' || (binding.completion
          && state.audit.some(a => equal(a.event, binding.completion))), 'Completion bypassed Kilo accounting');
      }
      async function commit(event) {
        // Validate before journaling; replay completes either side of a crash.
        reduce(state, event, { now: now() });
        ledger.pending = event; await save(); await replay();
      }
      const event = (type, actor_id, event_id, payload) => ({ type, actor_id, event_id,
        expected_version: state.version, adapter_id: adapterId, attested: true, ...payload });
      function admission() {
        ensure(!ledger.halted, ledger.halted);
        ensure(!ledger.requests.some(r => r.status === 'reserved' || r.status === 'unknown'),
          'Unknown or unresolved usage blocks admission; reservations retained');
        ensure(report(state, { now: now() }).status === 'RUNNING' && !state.blocked_reason, 'Controller is stopped or blocked');
      }
      function bindingFor(attempt_id) {
        const binding = ledger.attempts.find(a => a.attempt_id === attempt_id);
        ensure(binding, 'Unbound Kilo attempt');
        const task = state.tasks.find(t => t.id === binding.task_id);
        ensure(task.status === 'running' && task.attempts.at(-1).id === attempt_id && !binding.completion,
          'No matching running controller attempt');
        return binding;
      }
      return action({ get state() { return state; }, ledger, save, audit, commit, event, admission, bindingFor });
    });
  }

  async function settleRequest(ctx, request, receipt, outcome) {
    receipt = structuredClone(receipt);
    ensure(['success', 'failed'].includes(outcome), 'Request outcome must be success or failed');
    const usage = normalizeOpenRouterReceipt(request, receipt);
    ensure(await transport.verifyReceipt(structuredClone(request), structuredClone(receipt), outcome) === true,
      'Transport did not authenticate billing provenance');
    const settlement = { receipt: structuredClone(receipt), usage, outcome };
    if (request.status === 'settled') {
      ensure(equal(request.settlement, settlement), 'Conflicting duplicate settlement');
      return structuredClone(request);
    }
    ensure(!ctx.ledger.requests.some(r => r !== request && r.settlement?.receipt.response.id === receipt.response.id),
      'Provider request ID already accounted');
    request.status = 'settled'; request.settlement = settlement;
    if (usage.tokens > request.reservation.tokens || usage.cost_usd > request.reservation.cost_usd) {
      ctx.ledger.halted = 'Observed usage exceeded request reservation; transport bound violated';
    }
    ctx.audit('settled', { request_id: request.request_id, provider_request_id: receipt.response.id, usage, outcome });
    await ctx.save();
    return structuredClone(request);
  }

  async function complete(attemptId, result, noDispatch = false) {
    identifier(attemptId);
    result = structuredClone(result);
    return transaction(async ctx => {
      fields(result, ['outcome', 'artifact', 'evidence', 'reason']);
      const binding = ctx.ledger.attempts.find(a => a.attempt_id === attemptId);
      ensure(binding, 'Unbound Kilo attempt');
      const requests = ctx.ledger.requests.filter(r => r.attempt_id === attemptId);
      if (noDispatch) {
        // Every send is preceded by a durable request under this same lock.
        // Absence proves no dispatch only within the trusted mediated transport.
        ensure(requests.length === 0, 'Cannot cancel an attempt with admitted requests');
        ensure(result.outcome === 'blocked' && typeof result.reason === 'string'
          && result.reason.trim().length > 0 && result.reason.length <= 4096, 'Cancellation requires a nonempty reason (max 4096 characters)');
      }
      if (binding.completion) {
        ensure(binding.result_hash === digest(result) && Boolean(binding.no_dispatch) === noDispatch, 'Completion collision');
        return report(ctx.state, { now: now() });
      }
      ctx.bindingFor(attemptId);
      ensure(noDispatch || (requests.length && requests.every(r => r.status === 'settled')), 'Missing or unknown usage; cannot complete or release reservation');
      ensure(result.outcome !== 'success' || requests.every(r => r.settlement.outcome === 'success'), 'Failed request cannot complete successfully');
      const usage = requests.reduce((sum, r) => ({ tokens: sum.tokens + r.settlement.usage.tokens,
        cost_usd: sum.cost_usd + r.settlement.usage.cost_usd }), { tokens: 0, cost_usd: 0 });
      metering(usage);
      const completion = ctx.event('complete', binding.actor_id, `kilo-complete:${binding.binding_hash}`, {
        ...(ctx.ledger.halted ? { outcome: 'blocked', reason: ctx.ledger.halted } : result),
        task_id: binding.task_id, attempt_id: attemptId, usage,
      });
      binding.completion = completion; binding.result_hash = digest(result);
      if (noDispatch) binding.no_dispatch = true;
      ctx.audit('completed', { attempt_id: attemptId, event_id: completion.event_id,
        request_ids: requests.map(r => r.request_id), usage, ...(noDispatch ? { no_dispatch: true } : {}) });
      await ctx.commit(completion);
      return report(ctx.state, { now: now() });
    });
  }

  return {
    preflight: livePreflight,
    inspect: () => transaction(ctx => ({ controller: report(ctx.state, { now: now() }), ledger: structuredClone(ctx.ledger) })),
    bind: binding => transaction(async ctx => {
      fields(binding, ['task_id', 'attempt_id', 'session_id', 'actor_id', 'reservation']);
      for (const key of ['task_id', 'attempt_id', 'session_id', 'actor_id']) identifier(binding[key]);
      metering(binding.reservation, true);
      const existing = ctx.ledger.attempts.find(a => a.attempt_id === binding.attempt_id);
      if (existing) {
        ensure(equal(existing.binding_hash, digest(binding)), 'Attempt binding collision');
        ensure(ctx.state.tasks.find(t => t.id === binding.task_id)?.attempts.some(a => a.id === binding.attempt_id),
          'Controller refused reservation; no request dispatched');
        return structuredClone(existing);
      }
      ctx.admission();
      ensure(!ctx.ledger.attempts.some(a => a.session_id === binding.session_id && a.actor_id !== binding.actor_id),
        'Kilo session cannot impersonate a different actor');
      const assignment = report(ctx.state, { now: now() }).ready.find(t => t.task_id === binding.task_id);
      ensure(assignment?.eligible_actors.includes(binding.actor_id), 'No eligible ready assignment');
      const entry = { ...structuredClone(binding), binding_hash: digest(binding), completion: null };
      const start = ctx.event('start', binding.actor_id, `kilo-start:${digest(binding)}`, {
        task_id: binding.task_id, attempt_id: binding.attempt_id, reservation: binding.reservation,
        inputs: assignment.inputs, candidate: assignment.candidate,
      });
      ctx.ledger.attempts.push(entry);
      ctx.audit('bound', { attempt_id: binding.attempt_id, session_id: binding.session_id, event_id: start.event_id });
      await ctx.commit(start);
      ensure(ctx.state.tasks.find(t => t.id === binding.task_id).attempts.at(-1)?.id === binding.attempt_id
        && !ctx.state.stopped, 'Controller refused reservation; no request dispatched');
      return structuredClone(entry);
    }),
    execute: input => transaction(async ctx => {
      fields(input, ['request_id', 'attempt_id', 'session_id', 'payload', 'reservation']);
      for (const key of ['request_id', 'attempt_id', 'session_id']) identifier(input[key]);
      metering(input.reservation, true);
      // Reject lossy/non-JSON payloads before hashing or giving them to transport.
      const frozen = JSON.parse(JSON.stringify(input));
      ensure(isDeepStrictEqual(frozen, input) && input.payload !== undefined, 'Request must be lossless JSON');
      const request_hash = digest(frozen);
      const existing = ctx.ledger.requests.find(r => r.request_id === input.request_id);
      if (existing) {
        ensure(existing.request_hash === request_hash, 'Request ID collision');
        ensure(existing.status === 'settled', 'Unknown usage; duplicate request will not be dispatched');
        return structuredClone(existing);
      }
      ctx.admission();
      const binding = ctx.bindingFor(input.attempt_id);
      ensure(binding.session_id === input.session_id, 'Kilo session binding mismatch');
      const prior = ctx.ledger.requests.filter(r => r.attempt_id === input.attempt_id);
      ensure(prior.every(r => r.settlement?.outcome === 'success'), 'Failed request requires controller completion and explicit task retry');
      for (const key of ['tokens', 'cost_usd']) {
        ensure(prior.reduce((sum, r) => sum + r.settlement.usage[key], 0) + input.reservation[key] <= binding.reservation[key],
          'Request exceeds remaining attempt reservation');
      }
      const request = { ...frozen, request_hash, status: 'reserved' };
      const proof = await transport.validate(structuredClone(request));
      fields(proof, ['request_hash', 'basis', 'reservation', 'evidence_ref']);
      ensure(proof.request_hash === request_hash && proof.basis === 'enforced-worst-case'
        && equal(proof.reservation, input.reservation) && typeof proof.evidence_ref === 'string' && proof.evidence_ref.trim(),
        'Trusted transport must validate enforced worst-case bounds, not estimates');
      ctx.admission();
      request.proof = structuredClone(proof);
      // Persist only the payload digest, not prompts, credentials, or model output.
      delete request.payload;
      ctx.ledger.requests.push(request);
      ctx.audit('reserved', { request_id: request.request_id, attempt_id: request.attempt_id, request_hash, reservation: request.reservation });
      await ctx.save();
      try {
        ensure(report(ctx.state, { now: now() }).status === 'RUNNING', 'Controller deadline exceeded before dispatch');
        // The transport must make exactly one request, with no internal retries,
        // fallback, hidden billable calls, or changes to the validated payload.
        const result = await transport.sendOnce({ ...structuredClone(request), payload: frozen.payload });
        return await settleRequest(ctx, request, result.receipt, result.outcome);
      } catch (error) {
        if (request.status !== 'settled') request.status = 'unknown';
        ctx.audit('unresolved', { request_id: request.request_id });
        await ctx.save();
        throw error;
      }
    }),
    settle: async (requestId, receipt, outcome) => {
      identifier(requestId);
      receipt = structuredClone(receipt);
      ensure(['success', 'failed'].includes(outcome), 'Request outcome must be success or failed');
      return transaction(async ctx => {
        const request = ctx.ledger.requests.find(r => r.request_id === requestId);
        ensure(request, 'Unknown request ID');
        return settleRequest(ctx, request, receipt, outcome);
      });
    },
    complete: (attemptId, result) => complete(attemptId, result),
    cancelUndispatched: (attemptId, reason) => complete(attemptId, { outcome: 'blocked', reason }, true),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || process.argv[2] !== 'preflight') {
    process.stderr.write('Usage: node factory/kilo-adapter.mjs preflight\n');
    process.exitCode = 1;
  } else {
    process.stdout.write(`${JSON.stringify(livePreflight(), null, 2)}\n`);
    process.exitCode = 2;
  }
}
