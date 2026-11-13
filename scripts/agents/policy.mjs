#!/usr/bin/env node
// Checks the tier policy itself, not just the generated files. Run by `agents:check`
// in CI, so a pull request that drifts from the policy fails instead of being caught
// in review by memory.
// Usage: node scripts/agents/policy.mjs [--check]
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModel } from './which-model.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TIERS = ['lead', 'advisor', 'swarm', 'worker'];
const REVIEW_ROLES = [
  'qa-gate',
  'security-review',
  'security-threat-model',
  'code-review',
  'api-contract',
  'design-consult',
  'pentester',
  'release-manager',
];

// Every dispatchable role must resolve. A role the pipeline names but models.json omits
// makes `which-model` exit 1, and the Role model policy treats that as a protocol error,
// so the role cannot be dispatched at all — an opt-in role that is silently unrunnable.
export const REQUIRED_ROLES = [
  'product-manager',
  'spec-writer',
  'architect',
  'designer-spec',
  'designer-preview',
  'designer-review',
  'design-consult',
  'copywriter',
  'seo',
  'devops',
  'qa-gate',
  'security-threat-model',
  'security-review',
  'api-contract',
  'code-review',
  'advisor-consult',
  'backend-engineer',
  'frontend-engineer',
  'qa-authoring',
  'mechanical-edit',
  'pentester',
  'growth',
  'data-analyst',
  'release-manager',
  'explore',
  'audit',
];

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readText(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

export async function policyProblems(root = ROOT) {
  const problems = [];
  const models = await readJson(join(root, '.agents/models.json'));
  if (models === null) return ['no .agents/models.json'];

  const clients = Object.keys(models.clients ?? {});
  const roles = models.roles ?? {};
  const tiers = models.tiers ?? {};

  for (const tier of TIERS) {
    if (!tiers[tier]) problems.push(`tier "${tier}" has no description`);
    for (const client of clients) {
      if (!models.clients[client][tier]) problems.push(`client "${client}" has no model for tier "${tier}"`);
    }
  }
  if (Object.keys(roles).length === 0) problems.push('no roles map in .agents/models.json');
  for (const [role, tier] of Object.entries(roles)) {
    if (!TIERS.includes(tier)) problems.push(`role "${role}" maps to unknown tier "${tier}"`);
    for (const client of clients) {
      try {
        resolveModel(models, role, client);
      } catch (error) {
        problems.push(`${role} on ${client}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // Authoring is worker tier: the rule must be present, and the gates must not be.
  const agents = await readText(join(root, 'AGENTS.md'));
  if (!agents.includes('### Authoring is worker tier')) problems.push('AGENTS.md has no "Authoring is worker tier" section');
  for (const role of REQUIRED_ROLES) {
    if (!roles[role]) problems.push(`role "${role}" is named by the pipeline but missing from .agents/models.json`);
  }
  for (const role of REVIEW_ROLES) {
    if (roles[role] && roles[role] !== 'lead' && roles[role] !== 'advisor') {
      problems.push(`gate role "${role}" must be lead or advisor, not "${roles[role]}"`);
    }
  }
  for (const role of ['backend-engineer', 'frontend-engineer', 'qa-authoring']) {
    if (roles[role] && roles[role] !== 'worker') problems.push(`authoring role "${role}" must be worker, not "${roles[role]}"`);
  }

  // The dispatch hook must actually block. export.mjs wires it into a client's settings.
  const guard = await readText(join(root, 'scripts/agents/worker-guard.mjs'));
  if (guard.includes('warns, never blocks')) problems.push('worker-guard still only warns; blocking mode is required');
  if (!guard.includes('BLOCK_STDERR_PREFIX')) problems.push('worker-guard has no blocking reason');

  return problems;
}

// A project that uses Claude Code must wire the dispatch guard, or the worker-tier rule is
// only convention. Run with --project <dir> in the project's own check.
export async function projectProblems(project) {
  const settings = await readJson(join(project, '.claude/settings.json'), null);
  if (settings === null) return [`${project}/.claude/settings.json is missing; run scripts/agents/export.mjs --client claude-code`];
  return JSON.stringify(settings?.hooks?.PreToolUse ?? []).includes('worker-guard.mjs')
    ? []
    : ['.claude/settings.json does not wire the worker-guard hook'];
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const at = process.argv.indexOf('--project');
  const problems = at === -1 ? await policyProblems() : await projectProblems(process.argv[at + 1]);
  if (problems.length === 0) {
    process.stdout.write('Tier policy: clear.\n');
    process.exit(0);
  }
  process.stderr.write(`Tier policy: ${problems.length} problem(s)\n`);
  for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
  process.exit(1);
}
