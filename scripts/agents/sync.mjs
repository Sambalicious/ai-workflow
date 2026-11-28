#!/usr/bin/env node
// Keeps AGENTS.md's tier table generated from .agents/models.json and validates the
// tool-neutral agent sources in .agents/agents/*.md. This repo commits no client-specific
// files; scripts/agents/export.mjs writes those into a project on demand.
// Usage: node scripts/agents/sync.mjs [--check]
// --check writes nothing and exits 1 when AGENTS.md is out of date.
import { realpathSync } from 'node:fs';
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
  const agents = await readOr(join(root, 'AGENTS.md'), null);
  if (agents !== null) {
    const refs = [...new Set(agents.match(/\.agents\/reference\/[\w.-]+\.md/g) ?? [])];
    for (const ref of refs) {
      if ((await readOr(join(root, ref), null)) === null) throw new Error(`AGENTS.md references missing ${ref}`);
    }
    // AGENTS.md is auto-loaded by every session, so the tier table may live in a
    // reference file it links rather than in the file itself. Exactly one copy owns
    // the markers; zero copies means the table could silently go stale.
    const owners = [];
    for (const rel of ['AGENTS.md', ...refs]) {
      const text = rel === 'AGENTS.md' ? agents : await readOr(join(root, rel), null);
      if (TIER_TABLE.test(text)) owners.push([rel, text]);
    }
    if (owners.length !== 1) {
      throw new Error(
        `missing tier-table markers: expected exactly one copy in AGENTS.md or a file it references, found ${owners.length}`,
      );
    }
    for (const [rel, text] of owners) {
      outputs.set(rel, text.replace(TIER_TABLE, (_, start, end) => `${start}${renderTierTable(models)}${end}`));
    }
  }
  return outputs;
}

export async function sync({ root = ROOT, check = false } = {}) {
  const stale = [];
  const outputs = await plan(root);
  for (const [path, text] of outputs) {
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

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const check = process.argv.includes('--check');
  const stale = await sync({ check });
  if (check && stale.length) {
    console.error(`Out of date (run npm run agents:sync):\n${stale.map((p) => `  ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log(stale.length ? `${check ? 'Stale' : 'Wrote'}: ${stale.join(', ')}` : 'Agent files are in sync.');
}
