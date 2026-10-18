// Local attestations only: adapter/actor IDs are assertions, not authentication.
export const DEFAULT_BUDGET = Object.freeze({
  concurrent: 4, invocations: 32, repair_waves: 3,
  tokens: 200000, cost_usd: 20, elapsed_ms: null,
});
// Optional budget keys: null disables the limit, and a supplied value has no pilot cap.
const UNCAPPED = ['elapsed_ms'];
const ROLES = ['controller', 'product-manager', 'gherkin', 'architect', 'designer',
  'backend-engineer', 'frontend-engineer', 'qa', 'devops', 'security', 'growth',
  'data-analyst', 'code-review', 'release-manager'];
const KINDS = ['work', 'verification', 'review', 'release'];
const COMMON = ['type', 'event_id', 'expected_version', 'actor_id', 'adapter_id', 'attested'];
const FIELDS = {
  start: ['task_id', 'attempt_id', 'reservation', 'inputs', 'candidate'],
  complete: ['task_id', 'attempt_id', 'outcome', 'usage', 'artifact', 'evidence', 'reason'],
  finding: ['finding_id', 'category', 'subtype', 'source_task_id', 'source_attempt_id',
    'source_revision', 'candidate', 'evidence'],
  repair: ['finding_ids'], publish: ['candidate'], retry: ['task_id', 'reason'],
  resolve: ['finding_id', 'verification_task_id', 'verification_attempt_id', 'candidate'],
  skip: ['task_id', 'reason'], tick: [],
};

