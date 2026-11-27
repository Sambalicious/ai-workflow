#!/usr/bin/env node
// Splits one candidate into stacked layer branches. Each layer is the candidate's own
// diff against the merge-base, restricted to that layer's paths, applied onto the
// previous layer. A file the candidate never touched therefore keeps the base branch's
// content instead of being overwritten with the candidate's older copy.
// Usage:
//   node scripts/agents/split-layers.mjs --candidate <ref> --base <ref> \
//     --layer web=apps/web [--layer api=apps/api/src,apps/api/test] [--prefix layer/]
// The checkout must be clean. Every layer branch is created from the previous one, the
// first from --base, and the original branch is restored afterwards. The run fails when
// a layer reverts a file the base changed since the merge-base, and prints those files.
// It also fails when the candidate changes a path no --layer covers, because the stack
// would silently drop that change, and when two layers cover the same path.
// Build layers with diffs only: `git checkout <ref> -- <dir>` overwrites files the base
// moved and silently reverts other work.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAX_BUFFER = 256 * 1024 * 1024;

function git(args, { input, cwd } = {}) {
  return execFileSync('git', args, { encoding: 'utf8', input, cwd, maxBuffer: MAX_BUFFER, stdio: ['pipe', 'pipe', 'pipe'] });
}

function gitQuiet(args, cwd) {
  try {
    return git(args, { cwd });
  } catch {
    return null;
  }
}

export function parseLayers(values) {
  if (!values || values.length === 0) throw new Error('at least one --layer name=path[,path...] is required');
  const seen = new Set();
  return values.map((value) => {
    const at = value.indexOf('=');
    if (at <= 0) throw new Error(`--layer "${value}" must be name=path[,path...]`);
    const name = value.slice(0, at).trim();
    const paths = value
      .slice(at + 1)
      .split(',')
      .map((path) => path.trim())
      .filter(Boolean);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) throw new Error(`layer name "${name}" must be letters, digits, dot, underscore or dash`);
    if (seen.has(name)) throw new Error(`layer "${name}" is named twice`);
    if (paths.length === 0) throw new Error(`layer "${name}" has no paths`);
    seen.add(name);
    return { name, paths };
  });
}

