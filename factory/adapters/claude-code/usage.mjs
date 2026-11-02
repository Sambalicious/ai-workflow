#!/usr/bin/env node
// Reads Claude Code session logs and prints a `usage` object for a controller
// `complete` event. It only reads files; it never changes run state.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_PRICES = fileURLToPath(new URL('./prices.json', import.meta.url));
export const DEFAULT_PROJECTS = join(homedir(), '.claude', 'projects');
const PER_TOKEN = 1e-6;

// One API call can span several log lines that repeat the same usage, so calls
// are keyed by message id and counted once.
export function parseTranscript(text) {
  const calls = new Map();
  const toolUseIds = new Set();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type !== 'assistant' || !entry.message) continue;
    const { message } = entry;
    for (const block of Array.isArray(message.content) ? message.content : []) {
      if (block?.type === 'tool_use' && block.id) toolUseIds.add(block.id);
    }
    const id = message.id ?? entry.requestId;
    if (!id || !message.usage) continue;
    const previous = calls.get(id);
    if (!previous || (message.usage.output_tokens ?? 0) >= (previous.usage.output_tokens ?? 0)) {
      calls.set(id, { id, model: message.model, usage: message.usage });
    }
  }
  return { calls, toolUseIds };
}

const count = value => (Number.isSafeInteger(value) && value >= 0 ? value : 0);

// Returns { cost } in USD, or { problem } when the call cannot be priced exactly.
export function priceCall({ model, usage }, prices) {
  const input = count(usage.input_tokens);
  const output = count(usage.output_tokens);
  const read = count(usage.cache_read_input_tokens);
  const written = count(usage.cache_creation_input_tokens);
  if (model === '<synthetic>' && input + output + read + written === 0) return { cost: 0 };
  const table = prices.models[model];
  if (!table) return { problem: `No price for model ${model}` };
  if (usage.service_tier && usage.service_tier !== 'standard') return { problem: `No price for service tier ${usage.service_tier}` };
  const other = (usage.iterations ?? []).find(i => i?.type && i.type !== 'message');
  if (other) return { problem: `Call includes a ${other.type} step that may use another model` };

  let rates = table;
  if (table.long_prompt && input + read + written > table.long_prompt.over_tokens) rates = table.long_prompt;
  if (usage.speed === 'fast') {
    if (!table.fast) return { problem: `No fast-mode price for ${model}` };
    // Cache multipliers apply on top of fast-mode prices.
    const scale = table.fast.input / table.input;
    rates = { input: table.fast.input, output: table.fast.output, cache_read: table.cache_read * scale,
      cache_write_5m: table.cache_write_5m * scale, cache_write_1h: table.cache_write_1h * scale };
  } else if (usage.speed && usage.speed !== 'standard') return { problem: `No price for speed ${usage.speed}` };

  let fiveMinute = 0;
  let oneHour = 0;
  if (written > 0) {
    const split = usage.cache_creation;
    fiveMinute = count(split?.ephemeral_5m_input_tokens);
    oneHour = count(split?.ephemeral_1h_input_tokens);
    if (!split || fiveMinute + oneHour !== written) return { problem: 'Cache writes have no 5-minute/1-hour split' };
  }
  const searches = count(usage.server_tool_use?.web_search_requests);
  return { cost: PER_TOKEN * (input * rates.input + output * rates.output + read * rates.cache_read
    + fiveMinute * rates.cache_write_5m + oneHour * rates.cache_write_1h)
    + searches * prices.web_search_usd_per_request };
}