function ensure(value, message) { if (!value) throw new Error(message); }
function object(value, allowed, name) {
  ensure(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  for (const key of Object.keys(value)) ensure(allowed.includes(key), `Unknown ${name} field: ${key}`);
}
function text(value, name) {
  ensure(typeof value === 'string' && value.trim().length > 0 && value.length <= 4096,
    `${name} must be a nonempty string (max 4096 characters)`);
}
function id(value, name) {
  text(value, name);
  ensure(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value), `${name} is not a valid identifier`);
}
function number(value, name, positive = false, integer = false) {
  ensure(typeof value === 'number' && Number.isFinite(value) && value >= (positive ? Number.MIN_VALUE : 0)
    && (!integer || Number.isSafeInteger(value)), `${name} must be a ${positive ? 'positive' : 'nonnegative'} ${integer ? 'integer' : 'number'}`);
}
function strings(value, name, nonempty = false) {
  ensure(Array.isArray(value) && (!nonempty || value.length > 0), `${name} must be an array`);
  value.forEach(v => id(v, name));
  ensure(new Set(value).size === value.length, `${name} contains duplicates`);
}
function artifact(value, name = 'artifact') {
  object(value, ['ref', 'hash'], name);
  text(value.ref, `${name}.ref`);
  ensure(typeof value.hash === 'string' && /^[a-f0-9]{64}$/.test(value.hash), `${name}.hash must be a lowercase SHA-256 digest`);
}
function candidate(value) {
  object(value, ['ref', 'hash', 'revision'], 'candidate');
  artifact({ ref: value.ref, hash: value.hash }, 'candidate');
  number(value.revision, 'candidate.revision', true, true);
}
function metering(value, name, positive = false) {
  object(value, ['tokens', 'cost_usd'], name);
  number(value.tokens, `${name}.tokens`, positive, true);
  number(value.cost_usd, `${name}.cost_usd`, positive);
}
export function costMode(state) {
  const mode = state.config?.cost_mode;
  ensure((state.schema_version === 1 && (mode === undefined || mode === 'strict'))
    || (state.schema_version === 2 && mode === 'reporting_only'), 'Unsupported or mixed cost mode/schema');
  return state.schema_version === 1 ? 'strict' : 'reporting_only';
}
function costEstimate(value = { status: 'unavailable', reason: 'No defensible whole-feature estimate supplied' }) {
  if (value?.status === 'unavailable') {
    object(value, ['status', 'reason'], 'cost_estimate'); text(value.reason, 'cost_estimate.reason');
  } else {
    object(value, ['status', 'low_usd', 'high_usd', 'scope', 'model', 'pricing', 'uncertainty'], 'cost_estimate');
    ensure(value.status === 'available', 'cost_estimate.status must be available or unavailable');
    number(value.low_usd, 'cost_estimate.low_usd'); number(value.high_usd, 'cost_estimate.high_usd');
    ensure(value.low_usd <= value.high_usd, 'cost_estimate range is reversed');
    for (const key of ['scope', 'model', 'pricing', 'uncertainty']) text(value[key], `cost_estimate.${key}`);
  }
  return structuredClone(value);
}
function costUsage(value) {
  if (value === undefined || value === null) return {
    tokens: null, cost_usd: null, cost_complete: false, reason: 'Usage telemetry unavailable',
  };
  object(value, ['tokens', 'cost_usd', 'source_ref', 'cost_complete', 'reason'], 'usage');
  const usage = { ...value, tokens: value.tokens ?? null, cost_usd: value.cost_usd ?? null };
  if (usage.cost_complete !== undefined) ensure(typeof usage.cost_complete === 'boolean', 'usage.cost_complete must be boolean');
  if (usage.tokens !== null) number(usage.tokens, 'usage.tokens', false, true);
  if (usage.cost_usd !== null) {
    number(usage.cost_usd, 'usage.cost_usd'); text(usage.source_ref, 'usage.source_ref');
    ensure(typeof usage.cost_complete === 'boolean', 'usage.cost_complete must be boolean');
  } else {
    ensure(usage.cost_complete !== true, 'Unknown cost cannot be complete'); usage.cost_complete = false;
  }
  if (!usage.cost_complete) text(usage.reason, 'usage.reason');
  else if (usage.reason !== undefined) text(usage.reason, 'usage.reason');
  if (usage.source_ref !== undefined) text(usage.source_ref, 'usage.source_ref');
  return structuredClone(usage);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function equal(a, b) { return canonical(a) === canonical(b); }
function clock(now) { number(now, 'now', false, true); return now; }
function getTask(state, taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  ensure(task, `Unknown task: ${taskId}`);
  return task;
}
function attemptFor(task) { return task.attempts.at(-1); }
function descendants(state, roots) {
  const affected = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of state.tasks) if (!affected.has(task.id) && task.depends_on.some(d => affected.has(d))) {
      affected.add(task.id); changed = true;
    }
  }
  return affected;
}
function snapshot(task) {
  const attempt = attemptFor(task);
  return { attempt_id: attempt.id, revision: task.revision, artifact: attempt.artifact };
}
function inputsFor(state, task) {
  return Object.fromEntries(task.depends_on.map(d => [d, snapshot(getTask(state, d))]));
}
function authors(state) {
  return new Set(state.tasks.filter(t => t.kind === 'work').flatMap(t => t.attempts.map(a => a.actor_id)));
}
function dependencyAuthors(state, task) {
  return new Set(state.tasks.filter(t => t.id !== task.id && descendants(state, [t.id]).has(task.id))
    .map(t => attemptFor(t)?.actor_id).filter(Boolean));
}
function independent(state, task, actorId) {
  const finding = state.findings.find(f => f.recheck_task_id === task.id);
  const sourceAuthors = finding ? getTask(state, finding.source_task_id).attempts.map(a => a.actor_id) : [];
  const otherGateAuthors = state.tasks.filter(t => t.id !== task.id && t.kind !== 'work'
    && t.role !== task.role).flatMap(t => t.attempts.map(a => a.actor_id));
  return !authors(state).has(actorId) && !dependencyAuthors(state, task).has(actorId)
    && !sourceAuthors.includes(actorId) && !otherGateAuthors.includes(actorId);
}
function active(state) { return state.tasks.filter(t => t.status === 'running'); }
function expired(state, now) {
  return state.budget.elapsed_ms != null && now - state.created_at >= state.budget.elapsed_ms;
}
function stop(state, reason) { state.stopped = { reason, at: state.updated_at }; }

