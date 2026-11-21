#!/usr/bin/env node
// Resolves the run directory that receives a ledger or a preflight receipt.
// Usage: import { resolveRun } from './run-path.mjs'
//
// An existing directory is the run itself. A bare feature id or slug resolves to
// features/active/<match>, or to RUN_ROOT in an external run. Resolution never
// creates a directory: a typo stops with the paths it tried instead of starting a
// second, empty run that reads as zero dispatches.
import { readdir, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';

const isDirectory = async (path) => {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
};

/** Feature folders under features/active that the name names exactly or by prefix. */
export async function featureDirs(featuresDir, name) {
  let entries;
  try {
    entries = await readdir(featuresDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && (entry.name === name || entry.name.startsWith(`${name}-`)))
    .map((entry) => join(featuresDir, entry.name));
}

/**
 * @returns {Promise<{ path: string, tried: string[] }>} the existing run directory
 * @throws when the input names no existing directory, or names several feature folders
 */
export async function resolveRun(input, { cwd = process.cwd(), env = process.env } = {}) {
  const tried = [];
  const asGiven = isAbsolute(input) ? input : resolve(cwd, input);
  tried.push(asGiven);
  if (await isDirectory(asGiven)) return { path: asGiven, tried };

  const runRoot = env.RUN_ROOT ? (isAbsolute(env.RUN_ROOT) ? env.RUN_ROOT : resolve(cwd, env.RUN_ROOT)) : null;
  if (runRoot) {
    const underRoot = join(runRoot, input);
    tried.push(underRoot);
    if (await isDirectory(underRoot)) return { path: underRoot, tried };
    // An external run keeps its artifacts in RUN_ROOT/features/<slug>; the run directory
    // those artifacts belong to is RUN_ROOT itself.
    const artifacts = await featureDirs(join(runRoot, 'features'), input);
    for (const match of artifacts) tried.push(match);
    if (artifacts.length > 1) {
      throw new Error(`run path "${input}" matches ${artifacts.length} runs under ${join(runRoot, 'features')} (${artifacts.join(', ')}); pass the run directory itself`);
    }
    if (artifacts.length === 1) return { path: runRoot, tried };
    const name = basename(runRoot);
    if ((name === input || name.startsWith(`${input}-`)) && (await isDirectory(runRoot))) return { path: runRoot, tried };
  }

  if (!/[\\/]/.test(input)) {
    const featuresDir = join(cwd, 'features', 'active');
    const matches = await featureDirs(featuresDir, input);
    for (const match of matches) tried.push(match);
    if (matches.length === 1) return { path: matches[0], tried };
    if (matches.length > 1) {
      throw new Error(`run path "${input}" matches ${matches.length} feature folders (${matches.join(', ')}); pass the run directory itself`);
    }
  }

  throw new Error(`run path "${input}" matches no existing directory (tried ${tried.join(', ')}); pass the run directory itself`);
}
