import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundaryReport, classify, classifyPath, forbiddenPaths, isLeadTierModel, shouldWarn, warning } from './worker-guard.mjs';

const SCRIPT = fileURLToPath(new URL('./worker-guard.mjs', import.meta.url));

const run = (input, env = {}) => spawnSync(process.execPath, [SCRIPT], { input, encoding: 'utf8', env: { ...process.env, ...env } });

const hook = (tool, input) => ({ tool_name: tool, tool_input: input });

test('implementation prompt on sonnet is blocked with the worker reminder on stderr', () => {
  assert.equal(classify('Implement the retry queue for failed uploads'), 'implementation');
  const payload = hook('Agent', {
    model: 'sonnet',
    subagent_type: 'general-purpose',
    description: 'Retry queue',
    prompt: 'Implement the retry queue for failed uploads.',
  });
  assert.equal(shouldWarn(payload), true);

  const result = run(JSON.stringify(payload));
  assert.equal(result.status, 2, 'a lead-tier implementation dispatch is blocked');
  assert.match(result.stderr, /authoring is worker tier/i);
  assert.match(result.stderr, /deepseek-v4\.1-flash/);
  assert.match(result.stderr, /one failed Flash rewrite/);
  assert.match(result.stderr, /EVE_ALLOW_LEAD=1/);
  assert.equal(warning().hookSpecificOutput.hookEventName, 'PreToolUse');
});

test('EVE_ALLOW_LEAD=1 turns the block back into the recorded warning', () => {
  const payload = hook('Agent', { model: 'sonnet', prompt: 'Implement the retry queue.' });
  const allowed = run(JSON.stringify(payload), { EVE_ALLOW_LEAD: '1' });
  assert.equal(allowed.status, 0);
  assert.match(allowed.stdout, /additionalContext/);
});

test('omitted model warns because it inherits the lead model', () => {
  assert.equal(isLeadTierModel(undefined), true);
  const payload = hook('Agent', {
    description: 'Add feature',
    prompt: 'Refactor the upload pipeline and add feature flags.',
  });
  assert.equal(shouldWarn(payload), true);
  assert.equal(run(JSON.stringify(payload)).status, 2);
  assert.equal(shouldWarn(hook('Agent', { prompt: 'Implement the change' })), true);
});

test('design, QA, review and audit prompts stay silent', () => {
  for (const prompt of [
    'Design the session schema and write the ADR.',
    'Review this diff for correctness.',
    'Run QA on the Gherkin scenarios and report gaps.',
    'Audit the repo for stale dependencies.',
    'Advise on the migration plan.',
  ]) {
    assert.equal(shouldWarn(hook('Agent', { model: 'opus', prompt })), false, prompt);
  }
  assert.equal(shouldWarn(hook('Agent', {
    model: 'sonnet',
    prompt: 'Review the auth refactor for security issues and audit the QA plan.',
  })), false);
});

test('haiku explore does not warn', () => {
  const payload = hook('Agent', {
    model: 'haiku',
    subagent_type: 'Explore',
    description: 'Search call sites',
    prompt: 'Search the repo for implement and fix call sites.',
  });
  assert.equal(shouldWarn(payload), false);
  assert.equal(run(JSON.stringify(payload)).stdout, '');
});

test('non-Agent tools do not warn', () => {
  assert.equal(shouldWarn(hook('Bash', { model: 'sonnet', prompt: 'Implement the fix' })), false);
  assert.equal(shouldWarn(hook('Edit', { command: 'node scripts/x.mjs' })), false);
  assert.equal(run(JSON.stringify(hook('Bash', { prompt: 'Implement the fix' }))).stdout, '');
});

test('bad or empty input never throws', () => {
  for (const input of ['', '   ', 'not json at all', '{"tool_name":"Agent",', 'null', '[]', '{"tool_input":{}}']) {
    const result = run(input);
    assert.equal(result.status, 0, `stdin: ${input}`);
    assert.equal(result.stdout, '', `stdin: ${input}`);
  }
  for (const payload of [null, undefined, {}, [], { tool_name: 'Agent' }, { tool_name: 'Agent', tool_input: null }]) {
    assert.doesNotThrow(() => shouldWarn(payload));
    assert.equal(shouldWarn(payload), false);
  }
  assert.equal(classify(undefined), 'other');
});