export function createRun(input, { now = Date.now() } = {}) {
  clock(now);
  object(input, ['run_id', 'work_item_id', 'repository', 'base_sha', 'factory_version',
    'trusted_adapter_id', 'authorization', 'actors', 'candidate', 'tasks', 'budget', 'cost_mode', 'cost_estimate'], 'input');
  const mode = input.cost_mode === undefined ? 'reporting_only' : input.cost_mode;
  ensure(['strict', 'reporting_only'].includes(mode), 'cost_mode must be strict or reporting_only');
  const estimate = costEstimate(input.cost_estimate);
  for (const k of ['run_id', 'work_item_id', 'factory_version', 'trusted_adapter_id']) id(input[k], k);
  text(input.repository, 'repository');
  ensure(typeof input.base_sha === 'string' && /^[a-f0-9]{40,64}$/.test(input.base_sha), 'base_sha must be a hexadecimal commit ID');
  artifact(input.candidate, 'candidate');
  object(input.authorization, ['approved', 'approved_by', 'scope_ref'], 'authorization');
  ensure(input.authorization.approved === true, 'Explicit approved implementation scope is required');
  text(input.authorization.approved_by, 'authorization.approved_by');
  text(input.authorization.scope_ref, 'authorization.scope_ref');
  ensure(Array.isArray(input.actors) && input.actors.length > 0, 'actors must be nonempty');
  const actorIds = new Set();
  for (const actor of input.actors) {
    object(actor, ['id', 'roles'], 'actor'); id(actor.id, 'actor.id'); strings(actor.roles, 'actor.roles', true);
    ensure(!actorIds.has(actor.id), `Duplicate actor ${actor.id}`); actorIds.add(actor.id);
    ensure(actor.roles.every(r => ROLES.includes(r)), 'Unknown actor role');
  }
  ensure(input.actors.some(a => a.roles.includes('controller')), 'Declare a controller actor');
  object(input.budget ?? {}, Object.keys(DEFAULT_BUDGET), 'budget');
  const budget = { ...DEFAULT_BUDGET,
    ...(mode === 'reporting_only' ? { tokens: null, cost_usd: null } : {}), ...input.budget };
  for (const [key, value] of Object.entries(budget)) {
    if (mode === 'reporting_only' && ['tokens', 'cost_usd'].includes(key)) {
      if (value !== null) number(value, `budget.${key}`, false, key === 'tokens');
      continue;
    }
    if (UNCAPPED.includes(key)) {
      if (value !== null) number(value, `budget.${key}`, true, true);
      continue;
    }
    number(value, `budget.${key}`, key !== 'repair_waves', key !== 'cost_usd');
    ensure(value <= DEFAULT_BUDGET[key], `budget.${key} cannot exceed pilot cap ${DEFAULT_BUDGET[key]}`);
  }
  ensure(Array.isArray(input.tasks) && input.tasks.length > 0, 'tasks must be nonempty');
  const tasks = input.tasks.map(t => {
    object(t, ['id', 'role', 'depends_on', 'required', 'kind', 'artifact_kind', 'component', 'checks'], 'task');
    id(t.id, 'task.id'); ensure(ROLES.includes(t.role) && t.role !== 'controller', 'Unknown task role');
    strings(t.depends_on, 'depends_on');
    ensure(typeof t.required === 'boolean', 'task.required must be boolean');
    ensure(KINDS.includes(t.kind), 'Unknown task kind'); id(t.artifact_kind, 'artifact_kind');
    if (t.component !== undefined) ensure(['backend', 'frontend'].includes(t.component), 'component must be backend or frontend');
    strings(t.checks ?? [], 'checks', t.kind !== 'work');
    ensure(t.kind !== 'work' || !t.checks?.length, 'work tasks cannot declare gate checks');
    ensure(t.kind !== 'release' || t.role === 'release-manager', 'release requires release-manager role');
    ensure(t.kind !== 'verification' || ['qa', 'security'].includes(t.role), 'verification requires qa or security role');
    ensure(t.kind !== 'review' || t.role === 'code-review', 'review requires code-review role');
    ensure(input.actors.some(a => a.roles.includes(t.role)), `No declared actor for ${t.role}`);
    return { ...structuredClone(t), checks: t.checks ?? [], effective_required: t.required,
      revision: 1, status: 'pending', retries: 0, attempts: [] };
  });
  ensure(new Set(tasks.map(t => t.id)).size === tasks.length, 'Duplicate task ID');
  const visit = (task, path = new Set(), seen = new Set()) => {
    ensure(!path.has(task.id), `DAG cycle at ${task.id}`);
    if (seen.has(task.id)) return;
    const next = new Set([...path, task.id]);
    for (const dep of task.depends_on) {
      const parent = tasks.find(t => t.id === dep); ensure(parent, `Missing dependency ${dep}`);
      visit(parent, next, seen);
    }
    seen.add(task.id);
  };
  const seen = new Set(); tasks.forEach(t => visit(t, new Set(), seen));
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tasks.filter(t => t.effective_required)) for (const dep of t.depends_on) {
      const parent = tasks.find(t => t.id === dep);
      if (!parent.effective_required) { parent.effective_required = true; changed = true; }
    }
  }
  for (const kind of ['work', 'verification', 'review']) ensure(tasks.some(t => t.kind === kind && t.effective_required), `Declare required ${kind} task`);
  ensure(tasks.some(t => t.kind === 'verification' && t.role === 'qa' && t.effective_required), 'Declare a required QA verification task');
  if (tasks.some(t => t.kind === 'release' && t.effective_required)) {
    ensure(tasks.some(t => t.kind === 'verification' && t.role === 'security' && t.effective_required),
      'Production readiness requires a required security verification task');
  }
  for (const task of tasks.filter(t => t.kind === 'work')) {
    const ancestors = tasks.filter(t => descendants({ tasks }, [t.id]).has(task.id));
    ensure(ancestors.every(t => t.kind === 'work'), 'work cannot depend on candidate gates');
    if (task.effective_required) for (const kind of ['verification', 'review']) {
      ensure(tasks.some(g => g.effective_required && g.kind === kind && g.role === (kind === 'verification' ? 'qa' : 'code-review')
        && descendants({ tasks }, [task.id]).has(g.id)),
        `Required work ${task.id} must feed a required ${kind} gate`);
    }
    if (task.effective_required && tasks.some(t => t.kind === 'release' && t.effective_required)) {
      ensure(tasks.some(g => g.effective_required && g.kind === 'verification' && g.role === 'security'
        && descendants({ tasks }, [task.id]).has(g.id)), `Required work ${task.id} must feed required security verification`);
    }
  }
  const state = {
    schema_version: mode === 'strict' ? 1 : 2, version: 0,
    config: { ...structuredClone(input), cost_mode: mode, cost_estimate: estimate }, budget,
    created_at: now, updated_at: now, candidate: { ...input.candidate, revision: 1 },
    tasks, findings: [], repair_waves: 0, candidate_published: false, blocked_reason: null,
    usage: { invocations: 0, tokens: mode === 'strict' ? 0 : null, cost_usd: mode === 'strict' ? 0 : null }, audit: [], stopped: null,
  };
  if (tasks.filter(t => t.effective_required).length > budget.invocations) stop(state, 'Insufficient invocation budget for required tasks and gates');
  return state;
}

