#!/usr/bin/env node
// Generates each coding client's agent files and model settings from the
// tool-neutral sources in .agents/ (models.json and agents/*.md).
// Usage: node scripts/agents/sync.mjs [--check]
// --check writes nothing and exits 1 when a generated file is out of date.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function parseSource(text, file) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${file}: missing frontmatter`);
  const meta = {};
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':');
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  for (const key of ['name', 'description', 'tier', 'access']) {
    if (!meta[key]) throw new Error(`${file}: missing ${key}`);
  }
  if (!['read-only', 'run-checks'].includes(meta.access)) {
    throw new Error(`${file}: access must be read-only or run-checks`);
  }
  return { meta, body: match[2].trimStart() };
}

const notice = (name) =>
  `<!-- Generated from .agents/agents/${name}.md by scripts/agents/sync.mjs. Edit the source, then run npm run agents:sync. -->\n\n`;

// Claude Code's built-in search agent is named Explore.
const claudeName = (meta) =>
  meta['overrides-builtin'] === 'true' && meta.name === 'explore' ? 'Explore' : meta.name;

// Each adapter turns one source agent into one client file.
export const ADAPTERS = {
  'claude-code': {
    path: (meta) => `.claude/agents/${claudeName(meta)}.md`,
    render({ meta, body }, model) {
      const name = claudeName(meta);
      return [
        '---',
        `name: ${name}`,
        `description: ${JSON.stringify(meta.description)}`,
        'tools: Read, Grep, Glob, Bash',
        'disallowedTools: Edit, Write, NotebookEdit',
        `model: ${model}`,
        '---',
        '',
        notice(meta.name) + body,
      ].join('\n');
    },
  },
  opencode: {
    path: (meta) => `.opencode/agents/${meta.name}.md`,
    render({ meta, body }, model) {
      return [
        '---',
        `description: ${JSON.stringify(meta.description)}`,
        'mode: subagent',
        `model: ${model}`,
        'permissions:',
        '  - action: edit',
        '    resource: "*"',
        '    effect: deny',
        '---',
        '',
        notice(meta.name) + body,
      ].join('\n');
    },
  },
};

// Settings files may hold other keys; only the model keys are owned here.
export const SETTINGS = {
  'claude-code': { path: '.claude/settings.json', keys: (m) => ({ model: m.lead, advisorModel: m.advisor }) },
  opencode: { path: 'opencode.json', keys: (m) => ({ $schema: 'https://opencode.ai/config.json', model: m.lead }) },
};

async function readOr(path, fallback) {
  try { return await readFile(path, 'utf8'); } catch { return fallback; }
}

const TIER_TABLE = /(<!-- tier-table:start[^\n]*\n)[\s\S]*?(<!-- tier-table:end -->)/;

export function renderTierTable(models) {
  const clients = Object.keys(models.clients);
  const tiers = Object.keys(models.tiers);
  const header = `| Tier | ${clients.join(' | ')} |`;
  const rule = `|---|${clients.map(() => '---').join('|')}|`;
  const rows = tiers.map((tier) => `| ${tier} | ${clients.map((c) => models.clients[c][tier] ?? 'none').join(' | ')} |`);
  return [header, rule, ...rows].join('\n') + '\n';
}

export async function plan(root = ROOT) {
  const models = JSON.parse(await readFile(join(root, '.agents/models.json'), 'utf8'));
  const dir = join(root, '.agents/agents');
  const sources = [];
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()) {
    sources.push(parseSource(await readFile(join(dir, file), 'utf8'), file));
  }
  const outputs = new Map();
  for (const [client, adapter] of Object.entries(ADAPTERS)) {
    const tiers = models.clients[client];
    if (!tiers) throw new Error(`.agents/models.json: no models for ${client}`);
    for (const source of sources) {
      const model = tiers[source.meta.tier];
      if (!model) throw new Error(`${source.meta.name}: tier ${source.meta.tier} has no ${client} model`);
      outputs.set(adapter.path(source.meta), adapter.render(source, model));
    }
    const settings = SETTINGS[client];
    const current = JSON.parse(await readOr(join(root, settings.path), '{}'));
    outputs.set(settings.path, JSON.stringify({ ...current, ...settings.keys(tiers) }, null, 2) + '\n');
  }
  const agents = await readOr(join(root, 'AGENTS.md'), null);
  if (agents !== null) {
    if (!TIER_TABLE.test(agents)) throw new Error('AGENTS.md: missing tier-table markers');
    for (const ref of new Set(agents.match(/\.agents\/reference\/[\w.-]+\.md/g) ?? [])) {
      if ((await readOr(join(root, ref), null)) === null) throw new Error(`AGENTS.md references missing ${ref}`);
    }
    outputs.set('AGENTS.md', agents.replace(TIER_TABLE, (_, start, end) => `${start}${renderTierTable(models)}${end}`));
  }
  return outputs;
}

export async function sync({ root = ROOT, check = false } = {}) {
  const stale = [];
  for (const [path, text] of await plan(root)) {
    const full = join(root, path);
    if ((await readOr(full, null)) === text) continue;
    stale.push(path);
    if (!check) {
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, text);
    }
  }
  return stale;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const stale = await sync({ check });
  if (check && stale.length) {
    console.error(`Out of date (run npm run agents:sync):\n${stale.map((p) => `  ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log(stale.length ? `${check ? 'Stale' : 'Wrote'}: ${stale.join(', ')}` : 'Agent files are in sync.');
}
