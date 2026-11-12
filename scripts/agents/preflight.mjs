#!/usr/bin/env node
// Proves a role's tier model can actually answer before an agent is dispatched.
// Usage: node scripts/agents/preflight.mjs <role|tier> [--client opencode|claude-code] [--json] [--record <run dir>]
// Exit codes: 0 ready, 1 bad usage, 2 rate window closed (Retry-After), 3 credential
// rejected, 4 provider error, 5 no provider configuration.
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModel } from './which-model.mjs';

const ROOT = join(import.meta.dirname, '..', '..');

/** The provider options OpenCode uses for a model, from the user's config. */
export async function providerOptions(models, model, client, home = homedir()) {
  const [provider, ...rest] = model.split('/');
  if (client !== 'opencode') return { provider, modelID: rest.join('/'), baseURL: null, apiKey: null };
  const config = JSON.parse(await readFile(join(home, '.config/opencode/opencode.json'), 'utf8'));
  const options = config?.provider?.[provider]?.options ?? {};
  const key = options.apiKey ?? (provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : undefined);
  return {
    provider,
    modelID: rest.join('/'),
    baseURL: (options.baseURL ?? '').replace(/\/$/, '') || null,
    apiKey: key ?? null,
  };
}

/** One max_tokens request. A closed window is a fact to report, not an error to retry. */
export async function probe(options, fetchImpl = fetch) {
  if (options.baseURL === null || options.apiKey === null) return { kind: 'unconfigured' };
  const response = await fetchImpl(`${options.baseURL}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: options.modelID,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ok' }],
    }),
  });
  const retryAfter = response.headers.get('retry-after');
  if (response.ok) return { kind: 'ready', status: response.status };
  if (response.status === 429) return { kind: 'closed', status: 429, retryAfter };
  if (response.status === 401 || response.status === 403) return { kind: 'credential', status: response.status };
  return { kind: 'error', status: response.status, body: (await response.text()).slice(0, 300) };
}

export function exitCodeFor(result) {
  switch (result.kind) {
    case 'ready':
      return 0;
    case 'closed':
      return 2;
    case 'credential':
      return 3;
    case 'unconfigured':
      return 5;
    case 'error':
      return 4;
    default:
      return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(name);
    if (at === -1) return null;
    const value = args[at + 1];
    args.splice(at, value === undefined ? 1 : 2);
    return value ?? '';
  };
  const asJson = args.includes('--json');
  const record = flag('--record');
  const client = flag('--client') ?? process.env.EVE_AGENT_CLIENT ?? 'opencode';
  const question = args[0];
  if (!question) {
    process.stderr.write('usage: node scripts/agents/preflight.mjs <role|tier> [--client opencode|claude-code] [--json] [--record <run dir>]\n');
    process.exit(1);
  }
  try {
    const models = JSON.parse(await readFile(join(ROOT, '.agents/models.json'), 'utf8'));
    const resolved = resolveModel(models, question, client);
    const options = await providerOptions(models, resolved.model, client);
    const result = options.baseURL === null ? { kind: 'ready', note: 'no remote provider to probe' } : await probe(options);
    const report = { ...resolved, ...result };
    // A ready probe leaves a receipt in the run, which ledger.mjs checks before a Claude dispatch.
    if (result.kind === 'ready' && record) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(record, { recursive: true });
      await writeFile(
        join(record, `.preflight-${resolved.question}.json`),
        `${JSON.stringify({ role: resolved.question, tier: resolved.tier, model: resolved.model, at: new Date().toISOString() }, null, 2)}\n`,
      );
    }
    if (asJson) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else if (result.kind === 'closed') process.stdout.write(`closed: ${resolved.model} rate window closed, Retry-After ${result.retryAfter ?? 'unknown'}s\n`);
    else if (result.kind === 'ready') process.stdout.write(`ready: ${resolved.model}\n`);
    else process.stdout.write(`${result.kind}: ${resolved.model}\n`);
    process.exit(exitCodeFor(result));
  } catch (error) {
    process.stderr.write(`preflight: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