function readyTasks(state) {
  if (state.stopped || state.blocked_reason) return [];
  const workSettled = state.tasks.filter(t => t.kind === 'work').every(t => ['done', 'skipped'].includes(t.status));
  const open = state.findings.filter(f => f.status === 'open');
  const blocked = descendants(state, open.map(f => f.source_task_id));
  const releaseChains = new Map(state.tasks.filter(t => t.kind === 'release').map(t => {
    const chain = new Set([t.id]);
    let previousSize;
    do {
      previousSize = chain.size;
      for (const finding of state.findings) if (chain.has(finding.source_task_id) && finding.recheck_task_id) {
        chain.add(finding.recheck_task_id);
      }
    } while (chain.size !== previousSize);
    return [t.id, chain];
  }));
  return state.tasks.filter(t => t.status === 'pending' && !blocked.has(t.id)
    && t.depends_on.every(d => getTask(state, d).status === 'done')
    && (t.kind === 'work' || (workSettled && state.candidate_published && open.length === 0))
    && (t.kind !== 'release' || (state.findings.every(f => f.status === 'resolved' || releaseChains.get(t.id).has(f.source_task_id))
      && state.tasks.filter(g => g.effective_required && ['verification', 'review'].includes(g.kind)
        && !descendants(state, [t.id]).has(g.id)).every(g => g.status === 'done'))));
}