// files: [{ path, text, finished? }]. finished === false marks a still-running agent.
export function summarize(files, prices) {
  const calls = new Map();
  for (const file of files) {
    for (const [id, call] of parseTranscript(file.text).calls) {
      if (!calls.has(id)) calls.set(id, call);
    }
  }
  const problems = new Set();
  for (const file of files) if (file.finished === false) problems.add(`Agent log ${basename(file.path)} is not finished`);
  if (calls.size === 0) problems.add('No API calls found in the logs');

  let tokens = 0;
  let cost = 0;
  const byModel = {};
  for (const call of calls.values()) {
    const u = call.usage;
    const callTokens = count(u.input_tokens) + count(u.output_tokens)
      + count(u.cache_read_input_tokens) + count(u.cache_creation_input_tokens);
    tokens += callTokens;
    const priced = priceCall(call, prices);
    if (priced.problem) problems.add(priced.problem);
    else cost += priced.cost;
    const row = byModel[call.model] ??= { calls: 0, tokens: 0, cost_usd: 0 };
    row.calls += 1; row.tokens += callTokens; row.cost_usd += priced.cost ?? 0;
  }
  const hash = createHash('sha256');
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) hash.update(file.text);
  const usage = {
    tokens: calls.size && Number.isSafeInteger(tokens) ? tokens : null,
    cost_usd: calls.size ? Math.round(cost * 1e6) / 1e6 : null,
    source_ref: `claude-code-logs:sha256=${hash.digest('hex')};files=${files.map(f => basename(f.path)).join(',')};prices=${prices.version}`,
    cost_complete: problems.size === 0,
  };
  if (usage.cost_usd === null) { delete usage.source_ref; delete usage.cost_complete; }
  if (problems.size) usage.reason = [...problems].join('; ');
  for (const row of Object.values(byModel)) row.cost_usd = Math.round(row.cost_usd * 1e6) / 1e6;
  return { usage, details: { calls: calls.size, by_model: byModel, pricing: prices.basis, prices_source: prices.source } };
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

// Finds a subagent log by id, then every agent it launched, at any depth.
export async function agentFiles(agentId, projectsDir = DEFAULT_PROJECTS) {
  if (!/^[A-Za-z0-9_-]+$/.test(agentId)) throw new Error('Agent id may contain only letters, digits, _ and -');
  const target = `agent-${agentId}.jsonl`;
  let found;
  for (const project of await readdir(projectsDir, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    for (const session of await readdir(join(projectsDir, project.name), { withFileTypes: true })) {
      if (!session.isDirectory()) continue;
      const directory = join(projectsDir, project.name, session.name, 'subagents');
      const names = await readdir(directory).catch(() => []);
      if (names.includes(target)) { found = { directory, names }; break; }
    }
    if (found) break;
  }
  if (!found) throw new Error(`No Claude Code log found for agent ${agentId} under ${projectsDir}`);

  const metas = [];
  for (const name of found.names.filter(n => n.endsWith('.meta.json'))) {
    metas.push({ log: name.replace(/\.meta\.json$/, '.jsonl'), meta: await readJson(join(found.directory, name)) });
  }
  const files = [];
  const queue = [target];
  const visited = new Set();
  while (queue.length) {
    const name = queue.shift();
    if (visited.has(name)) continue;
    visited.add(name);
    const path = join(found.directory, name);
    const text = await readFile(path, 'utf8');
    const meta = metas.find(m => m.log === name)?.meta;
    files.push({ path, text, finished: meta ? meta.finished === true : undefined });
    const { toolUseIds } = parseTranscript(text);
    for (const child of metas) if (child.meta?.toolUseId && toolUseIds.has(child.meta.toolUseId)) queue.push(child.log);
  }
  return files;
}

const help = `Usage:
  node factory/adapters/claude-code/usage.mjs --agent <agentId> [--projects <dir>] [--prices <file>] [--details]
  node factory/adapters/claude-code/usage.mjs <log.jsonl>... [--prices <file>] [--details]

Prints a usage object for a controller "complete" event. --agent reads that
subagent's log plus every agent it launched. Give log paths only for a session
that ran one role and nothing else, or its cost will include other work.`;

async function main(args) {
  const options = { files: [], prices: DEFAULT_PRICES, projects: DEFAULT_PROJECTS, details: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') { process.stdout.write(`${help}\n`); return; }
    if (arg === '--details') options.details = true;
    else if (['--agent', '--projects', '--prices'].includes(arg)) {
      if (!args[i + 1]) throw new Error(`${arg} needs a value`);
      options[arg.slice(2)] = args[++i];
    } else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}`);
    else options.files.push(arg);
  }
  if (Boolean(options.agent) === Boolean(options.files.length)) throw new Error(help);
  const prices = JSON.parse(await readFile(options.prices, 'utf8'));
  const files = options.agent ? await agentFiles(options.agent, options.projects)
    : await Promise.all(options.files.map(async path => ({ path, text: await readFile(path, 'utf8') })));
  const result = summarize(files, prices);
  process.stdout.write(`${JSON.stringify(options.details ? result : result.usage, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exitCode = 1;
  });
}
