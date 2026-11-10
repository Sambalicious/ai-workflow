#!/usr/bin/env node
// Resolves the model a role must run on, from .agents/models.json.
// Usage: node scripts/agents/which-model.mjs <role|tier> [--client opencode|claude-code] [--json]
// Exits 1 when the role, the tier or the client's model is missing, so a dispatch
// cannot silently fall back to the session model.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function resolveModel(models, question, client) {
  if (!models || typeof models !== 'object') throw new Error('models.json: not an object');
  const roles = models.roles ?? {};
  const tiers = models.tiers ?? {};
  const clients = models.clients ?? {};
  const tier = roles[question] ?? (tiers[question] ? question : null);
  if (tier === null) {
    const known = [...Object.keys(roles), ...Object.keys(tiers)].sort().join(', ');
    throw new Error(`unknown role or tier "${question}". Known: ${known}`);
  }
  const modelsForClient = clients[client];
  if (!modelsForClient) {
    throw new Error(`unknown client "${client}". Known: ${Object.keys(clients).sort().join(', ')}`);
  }
  const model = modelsForClient[tier];
  if (!model) throw new Error(`client "${client}" has no model for tier "${tier}"`);
  return { question, tier, client, model };
}

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  if (at === -1) return null;
  const value = args[at + 1];
  args.splice(at, value === undefined ? 1 : 2);
  return value ?? '';
};
const asJson = args.includes('--json');
const client = flag('--client') ?? process.env.EVE_AGENT_CLIENT ?? 'opencode';
const question = args[0];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!question) {
    process.stderr.write('usage: node scripts/agents/which-model.mjs <role|tier> [--client opencode|claude-code] [--json]\n');
    process.exit(1);
  }
  try {
    const models = JSON.parse(await readFile(join(ROOT, '.agents/models.json'), 'utf8'));
    const resolved = resolveModel(models, question, client);
    process.stdout.write(asJson ? `${JSON.stringify(resolved, null, 2)}\n` : `${resolved.model}\n`);
  } catch (error) {
    process.stderr.write(`which-model: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