export function report(state, { now = Date.now() } = {}) {
  clock(now);
  const mode = costMode(state);
  const deadline = expired(state, now);
  const unresolved = state.findings.filter(f => f.status !== 'resolved');
  const done = state.tasks.filter(t => t.effective_required).every(t => t.status === 'done');
  const ready = !deadline && !state.stopped ? readyTasks(state) : [];
  let status = 'RUNNING';
  if (state.stopped || deadline) status = 'STOPPED';
  else if (done && state.candidate_published && unresolved.length === 0 && active(state).length === 0) status = state.tasks.some(t => t.effective_required && t.kind === 'release') ? 'PRODUCTION_READY' : 'VERIFIED';
  else if (!active(state).length && (!ready.length || ready.every(t => !state.config.actors.some(a => a.roles.includes(t.role)
    && (t.kind === 'work' || independent(state, t, a.id)))))) status = 'BLOCKED';
  const reserved = mode === 'reporting_only' ? null : active(state).reduce((sum, t) => {
    const r = attemptFor(t).reservation;
    return { tokens: sum.tokens + r.tokens, cost_usd: sum.cost_usd + r.cost_usd };
  }, { tokens: 0, cost_usd: 0 });
  const attempts = state.tasks.flatMap(t => t.attempts);
  const unknown = attempts.filter(a => a.status === 'running' || !a.usage?.cost_complete);
  const measured = attempts.filter(a => a.usage?.cost_usd != null);
  const sum = measured.reduce((n, a) => n + a.usage.cost_usd, 0);
  const subtotal = measured.length && Number.isFinite(sum) ? sum : null;
  const complete = subtotal !== null && unknown.length === 0
    && (status === 'STOPPED' || state.tasks.every(t => ['done', 'skipped', 'failed', 'blocked'].includes(t.status)));
  const tokenSum = attempts.reduce((n, a) => n + (a.usage?.tokens ?? 0), 0);
  const tokens = attempts.length && attempts.every(a => a.status !== 'running' && a.usage?.tokens != null)
    && Number.isSafeInteger(tokenSum) ? tokenSum : null;
  const costs = mode === 'reporting_only' ? {
    mode, estimate: state.config.cost_estimate, scope: 'recorded_attempts',
    status: complete ? 'available' : 'unavailable',
    actual_cost_usd: complete ? subtotal : null,
    message: complete ? 'Actual cost for recorded attempts' : 'Actual cost unavailable',
    known_subtotal_usd: subtotal, subtotal_is_partial: !complete,
    reason: !Number.isFinite(sum) ? 'Cost subtotal exceeds numeric range'
      : !complete ? 'Run incomplete or cost coverage unknown'
        : status === 'STOPPED' ? 'Recorded attempts settled; stopped run does not establish feature completion' : null,
    unknown_attempts: unknown.map(a => ({ attempt_id: a.id,
      reason: a.status === 'running' ? 'Attempt still running' : a.usage?.reason ?? 'Usage telemetry unavailable' })),
    pending_tasks: state.tasks.filter(t => t.status === 'pending').map(t => t.id),
  } : { mode, estimate: state.config.cost_estimate ?? costEstimate() };
  return {
    run_id: state.config.run_id, version: state.version, status,
    reason: state.stopped?.reason ?? (deadline ? 'Elapsed deadline exceeded' : state.blocked_reason
      ?? (!state.candidate_published ? 'Publish the actual candidate after all work settles and active attempts finish'
        : status === 'BLOCKED' && ready.length ? 'No eligible independent actor for ready assignments; inspect declared identities and author history' : null)),
    assurance: 'Local trusted-adapter attestations only; no tests, agents, merge, deployment, or rule updates are executed.',
    candidate: state.candidate, candidate_published: state.candidate_published,
    repair_waves: state.repair_waves, budget: state.budget,
    usage: mode === 'strict' ? state.usage
      : { invocations: state.usage.invocations, tokens, cost_usd: costs.actual_cost_usd }, reserved, costs,
    ready: ready.map(t => ({ task_id: t.id, role: t.role, revision: t.revision,
      eligible_actors: state.config.actors.filter(a => a.roles.includes(t.role) && (t.kind === 'work' || independent(state, t, a.id))).map(a => a.id),
      inputs: inputsFor(state, t), candidate: state.candidate, checks: t.checks })),
    tasks: state.tasks.map(t => ({ id: t.id, status: t.status, revision: t.revision,
      effective_required: t.effective_required, retries: t.retries, reason: t.reason ?? null, attempt: attemptFor(t) ?? null })),
    findings: state.findings,
  };
}

export function routeFinding(task, category) {
  const fixed = {
    contract: ['contract', 'backend-engineer'], product: ['product', 'product-manager'],
    spec: ['spec', 'product-manager'], gherkin: ['gherkin', 'gherkin'],
    architecture: ['architecture', 'architect'], design: ['design', 'designer'],
    test: ['test', 'qa'], infra: ['infra', 'devops'],
    growth: ['growth', 'growth'], data: ['data', 'data-analyst'],
    review: ['review', 'code-review'], release: ['release', 'release-manager'],
  };
  if (['schema', 'format'].includes(category)) {
    const result = ['schema', 'format'].includes(task.artifact_kind) ? { owner: null } : routeFinding(task, task.artifact_kind);
    return result.owner ? result : { owner: null, verifier_role: null,
      reason: 'Schema/format finding needs a recognized artifact kind and matching producer role' };
  }
  let owner = null;
  if (['code', 'security'].includes(category) && task.artifact_kind === 'code' && task.component) owner = `${task.component}-engineer`;
  else if (category === 'security' && task.artifact_kind === 'security' && task.role === 'security') owner = 'security';
  else if (fixed[category]?.[0] === task.artifact_kind) owner = fixed[category][1];
  if (!owner || task.role !== owner) return { owner: null, verifier_role: null,
    reason: 'Unknown or inconsistent owner: category, artifact_kind, component, and source role must agree' };
  return { owner, verifier_role: category === 'security' ? 'security' : task.kind !== 'work' ? task.role : 'qa', reason: null };
}

