import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exitCodeFor, probe, providerOptions } from './preflight.mjs';

const SCRIPT = fileURLToPath(new URL('./preflight.mjs', import.meta.url));
const runIn = (cwd, args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd });

const response = (status, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, text: async () => 'body' });

test('a provider block is read from the OpenCode config', async () => {
  const home = await mkdtemp(join(tmpdir(), 'preflight-'));
  try {
    await mkdir(join(home, '.config/opencode'), { recursive: true });
    await writeFile(join(home, '.config/opencode/opencode.json'), JSON.stringify({ provider: { anthropic: { options: { baseURL: 'http://127.0.0.1:8317/v1/', apiKey: 'k' } } } }));
    const options = await providerOptions({}, 'anthropic/claude-sonnet-5-5', 'opencode', home);
    assert.deepEqual(options, { provider: 'anthropic', modelID: 'claude-sonnet-5-5', baseURL: 'http://127.0.0.1:8317/v1', apiKey: 'k' });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('a provider with no options is unconfigured, not ready by accident', async () => {
  const home = await mkdtemp(join(tmpdir(), 'preflight-'));
  try {
    await mkdir(join(home, '.config/opencode'), { recursive: true });
    await writeFile(join(home, '.config/opencode/opencode.json'), JSON.stringify({ provider: {} }));
    const options = await providerOptions({}, 'opencode-go/deepseek-v4.1-flash', 'opencode', home);
    assert.equal(options.baseURL, null);
    assert.equal((await probe(options)).kind, 'unconfigured');
    assert.equal(exitCodeFor({ kind: 'unconfigured' }), 5);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('a 200 is ready, a 429 is a closed window with its Retry-After', async () => {
  const ready = await probe({ baseURL: 'http://x/v1', apiKey: 'k', modelID: 'm' }, async () => response(200));
  assert.equal(ready.kind, 'ready');
  assert.equal(exitCodeFor(ready), 0);
  const closed = await probe({ baseURL: 'http://x/v1', apiKey: 'k', modelID: 'm' }, async () => response(429, { 'retry-after': '14852' }));
  assert.deepEqual(closed, { kind: 'closed', status: 429, retryAfter: '14852' });
  assert.equal(exitCodeFor(closed), 2);
});

test('401 and 403 are a credential problem, not a window problem', async () => {
  for (const status of [401, 403]) {
    const result = await probe({ baseURL: 'http://x/v1', apiKey: 'k', modelID: 'm' }, async () => response(status));
    assert.equal(result.kind, 'credential');
    assert.equal(exitCodeFor(result), 3);
  }
});

test('any other status is a provider error and keeps the body for the report', async () => {
  const result = await probe({ baseURL: 'http://x/v1', apiKey: 'k', modelID: 'm' }, async () => response(500));
  assert.equal(result.kind, 'error');
  assert.equal(result.status, 500);
  assert.equal(exitCodeFor(result), 4);
});

test('--record writes the receipt into the feature folder a feature id names', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'preflight-project-'));
  const runDir = join(cwd, 'features', 'active', 'FEAT-0017-job-added-skills');
  await mkdir(runDir, { recursive: true });
  try {
    const result = runIn(cwd, ['lead', '--client', 'claude-code', '--record', 'FEAT-0017-job-added-skills']);
    assert.equal(result.status, 0, result.stderr);
    assert.ok((await readdir(runDir)).includes('.preflight-lead.json'));
    assert.deepEqual((await readdir(cwd)).filter((name) => name.startsWith('FEAT-')), [], 'no run directory at the project root');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('--record fails on an unknown run instead of creating it', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'preflight-project-'));
  try {
    const result = runIn(cwd, ['lead', '--client', 'claude-code', '--record', 'FEAT-9999-missing']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /matches no existing directory/);
    assert.deepEqual(await readdir(cwd), [], 'nothing is created');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('a ready probe in this repo still records into an existing directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'preflight-'));
  try {
    const result = spawnSync(process.execPath, [SCRIPT, 'lead', '--client', 'claude-code', '--record', dir], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(await readFile(join(dir, '.preflight-lead.json'), 'utf8'));
    assert.equal(receipt.role, 'lead');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
