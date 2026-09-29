#!/usr/bin/env node
// Templates only. Replace example refs/digests and obtain real approval/evidence.
// No output from this file is a test result or an implementation authorization.
import { pathToFileURL } from 'node:url';

export const exampleInput = {
  run_id: 'example-run',
  work_item_id: 'BUG-123',
  repository: '/absolute/path/to/approved/repository',
  base_sha: 'a'.repeat(40),
  factory_version: 'pilot-1',
  trusted_adapter_id: 'local-adapter',
  cost_mode: 'reporting_only',
  cost_estimate: { status: 'unavailable', reason: 'No defensible pricing or whole-feature workload estimate supplied' },
  authorization: { approved: true, approved_by: 'REPLACE-WITH-APPROVER', scope_ref: 'REPLACE-WITH-APPROVED-BRIEF' },
  candidate: { ref: 'REPLACE-WITH-CANDIDATE-REF', hash: 'b'.repeat(64) },
  actors: [
    { id: 'orchestrator', roles: ['controller'] },
    { id: 'author-session', roles: ['backend-engineer'] },
    { id: 'qa-session', roles: ['qa'] },
    { id: 'review-session', roles: ['code-review'] },
    { id: 'security-session', roles: ['security'] },
    { id: 'qa-recheck-session', roles: ['qa'] },
  ],
  tasks: [
    { id: 'backend', role: 'backend-engineer', depends_on: [], required: true,
      kind: 'work', artifact_kind: 'code', component: 'backend' },
    { id: 'qa', role: 'qa', depends_on: ['backend'], required: true,
      kind: 'verification', artifact_kind: 'test', checks: ['regression', 'full-suite'] },
    { id: 'security', role: 'security', depends_on: ['backend', 'qa'], required: true,
      kind: 'verification', artifact_kind: 'security', checks: ['security-review'] },
    { id: 'review', role: 'code-review', depends_on: ['backend', 'qa', 'security'], required: true,
      kind: 'review', artifact_kind: 'review', checks: ['independent-review'] },
  ],
};

// Select only when the user explicitly requests release assessment for a new run.
export const exampleInputWithRelease = structuredClone(exampleInput);
exampleInputWithRelease.actors.push({ id: 'release-session', roles: ['release-manager'] });
exampleInputWithRelease.tasks.push({ id: 'release', role: 'release-manager', depends_on: ['qa', 'security', 'review'], required: true,
  kind: 'release', artifact_kind: 'release', checks: ['local-release-checklist'] });

const common = {
  event_id: 'unique-event-id', expected_version: 0,
  actor_id: 'author-session', adapter_id: 'local-adapter', attested: true,
};
const candidate = { ...exampleInput.candidate, revision: 1 };
const evidence = { ref: 'REPLACE-WITH-EVIDENCE-REF', hash: 'c'.repeat(64) };
export const exampleEvents = {
  start: { ...common, type: 'start', task_id: 'backend', attempt_id: 'backend-attempt-1',
    inputs: {}, candidate },
  complete: { ...common, expected_version: 1, type: 'complete', task_id: 'backend',
    attempt_id: 'backend-attempt-1', outcome: 'success',
    usage: { tokens: null, cost_usd: null, reason: 'Usage telemetry unavailable' }, artifact: evidence },
  finding: { ...common, type: 'finding', actor_id: 'qa-session', finding_id: 'finding-1',
    category: 'code', subtype: 'regression', source_task_id: 'backend',
    source_attempt_id: 'backend-attempt-1', source_revision: 1, candidate, evidence },
  repair: { ...common, type: 'repair', actor_id: 'orchestrator', finding_ids: ['finding-1'] },
  publish: { ...common, type: 'publish', actor_id: 'orchestrator',
    candidate: { ref: 'REPLACE-WITH-ACTUAL-CANDIDATE', hash: 'd'.repeat(64) } },
  retry: { ...common, type: 'retry', actor_id: 'orchestrator', task_id: 'qa', reason: 'Correct malformed evidence report without changing code' },
  resolve: { ...common, type: 'resolve', actor_id: 'qa-session', finding_id: 'finding-1',
    verification_task_id: 'recheck:finding-1', verification_attempt_id: 'recheck-attempt-1',
    candidate: { ref: 'REPLACE-WITH-NEW-CANDIDATE', hash: 'd'.repeat(64), revision: 2 } },
  gate_complete: { ...common, type: 'complete', actor_id: 'qa-session', task_id: 'qa',
    attempt_id: 'qa-attempt-1', outcome: 'success', usage: null,
    artifact: evidence, evidence: ['regression', 'full-suite'].map(check => ({ check, artifact: evidence, candidate })) },
  failed: { ...common, type: 'complete', task_id: 'backend', attempt_id: 'backend-attempt-1',
    outcome: 'failed', reason: 'REPLACE-WITH-OBSERVED-FAILURE', usage: null },
  skip: { ...common, type: 'skip', actor_id: 'orchestrator', task_id: 'optional-task', reason: 'REPLACE-WITH-REASON' },
  tick: { ...common, type: 'tick', actor_id: 'orchestrator' },
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [name = 'input', ...extra] = process.argv.slice(2);
  const templates = { input: exampleInput, 'input-with-release': exampleInputWithRelease, ...exampleEvents };
  if (extra.length || !Object.hasOwn(templates, name)) {
    process.stderr.write(`Usage: node factory/example.mjs ${Object.keys(templates).join('|')}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write('TEMPLATE ONLY: replace all example authority, refs, hashes, usage, event IDs, versions, and evidence before use.\n');
    process.stdout.write(`${JSON.stringify(templates[name], null, 2)}\n`);
  }
}