export function reduce(previous, event, { now = Date.now() } = {}) {
  const mode = costMode(previous);
  clock(now); ensure(now >= previous.updated_at, 'Clock cannot move backwards');
  ensure(event && typeof event.type === 'string' && Object.hasOwn(FIELDS, event.type), 'Unknown event type; merge/deploy/rule updates are disabled');
  object(event, [...COMMON, ...FIELDS[event.type]], 'event');
  id(event.event_id, 'event_id');
  const duplicate = previous.audit.find(a => a.event.event_id === event.event_id);
  if (duplicate) { ensure(equal(duplicate.event, event), 'event_id collision with different payload'); return previous; }
  ensure(event.expected_version === previous.version, `Stale event: expected_version must be ${previous.version}`);
  ensure(event.adapter_id === previous.config.trusted_adapter_id && event.attested === true, 'Trusted adapter attestation required');
  const actor = previous.config.actors.find(a => a.id === event.actor_id);
  ensure(actor, 'Undeclared actor identity');
  if (['repair', 'publish', 'retry', 'skip', 'tick'].includes(event.type)) ensure(actor.roles.includes('controller'), 'Controller actor required');
  const state = structuredClone(previous);
  state.updated_at = now;
  if (expired(state, now) && !state.stopped) stop(state, 'Elapsed deadline exceeded');
  const finish = () => {
    state.version++;
    state.audit.push({ version: state.version, at: now, event: structuredClone(event) });
    return state;
  };
  if (state.stopped && !['complete', 'tick'].includes(event.type)) return finish();
  const currentCandidate = value => { candidate(value); ensure(equal(value, state.candidate), 'Stale candidate revision/ref/hash'); };
  const taskActor = task => ensure(actor.roles.includes(task.role), `Actor must have ${task.role} role`);
  switch (event.type) {
    case 'tick': break;
    case 'publish': {
      artifact(event.candidate, 'candidate');
      ensure(active(state).length === 0, 'Finish all active attempts before publishing a candidate');
      ensure(state.tasks.filter(t => t.kind === 'work').every(t => ['done', 'skipped'].includes(t.status)),
        'Finish or skip all work before publishing the actual candidate');
      ensure(!state.findings.some(f => f.status === 'open'), 'Route open findings through repair before publishing');
      if (state.candidate_published && equal(event.candidate, { ref: state.candidate.ref, hash: state.candidate.hash })) break;
      ensure(!state.candidate_published, 'A changed published candidate requires a routed repair before publication');
      state.candidate = { ...event.candidate, revision: state.candidate.revision };
      state.candidate_published = true;
      for (const task of state.tasks.filter(t => t.kind !== 'work')) {
        if (task.status !== 'pending') task.revision++;
        task.status = 'pending'; delete task.reason;
      }
      for (const finding of state.findings) finding.status = 'verifying';
      break;
    }
    case 'retry': {
      const task = getTask(state, event.task_id); text(event.reason, 'reason');
      ensure(['failed', 'blocked'].includes(task.status), 'Only failed or blocked attempts may retry; successful work requires a routed repair');
      ensure(!state.findings.some(f => f.status === 'open' && descendants(state, [f.source_task_id]).has(task.id)),
        'Route unresolved findings through repair, not retry');
      ensure(task.retries < 2, 'Task lifetime retry limit reached (2); no automatic retries remain');
      task.retries++; task.status = 'pending'; task.revision++; task.reason = event.reason;
      break;
    }
    case 'start': {
      const task = getTask(state, event.task_id); taskActor(task);
      id(event.attempt_id, 'attempt_id');
      ensure(!state.tasks.some(t => t.attempts.some(a => a.id === event.attempt_id)), 'attempt_id already used');
      currentCandidate(event.candidate);
      ensure(readyTasks(state).some(t => t.id === task.id), `Task ${task.id} is not ready; inspect dependencies/findings`);
      if (task.kind !== 'work') ensure(independent(state, task, actor.id), 'Independent gate actor must not be a candidate/dependency author');
      ensure(equal(event.inputs, inputsFor(state, task)), 'Stale or missing dependency attempt/revision/artifact bindings');
      if (mode === 'strict' || event.reservation != null) metering(event.reservation, 'reservation', true);
      const running = active(state);
      ensure(running.length < state.budget.concurrent, 'Concurrent task limit reached; finish a running attempt first');
      const remainingRequired = state.tasks.filter(t => t.effective_required && t.id !== task.id && !['done', 'running'].includes(t.status)).length;
      if (state.usage.invocations + 1 + remainingRequired > state.budget.invocations) {
        stop(state, 'Invocation budget cannot cover this task and remaining required work/gates'); break;
      }
      const reserved = running.map(t => attemptFor(t).reservation);
      if (mode === 'strict' && ['tokens', 'cost_usd'].some(k => state.usage[k] + event.reservation[k] + reserved.reduce((n, r) => n + r[k], 0) > state.budget[k])) {
        stop(state, 'Reservation exceeds remaining token/cost budget'); break;
      }
      task.status = 'running'; delete task.reason;
      if (task.kind === 'work') state.candidate_published = false;
      task.attempts.push({ id: event.attempt_id, revision: task.revision, actor_id: actor.id,
        candidate: structuredClone(state.candidate), inputs: structuredClone(event.inputs),
        reservation: structuredClone(event.reservation ?? null), started_at: now, status: 'running' });
      state.usage.invocations++;
      break;
    }
    case 'complete': {
      const task = getTask(state, event.task_id); taskActor(task);
      const attempt = attemptFor(task);
      ensure(task.status === 'running' && attempt.id === event.attempt_id, 'No matching running attempt');
      ensure(attempt.actor_id === actor.id, 'Only the declared attempt actor may complete it');
      ensure(['success', 'failed', 'blocked'].includes(event.outcome), 'outcome must be success, failed, or blocked');
      if (mode === 'strict') metering(event.usage, 'usage');
      const usage = mode === 'strict' ? structuredClone(event.usage) : costUsage(event.usage);
      const over = mode === 'strict' && ['tokens', 'cost_usd'].some(k => usage[k] > attempt.reservation[k]);
      // Even failed, late, or over-reservation calls are billable and must be retained.
      if (mode === 'strict') for (const k of ['tokens', 'cost_usd']) state.usage[k] += usage[k];
      attempt.usage = usage; attempt.finished_at = now;
      if (over) stop(state, 'Observed usage exceeded reservation; usage recorded, result rejected');
      if (state.stopped) {
        attempt.status = 'rejected'; task.status = 'blocked'; task.reason = state.stopped.reason; break;
      }
      try {
        ensure(equal(attempt.candidate, state.candidate), 'Stale completion candidate');
        ensure(equal(attempt.inputs, inputsFor(state, task)), 'Dependencies changed during attempt');
        if (event.outcome === 'success') {
          artifact(event.artifact);
          if (task.kind !== 'work') {
            ensure(independent(state, task, actor.id), 'Independent gate actor must not be a candidate/dependency author');
            ensure(Array.isArray(event.evidence) && event.evidence.length === task.checks.length, 'All declared gate checks require evidence');
            const checks = [];
            for (const evidence of event.evidence) {
              object(evidence, ['check', 'artifact', 'candidate'], 'evidence');
              ensure(task.checks.includes(evidence.check), 'Evidence check is not declared');
              artifact(evidence.artifact, 'evidence.artifact'); currentCandidate(evidence.candidate); checks.push(evidence.check);
            }
            ensure(new Set(checks).size === task.checks.length, 'Duplicate or missing gate checks');
          } else ensure(event.evidence === undefined, 'Work outputs cannot self-attest gate evidence');
          attempt.artifact = structuredClone(event.artifact);
          if (event.evidence) attempt.evidence = structuredClone(event.evidence);
          task.status = 'done'; attempt.status = 'success';
        } else {
          text(event.reason, 'reason'); task.reason = event.reason; task.status = event.outcome; attempt.status = event.outcome;
        }
      } catch (error) {
        attempt.status = 'rejected'; task.status = 'blocked'; task.reason = `Result rejected: ${error.message}; observed usage recorded`;
      }
      break;
    }
    case 'finding': {
      id(event.finding_id, 'finding_id'); id(event.category, 'category'); text(event.subtype, 'subtype');
      ensure(!state.findings.some(f => f.id === event.finding_id), 'finding_id already exists');
      currentCandidate(event.candidate); artifact(event.evidence, 'finding.evidence');
      const task = getTask(state, event.source_task_id); const attempt = attemptFor(task);
      ensure(attempt && task.status !== 'pending' && task.status !== 'running'
        && event.source_attempt_id === attempt.id && event.source_revision === task.revision, 'Finding must target the current completed/failed source attempt');
      state.findings.push({ id: event.finding_id, category: event.category, subtype: event.subtype,
        source_task_id: task.id, source_attempt_id: attempt.id, source_revision: task.revision,
        reported_by: actor.id, candidate: structuredClone(event.candidate), evidence: structuredClone(event.evidence),
        ...routeFinding(task, event.category), status: 'open', resolutions: [] });
      break;
    }
    case 'repair': {
      strings(event.finding_ids, 'finding_ids', true);
      const unresolved = state.findings.filter(f => f.status !== 'resolved');
      ensure(equal([...event.finding_ids].sort(), unresolved.map(f => f.id).sort()), 'Repair must group all unresolved findings in one global wave');
      ensure(active(state).length === 0, 'Finish all running attempts before opening a repair wave');
      if (unresolved.some(f => !f.owner)) {
        state.blocked_reason = 'Unknown/inconsistent finding owner; human scope/ownership decision required. Preserve this run and its budget.';
        break;
      }
      if (state.repair_waves >= state.budget.repair_waves) { stop(state, 'Global repair wave limit exhausted'); break; }
      const affected = descendants(state, unresolved.map(f => f.source_task_id));
      for (const task of state.tasks) if (affected.has(task.id) || task.kind !== 'work') {
        task.status = 'pending'; task.revision++; delete task.reason;
      }
      state.repair_waves++;
      state.candidate.revision++;
      state.candidate_published = false;
      state.blocked_reason = null;
      for (const finding of state.findings) {
        finding.status = 'verifying';
        if (!finding.recheck_task_id) {
          finding.recheck_task_id = `recheck:${finding.id}`;
          ensure(!state.tasks.some(t => t.id === finding.recheck_task_id), 'Reserved recheck task ID collision');
          state.tasks.push({ id: finding.recheck_task_id, role: finding.verifier_role,
            depends_on: [finding.source_task_id], required: true, effective_required: true,
            kind: 'verification', artifact_kind: { qa: 'test', security: 'security', 'code-review': 'review', 'release-manager': 'release' }[finding.verifier_role] ?? getTask(state, finding.source_task_id).artifact_kind,
            checks: [`finding:${finding.id}`],
            revision: 1, retries: 0, status: 'pending', attempts: [] });
        }
      }
      break;
    }
    case 'resolve': {
      currentCandidate(event.candidate);
      const finding = state.findings.find(f => f.id === event.finding_id);
      ensure(finding && finding.status === 'verifying', 'Finding must be awaiting independent verification after repair');
      const source = getTask(state, finding.source_task_id);
      ensure(source.status === 'done' && source.revision > finding.source_revision, 'Source repair must complete at a newer revision');
      const gate = getTask(state, event.verification_task_id); const attempt = attemptFor(gate);
      ensure(gate.id === finding.recheck_task_id, 'Resolve requires the dedicated finding recheck task');
      ensure(gate.kind !== 'work' && gate.kind !== 'release' && gate.role === finding.verifier_role,
        `Finding requires independent ${finding.verifier_role} gate`);
      ensure(gate.status === 'done' && attempt.id === event.verification_attempt_id && attempt.actor_id === actor.id,
        'Resolution actor/attempt must match a completed verification gate');
      ensure(equal(attempt.candidate, state.candidate) && attempt.evidence?.length > 0, 'Resolution needs current candidate evidence');
      ensure(!authors(state).has(actor.id), 'Finding verifier cannot be a candidate author');
      ensure(actor.id !== attemptFor(source).actor_id && actor.id !== source.attempts.find(a => a.id === finding.source_attempt_id)?.actor_id,
        'Finding verifier cannot be the original or repaired source author');
      ensure(descendants(state, [source.id]).has(gate.id), 'Verification gate must consume the repaired source through its dependency graph');
      finding.status = 'resolved'; finding.resolutions.push({ candidate: structuredClone(state.candidate),
        source_revision: source.revision, verification_task_id: gate.id, verification_attempt_id: attempt.id,
        actor_id: actor.id, at: now });
      break;
    }
    case 'skip': {
      const task = getTask(state, event.task_id); text(event.reason, 'reason');
      ensure(!task.effective_required, 'Cannot skip a required task or an ancestor of a required task');
      ensure(['pending', 'failed', 'blocked'].includes(task.status), 'Only pending/failed/blocked optional tasks may be skipped');
      task.status = 'skipped'; task.reason = event.reason; break;
    }
  }
  return finish();
}
