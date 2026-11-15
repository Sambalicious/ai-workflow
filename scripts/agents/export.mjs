#!/usr/bin/env node
// Writes one coding client's native files into a project, on demand. This repo commits
// no client-specific files (.claude/): the neutral sources live in
// .agents/, and a project that wants native subagents or slash commands exports them.
//
// Usage: node scripts/agents/export.mjs --client claude-code --target <dir> [--check]
//
// Role files, skills and commands become symlinks to this checkout, so nothing is
// copied into the project. Generated agent files and model settings are written as
// files. Everything written is machine-local: git-ignore it in the target.
import { realpathSync } from 'node:fs';
import { lstat, mkdir, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSource } from './sync.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const notice = (name) =>
  `<!-- Generated from .agents/agents/${name}.md by scripts/agents/export.mjs. Do not edit; re-run the export. -->\n\n`;

// Claude Code's built-in search agent is named Explore.
const claudeName = (meta) =>
  meta['overrides-builtin'] === 'true' && meta.name === 'explore' ? 'Explore' : meta.name;

const GUARD_HOOK = 'node "${FACTORY_ROOT:-%ROOT%}/scripts/agents/worker-guard.mjs"';

// `supports` says whether the client can run the model a tier maps to. Claude Code
// resolves a subagent's model on its own endpoint, so a provider model such as
// opencode-go/deepseek-v4.1-flash gets no agent file; that work goes through delegate_task.
export const CLIENTS = {
  'claude-code': {
    supports: (model) => !model.includes('/'),
    agentPath: (meta) => `.claude/agents/${claudeName(meta)}.md`,
    render({ meta, body }, model) {
      return [
        '---',
        `name: ${claudeName(meta)}`,
        `description: ${JSON.stringify(meta.description)}`,
        'tools: Read, Grep, Glob, Bash',
        'disallowedTools: Edit, Write, NotebookEdit',
        `model: ${model}`,
        '---',
        '',
        notice(meta.name) + body,
      ].join('\n');
    },
    links: { roles: '.claude/agents', skills: '.claude/skills', commands: '.claude/commands' },
    settings: (m, root) => ({
      path: '.claude/settings.json',
      keys: {
        model: m.lead,
        advisorModel: m.advisor,
        hooks: { PreToolUse: [{ matcher: 'Agent', hooks: [{ type: 'command', command: GUARD_HOOK.replace('%ROOT%', root) }] }] },
      },
    }),
  },
};

// Other settings keys survive. Hooks merge per event, replacing only an earlier export of the
// same hook command, so a target's own hooks are never dropped.
export function mergeSettings(current, keys) {
  const merged = { ...current, ...keys };
  if (keys.hooks) {
    merged.hooks = { ...(current.hooks ?? {}) };
    for (const [event, entries] of Object.entries(keys.hooks)) {
      const ours = JSON.stringify(entries);
      const kept = (merged.hooks[event] ?? []).filter((entry) => !JSON.stringify(entry).includes('worker-guard.mjs'));
      merged.hooks[event] = [...kept, ...JSON.parse(ours)];
    }
  }
  return merged;
}

async function readOr(path, fallback) {
  try { return await readFile(path, 'utf8'); } catch { return fallback; }
}

async function mdFiles(dir) {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((e) => e.name.endsWith('.md') && (e.isFile() || e.isSymbolicLink())).map((e) => e.name).sort();
  } catch { return []; }
}

// Returns the actions needed to bring `target` in line with `source` for one client.
export async function plan({ client, target, source = ROOT }) {
  const spec = CLIENTS[client];
  if (!spec) throw new Error(`unknown client "${client}" (use ${Object.keys(CLIENTS).join(', ')})`);
  if (!isAbsolute(target)) throw new Error('--target must be an absolute path');
  const models = JSON.parse(await readFile(join(source, '.agents/models.json'), 'utf8'));
  const tiers = models.clients[client];
  const actions = [];

  if (spec.agentPath) {
    if (!tiers) throw new Error(`.agents/models.json: no models for ${client}`);
    for (const file of await mdFiles(join(source, '.agents/agents'))) {
      const parsed = parseSource(await readFile(join(source, '.agents/agents', file), 'utf8'), file);
      const model = tiers[parsed.meta.tier];
      if (!model) throw new Error(`${parsed.meta.name}: tier ${parsed.meta.tier} has no ${client} model`);
      if (spec.supports(model)) actions.push({ type: 'file', path: spec.agentPath(parsed.meta), text: spec.render(parsed, model) });
    }
  }
  const link = (dir, from, name) => actions.push({ type: 'link', path: `${dir}/${name}`, to: join(source, from, name) });
  if (spec.links.roles) for (const f of await mdFiles(join(source, '.agents'))) link(spec.links.roles, '.agents', f);
  if (spec.links.skills) for (const f of await mdFiles(join(source, '.agents/skills'))) link(spec.links.skills, '.agents/skills', f);
  if (spec.links.commands) for (const f of await mdFiles(join(source, '.agents/commands'))) link(spec.links.commands, '.agents/commands', f);
  if (spec.settings) {
    const { path, keys } = spec.settings(tiers, source);
    const current = JSON.parse(await readOr(join(target, path), '{}'));
    actions.push({ type: 'file', path, text: JSON.stringify(mergeSettings(current, keys), null, 2) + '\n' });
  }
  return actions;
}

export async function exportClient({ client, target, source = ROOT, check = false }) {
  const changed = [];
  for (const action of await plan({ client, target, source })) {
    const full = join(target, action.path);
    if (action.type === 'file') {
      if ((await readOr(full, null)) === action.text) continue;
      changed.push(action.path);
      if (!check) { await mkdir(dirname(full), { recursive: true }); await writeFile(full, action.text); }
    } else {
      const stat = await lstat(full).catch(() => null);
      if (stat?.isSymbolicLink() && (await readlink(full)) === action.to) continue;
      changed.push(action.path);
      if (!check) {
        await mkdir(dirname(full), { recursive: true });
        await rm(full, { force: true, recursive: true });
        await symlink(action.to, full);
      }
    }
  }
  return changed;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const arg = (flag) => { const i = process.argv.indexOf(flag); return i === -1 ? undefined : process.argv[i + 1]; };
  const check = process.argv.includes('--check');
  try {
    const client = arg('--client');
    const target = arg('--target');
    if (!client || !target) throw new Error('Usage: node scripts/agents/export.mjs --client <claude-code> --target <abs dir> [--check]');
    const changed = await exportClient({ client, target, check });
    if (check && changed.length) {
      console.error(`Out of date:\n${changed.map((p) => `  ${p}`).join('\n')}`);
      process.exit(1);
    }
    console.log(changed.length ? `${check ? 'Stale' : 'Wrote'} ${changed.length}: ${changed.join(', ')}` : 'Client files are in sync.');
    if (!check && changed.length) console.log('These are machine-local (symlinks into this checkout): git-ignore them in the target.');
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
