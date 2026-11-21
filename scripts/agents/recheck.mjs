#!/usr/bin/env node
// Prints the extra spec files a project requires for the current diff.
// Usage: node scripts/agents/recheck.mjs --base <ref> [--project <dir>] [--config <file>] [--json]
//
// A project lists the cross-cutting specs a diff must not miss in
// <project>/.agents/recheck-always.json: path globs mapped to the spec files that join any
// recheck touching them. A guard change that breaks a cross-candidate registry spec is the
// case this exists for: the touched file's own suite stays green while the registry fails.
//
// {
//   "paths": {
//     "apps/api/src/**/*.controller.ts": ["apps/api/test/cross-candidate-registry.int-spec.ts"],
//     "**/guards/**": ["apps/api/test/guards.int-spec.ts"]
//   }
// }
//
// Exit 0 with no output when the file is absent, the diff is empty, or no glob matches.
// Exit 1 on a malformed config or an unreadable base ref.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** A glob over repository-relative paths: `**` spans directories, `*` and `?` stay in one. */
export function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*' && glob[i + 1] === '*') {
      source += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

/** The config's globs against the changed paths: the spec files to add, sorted and unique. */
export function matchedSpecs(config, changed) {
  const paths = config?.paths ?? {};
  const specs = new Set();
  const matches = [];
  for (const [glob, specFiles] of Object.entries(paths)) {
    const pattern = globToRegExp(glob);
    const hits = changed.filter((file) => pattern.test(file));
    if (hits.length === 0) continue;
    matches.push({ glob, files: hits, specs: specFiles });
    for (const spec of specFiles) specs.add(spec);
  }
  return { specs: [...specs].sort(), matches };
}

/** The config, or null when the project has none. A malformed file is an error, not an empty map. */
export async function readConfig(file) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`cannot read ${file}: ${error?.code ?? error?.message}`);
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
  const paths = config?.paths;
  if (paths === null || typeof paths !== 'object' || Array.isArray(paths)) throw new Error(`${file}: "paths" must map globs to spec files`);
  for (const [glob, specFiles] of Object.entries(paths)) {
    if (!Array.isArray(specFiles) || specFiles.some((spec) => typeof spec !== 'string' || spec === '')) {
      throw new Error(`${file}: "${glob}" must list spec file paths`);
    }
  }
  return config;
}

const changedFiles = (project, base) =>
  execFileSync('git', ['-C', project, 'diff', '--name-only', base], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const flag = (name, fallback = null) => {
    const at = args.indexOf(name);
    return at === -1 ? fallback : args[at + 1];
  };
  const base = flag('--base', 'origin/main');
  const project = resolve(flag('--project', process.cwd()));
  const configFile = flag('--config') ?? join(project, '.agents/recheck-always.json');
  try {
    const config = await readConfig(isAbsolute(configFile) ? configFile : resolve(project, configFile));
    if (config === null) process.exit(0);
    const changed = changedFiles(project, base);
    const { specs, matches } = matchedSpecs(config, changed);
    if (args.includes('--json')) process.stdout.write(`${JSON.stringify({ specs, matches }, null, 2)}\n`);
    else if (specs.length > 0) process.stdout.write(`${specs.join('\n')}\n`);
    process.exit(0);
  } catch (error) {
    process.stderr.write(`recheck: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
