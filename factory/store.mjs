import { open, readFile, rename, unlink, lstat, realpath } from 'node:fs/promises';
import { dirname, basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRun, reduce, costMode } from './controller.mjs';

async function location(path) {
  const absolute = resolve(path);
  const parent = await realpath(dirname(absolute));
  return join(parent, basename(absolute));
}
async function checkFile(path, allowMissing = false) {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('State must be a regular, non-linked file');
  } catch (error) { if (!(allowMissing && error.code === 'ENOENT')) throw error; }
}
async function locked(path, update) {
  path = await location(path);
  const lockPath = `${path}.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Concurrent mutation rejected: ${lockPath} exists. A stale lock requires explicit operator inspection/removal.`);
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, created_at: Date.now() }));
    await lock.sync();
    return await update(path);
  } finally { await lock.close(); await unlink(lockPath); }
}
async function atomicWrite(path, state) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile(`${JSON.stringify(state, null, 2)}\n`);
    await file.sync();
  } catch (error) { await file.close(); await unlink(temporary); throw error; }
  await file.close();
  try {
    await rename(temporary, path);
    const directory = await open(dirname(path), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

export async function load(path) {
  path = await location(path); await checkFile(path);
  const state = JSON.parse(await readFile(path, 'utf8'));
  costMode(state);
  if (!Number.isSafeInteger(state.version) || !Array.isArray(state.audit)) throw new Error('Unsupported or invalid factory state');
  return state;
}
export async function initialize(path, input, options) {
  return locked(path, async target => {
    await checkFile(target, true);
    try { await lstat(target); throw new Error('State already exists; initialization never overwrites it'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const state = createRun(input, options);
    await atomicWrite(target, state); return state;
  });
}
export async function apply(path, event, options) {
  return locked(path, async target => {
    const state = await load(target);
    const next = reduce(state, event, options);
    if (next !== state) await atomicWrite(target, next);
    return next;
  });
}