// Worker boundary (AGENTS.md "Worker routing and metrics"): contract, RLS, auth, secrets,
// architecture and truth-guard design are not the worker's to change, whatever the brief says.
test('the four files FEAT-0009 got wrong are worker-forbidden', () => {
  assert.equal(classifyPath('packages/contracts/src/documents.ts'), 'contract');
  assert.equal(classifyPath('apps/api/src/db/migrations/0039-blocked-claim-cause.ts'), 'rls');
  assert.equal(classifyPath('apps/api/src/career-profile/claim-check.ts'), 'truth-guard');
  assert.equal(classifyPath('apps/api/src/documents/blocked-claim.ts'), 'truth-guard');
});

test('copy, tests, fixtures and plumbing stay the worker\'s to change', () => {
  for (const path of [
    'apps/web/src/entities/application/model/copy.ts',
    'apps/web/src/entities/application/api/application-repository.ts',
    'apps/web/src/app/__tests__/application-detail.test.tsx',
    'apps/api/src/documents/documents.repository.ts',
    'apps/api/src/documents/documents.service.ts',
    'apps/api/src/records/details-deletion.ts',
    'features/active/FEAT-0009-blocked-claim-detail/prd.r2.md',
  ]) {
    assert.equal(classifyPath(path), null, path);
  }
});

test('architecture, auth and secrets are forbidden too', () => {
  assert.equal(classifyPath('features/active/FEAT-0009-blocked-claim-detail/architecture.r2.md'), 'architecture');
  assert.equal(classifyPath('apps/api/src/auth/session.ts'), 'auth');
  assert.equal(classifyPath('.env.local'), 'secrets');
  assert.equal(classifyPath('./packages/contracts/src/documents.ts'), 'contract');
});

test('forbiddenPaths keeps order and drops the allowed paths', () => {
  assert.deepEqual(
    forbiddenPaths([
      'apps/web/src/entities/application/model/copy.ts',
      'packages/contracts/src/documents.ts',
      'apps/api/src/db/schema.ts',
    ]),
    [
      { path: 'packages/contracts/src/documents.ts', reason: 'contract' },
      { path: 'apps/api/src/db/schema.ts', reason: 'rls' },
    ],
  );
});

test('boundaryReport names every finding, and clears an allowed diff', () => {
  assert.match(boundaryReport(['apps/web/src/pages/application-detail/ui/application-detail-page.tsx']), /^Worker boundary: clear\.$/);
  const report = boundaryReport(['packages/contracts/src/documents.ts', 'apps/api/src/career-profile/claim-check.ts']);
  assert.match(report, /packages\/contracts\/src\/documents\.ts \(contract\)/);
  assert.match(report, /apps\/api\/src\/career-profile\/claim-check\.ts \(truth-guard\)/);
});

test('the --paths CLI fails on a forbidden path and passes on a clean one', () => {
  const forbidden = spawnSync(process.execPath, [SCRIPT, '--paths'], {
    input: 'apps/web/src/entities/application/model/copy.ts\npackages/contracts/src/documents.ts\n',
    encoding: 'utf8',
  });
  assert.equal(forbidden.status, 1);
  assert.match(forbidden.stdout, /\(contract\)/);

  const clean = spawnSync(process.execPath, [SCRIPT, '--paths'], {
    input: 'apps/web/src/entities/application/model/copy.ts\n',
    encoding: 'utf8',
  });
  assert.equal(clean.status, 0);
  assert.match(clean.stdout, /clear/);
});

test('the hook still blocks when the project path goes through a symlink', () => {
  // $CLAUDE_PROJECT_DIR can be a symlinked path. The script must still run its check
  // rather than skipping main and exiting 0.
  const dir = mkdtempSync(join(tmpdir(), 'worker-guard-link-'));
  const link = join(dir, 'project');
  try {
    symlinkSync(dirname(SCRIPT), link);
    const input = JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'backend-engineer', model: 'sonnet', prompt: 'implement the endpoint' } });
    const result = spawnSync(process.execPath, [join(link, 'worker-guard.mjs')], { input, encoding: 'utf8', env: { ...process.env, EVE_ALLOW_LEAD: '' } });
    assert.equal(result.status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
