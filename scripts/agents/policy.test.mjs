import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REQUIRED_ROLES, policyProblems, projectProblems } from './policy.mjs';

// Build the compliant roles map from the pipeline's own list, so this fixture cannot pass
// by knowing fewer roles than the policy requires.
const ADVISOR_ROLES = [
  'security-review',
  'code-review',
  'api-contract',
  'design-consult',
  'advisor-consult',
  'pentester',
  'release-manager',
];
const WORKER_ROLES = ['backend-engineer', 'frontend-engineer', 'qa-authoring', 'mechanical-edit'];
const SWARM_ROLES = ['explore', 'audit'];
const ROLES = Object.fromEntries(
  REQUIRED_ROLES.map((role) => [
    role,
    WORKER_ROLES.includes(role)
      ? 'worker'
      : SWARM_ROLES.includes(role)
        ? 'swarm'
        : ADVISOR_ROLES.includes(role)
          ? 'advisor'
          : 'lead',
  ]),
);

const MODELS = {
  tiers: { lead: 'decisions', advisor: 'contract and review', swarm: 'search', worker: 'authoring' },
  clients: {
    opencode: { lead: 'anthropic/claude-sonnet-5-5', advisor: 'anthropic/claude-opus-5-5', swarm: 'opencode-go/deepseek-v4.1-flash', worker: 'opencode-go/deepseek-v4.1-flash' },
  },
  roles: ROLES,
};

async function fixture(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'policy-'));
  await mkdir(join(root, '.agents'), { recursive: true });
  await mkdir(join(root, 'scripts/agents'), { recursive: true });
  await writeFile(join(root, '.agents/models.json'), JSON.stringify(overrides.models ?? MODELS));
  await writeFile(join(root, 'AGENTS.md'), overrides.agents ?? '### Authoring is worker tier\n');
  await writeFile(join(root, 'scripts/agents/worker-guard.mjs'), overrides.guard ?? 'export const BLOCK_STDERR_PREFIX = "Blocked: ";\n');
  return root;
}

test('a compliant tree has no problems', async () => {
  const root = await fixture();
  try {
    assert.deepEqual(await policyProblems(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a gate role on the worker tier is a problem', async () => {
  const root = await fixture({ models: { ...MODELS, roles: { ...MODELS.roles, 'qa-gate': 'worker' } } });
  try {
    assert.match((await policyProblems(root)).join(' '), /gate role "qa-gate"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an authoring role on the lead tier is a problem', async () => {
  const root = await fixture({ models: { ...MODELS, roles: { ...MODELS.roles, 'backend-engineer': 'lead' } } });
  try {
    assert.match((await policyProblems(root)).join(' '), /authoring role "backend-engineer"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a pipeline role missing from models.json is a problem', async () => {
  const roles = { ...MODELS.roles };
  delete roles['pentester'];
  const root = await fixture({ models: { ...MODELS, roles } });
  try {
    assert.match((await policyProblems(root)).join(' '), /role "pentester" is named by the pipeline but missing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a missing rule section and a warn-only guard are problems', async () => {
  const root = await fixture({
    agents: 'no rule here\n',
    guard: '// warns, never blocks\n',
  });
  try {
    const problems = (await policyProblems(root)).join(' ');
    assert.match(problems, /no "Authoring is worker tier" section/);
    assert.match(problems, /still only warns/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a project must wire the worker-guard hook', async () => {
  const project = await mkdtemp(join(tmpdir(), 'policy-project-'));
  try {
    assert.match((await projectProblems(project)).join(' '), /missing/);
    await mkdir(join(project, '.claude'));
    await writeFile(join(project, '.claude/settings.json'), JSON.stringify({ hooks: {} }));
    assert.match((await projectProblems(project)).join(' '), /does not wire the worker-guard hook/);
    await writeFile(join(project, '.claude/settings.json'), JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ command: 'node x/worker-guard.mjs' }] }] } }));
    assert.deepEqual(await projectProblems(project), []);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test('an invalid models.json is reported with its parse error, not as missing', async () => {
  const root = await fixture({ models: 'x' });
  await writeFile(join(root, '.agents/models.json'), '{"tiers":');
  try {
    const problems = await policyProblems(root);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^models\.json: /);
  } finally { await rm(root, { recursive: true, force: true }); }
});