/** True when one layer pathspec covers a path (`apps/web` covers `apps/web/x`). */
export function coversPath(pathspec, path) {
  const clean = pathspec.replace(/\/+$/, '');
  if (/[*?[]/.test(clean)) {
    const pattern = new RegExp(`^${clean.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
    return pattern.test(path);
  }
  return path === clean || path.startsWith(`${clean}/`);
}

/** The candidate's changed paths that no layer's pathspec covers, in diff order. */
export function uncoveredPaths({ mergeBase, candidate, layers, cwd }) {
  const listed = git(['diff', '--name-only', '-z', '--no-renames', mergeBase, candidate], { cwd });
  const paths = listed.split('\0').filter(Boolean);
  return paths.filter((path) => !layers.some((layer) => layer.paths.some((pathspec) => coversPath(pathspec, path))));
}

/** Layer pairs whose pathspecs overlap, so one patch would be applied twice. */
export function overlappingLayers(layers) {
  const overlaps = [];
  for (let first = 0; first < layers.length; first += 1) {
    for (let second = first + 1; second < layers.length; second += 1) {
      const a = layers[first];
      const b = layers[second];
      if (a.paths.some((one) => b.paths.some((two) => coversPath(one, two.replace(/\/+$/, '')) || coversPath(two, one.replace(/\/+$/, ''))))) {
        overlaps.push([a.name, b.name]);
      }
    }
  }
  return overlaps;
}

// Blob id of a path at a ref, or null when the path is absent there.
export function blobAt(ref, path, cwd) {
  const out = gitQuiet(['rev-parse', '--verify', '--quiet', `${ref}:${path}`], cwd);
  return out ? out.trim() : null;
}

// Files the base changed since the merge-base that this branch now holds at their
// merge-base content again, which is how a whole-directory copy reverts main.
export function revertedFiles({ base, mergeBase, branch, cwd }) {
  const changed = gitQuiet(['diff', '--name-only', '-z', mergeBase, base], cwd);
  if (!changed) return [];
  return changed
    .split('\0')
    .filter(Boolean)
    .filter((path) => {
      const baseBlob = blobAt(base, path, cwd);
      const mergeBaseBlob = blobAt(mergeBase, path, cwd);
      if (baseBlob === mergeBaseBlob) return false;
      return blobAt(branch, path, cwd) === mergeBaseBlob;
    });
}

function valueOf(args, name) {
  const at = args.indexOf(name);
  return at === -1 ? null : args[at + 1] ?? null;
}

function valuesOf(args, name) {
  const values = [];
  for (let at = 0; at < args.length; at += 1) {
    if (args[at] === name) values.push(args[at + 1]);
  }
  return values.filter((value) => value !== undefined);
}

export function main(args) {
  const candidate = valueOf(args, '--candidate');
  const base = valueOf(args, '--base');
  const prefix = valueOf(args, '--prefix') ?? 'layer/';
  if (!candidate) throw new Error('--candidate <ref> is required');
  if (!base) throw new Error('--base <ref> is required');
  const layers = parseLayers(valuesOf(args, '--layer'));

  const mergeBase = (gitQuiet(['merge-base', base, candidate]) ?? '').trim();
  if (!mergeBase) throw new Error(`no merge-base between ${base} and ${candidate}`);

  const original = (gitQuiet(['symbolic-ref', '--short', '-q', 'HEAD']) ?? '').trim();
  if (!original) throw new Error('HEAD is detached; switch to the branch you want restored first');
  const dirty = git(['status', '--porcelain']).trim();
  if (dirty) throw new Error('working tree is not clean; commit or stash first');

  const overlaps = overlappingLayers(layers);
  if (overlaps.length > 0) {
    throw new Error(
      `layers ${overlaps.map(([a, b]) => `"${a}" and "${b}"`).join(', ')} cover the same path; ` +
        'each changed file belongs to exactly one layer',
    );
  }
  // Every path the candidate changes must land in exactly one layer. Without this check
  // the stack merges cleanly while silently dropping the uncovered files.
  const uncovered = uncoveredPaths({ mergeBase, candidate, layers, cwd: process.cwd() });
  if (uncovered.length > 0) {
    throw new Error(
      `the candidate changes ${uncovered.length} path(s) no --layer covers; the stack would drop them:\n` +
        uncovered.map((path) => `  ${path}`).join('\n') +
        '\nAdd each path to a --layer, or split the candidate.',
    );
  }

  const created = [];
  const branches = [];
  let failed = false;
  let parent = git(['rev-parse', base]).trim();
  const restore = () => {
    if (created.length === 0) return;
    gitQuiet(['reset', '--hard', '--quiet']);
    gitQuiet(['switch', '--quiet', original]);
    // A failed run leaves no half-built stack behind.
    if (failed) for (const branch of created) gitQuiet(['branch', '--delete', '--force', branch]);
  };

  try {
    for (const layer of layers) {
      const branch = `${prefix}${layer.name}`;
      if (gitQuiet(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])) {
        throw new Error(`branch ${branch} already exists; delete it or pick another --prefix`);
      }
      git(['switch', '--quiet', '--create', branch, '--no-track', parent]);
      created.push(branch);

      const patch = git(['diff', '--binary', mergeBase, candidate, '--', ...layer.paths]);
      if (!patch.trim()) {
        throw new Error(`layer "${layer.name}" has no changes for ${layer.paths.join(', ')} from ${mergeBase} to ${candidate}`);
      }
      try {
        git(['apply', '--3way', '--whitespace=nowarn', '-'], { input: patch });
      } catch (error) {
        const detail = (error.stderr?.toString() ?? error.message).trim();
        throw new Error(`layer "${layer.name}" does not apply on ${parent.slice(0, 12)}: ${detail}`);
      }
      git(['add', '-A']);
      git(['commit', '--quiet', '-m', `layer ${layer.name}: ${layer.paths.join(', ')}`]);

      const reverted = revertedFiles({ base, mergeBase, branch });
      if (reverted.length > 0) {
        throw new Error(
          `layer branch ${branch} reverts files ${base} changed since ${mergeBase} (${mergeBase.slice(0, 12)}):\n` +
            reverted.map((path) => `  ${path}`).join('\n') +
            '\nRebuild the layer from the candidate diff instead of copying a directory.',
        );
      }

      const fullHead = git(['rev-parse', 'HEAD']).trim();
      const files = git(['diff', '--name-only', base, branch]).split('\n').filter(Boolean).length;
      branches.push({ branch, head: fullHead.slice(0, 12), files });
      parent = fullHead;
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    restore();
  }

  process.stdout.write(`Split ${candidate} into ${layers.length} stacked layer branch${layers.length === 1 ? '' : 'es'}:\n`);
  for (const [index, { branch, head, files }] of branches.entries()) {
    const on = index === 0 ? base : branches[index - 1].branch;
    process.stdout.write(`  ${branch}  ${head}  stacked on ${on}  (${files} files vs ${base})\n`);
  }
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`split-layers: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
