import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, commandWords, segments, violation } from './process-guard.mjs';

const SCRIPT = fileURLToPath(new URL('./process-guard.mjs', import.meta.url));
const run = (input) => spawnSync(process.execPath, [SCRIPT], { input, encoding: 'utf8' });
const hook = (tool, input) => ({ tool_name: tool, tool_input: input });

test('name-based kills are blocked', () => {
  for (const command of [
    'pkill -f "tsx dev/backend.ts"',
    'pkill tsx',
    'killall node',
    'sudo killall node',
    'PGPASSWORD=x pkill -9 node',
    'cd apps/web && pkill -f vite',
    '(pkill -f vite)',
    '$(pkill -f vite)',
  ]) {
    assert.ok(check(command), command);
  }
  assert.match(violation('pkill -f vite'), /every process with that name/);
});

test('blanket and pipeline kills are blocked', () => {
  for (const command of [
    'kill -9 -1',
    'kill -KILL -1',
    'kill -s KILL -1',
    'kill -- -1',
    'pgrep -f "tsx dev/backend.ts" | xargs kill',
    'pgrep -f vite | xargs -0 kill -9',
    'ps aux | grep tsx | xargs killall',
    'kill $(pgrep -f "tsx dev/backend.ts")',
    'kill -9 `pgrep -f vite`',
  ]) {
    assert.ok(check(command), command);
  }
});

test('scoped kills and ordinary commands stay allowed', () => {
  for (const command of [
    'kill 1234',
    'kill -TERM 1234',
    'kill -9 1234',
    'kill -1 1234',
    'lsof -ti tcp:3000 | xargs kill',
    'echo pkill',
    'grep -rn "pkill" scripts/',
    'git commit -m "document pkill and killall"',
    'node scripts/agents/process-guard.mjs --help',
    '',
  ]) {
    assert.equal(check(command), null, command);
  }
});

test('segments split on unquoted operators only', () => {
  assert.deepEqual(segments('cd app && pnpm dev; echo done'), ['cd app', 'pnpm dev', 'echo done']);
  assert.deepEqual(segments('echo "a; pkill b"'), ['echo "a; pkill b"']);
  assert.deepEqual(segments('echo a | grep a | xargs echo'), ['echo a', 'grep a', 'xargs echo']);
  assert.deepEqual(segments(''), []);
});

test('commandWords skips prefixes, env assignments and their flags', () => {
  assert.deepEqual(commandWords('sudo pkill -f x'), ['pkill', '-f', 'x']);
  assert.deepEqual(commandWords('env NODE_ENV=test pkill x'), ['pkill', 'x']);
  assert.deepEqual(commandWords('sudo -u root killall node'), ['killall', 'node']);
  assert.deepEqual(commandWords('kill 42'), ['kill', '42']);
});

test('the hook exits 2 on a Bash kill and 0 otherwise', () => {
  const bad = JSON.stringify(hook('Bash', { command: 'pkill -f "tsx dev/backend.ts"' }));
  const blocked = run(bad);
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /stop processes by the PID you started/);
  assert.match(blocked.stderr, /echo \$!/);
  assert.match(blocked.stderr, /kill <pid>/);

  assert.equal(run(JSON.stringify(hook('Bash', { command: 'kill 1234' }))).status, 0);
  assert.equal(run(JSON.stringify(hook('Bash', { command: 'echo pkill' }))).status, 0);
  assert.equal(run(JSON.stringify(hook('Edit', { command: 'pkill -f vite' }))).status, 0);
  assert.equal(run(JSON.stringify(hook('Bash', {}))).status, 0);
});

test('bad or empty input never blocks', () => {
  for (const input of ['', 'not json at all', '{"tool_name":"Bash",', 'null', '[]', '{"tool_input":{}}']) {
    const result = run(input);
    assert.equal(result.status, 0, `stdin: ${input}`);
    assert.equal(result.stdout, '', `stdin: ${input}`);
  }
});

test('the hook still blocks when the project path goes through a symlink', () => {
  // $CLAUDE_PROJECT_DIR can be a symlinked path. The script must still run its check
  // rather than skipping main and exiting 0.
  const dir = mkdtempSync(join(tmpdir(), 'process-guard-link-'));
  const link = join(dir, 'project');
  try {
    symlinkSync(dirname(SCRIPT), link);
    const input = JSON.stringify(hook('Bash', { command: 'killall node' }));
    const result = spawnSync(process.execPath, [join(link, 'process-guard.mjs')], { input, encoding: 'utf8' });
    assert.equal(result.status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('absolute paths, wrappers and shell grouping do not hide a name kill (H5)', () => {
  for (const command of [
    '/usr/bin/pkill node',
    '/usr/bin/env pkill node',
    'command -p pkill node',
    'time -p pkill node',
    'nice pkill node',
    'timeout 5 pkill node',
    'nice -n 5 killall node',
    'sudo -u root pkill node',
    'bash -c "pkill node"',
    'sh -c "killall node"',
    'bash -lc "pgrep -f vite | xargs kill"',
    'eval pkill node',
    '{ pkill node; }',
    'if pkill node; then :; fi',
    '! pkill node',
    '(pkill -f vite)',
  ]) {
    assert.ok(check(command), command);
  }
});

test('a signal or lookup that targets every process is blocked (H5)', () => {
  for (const command of [
    'kill -s 9 -1',
    'kill -n 9 -1',
    'kill -s KILL -1',
    'kill -9 -1 1234',
    'kill -- -1 1234',
    'kill $(ps aux | grep node | awk \'{print $2}\')',
    'kill -9 $(lsof -t -c node)',
    'pgrep node | xargs -n 1 kill',
    'pgrep -f vite | xargs -I{} kill {}',
    'pgrep -f vite | while read p; do kill $p; done',
    'for p in $(pgrep node); do kill $p; done',
    'P=$(pgrep node); kill $P',
    'P=$(pidof node); kill -9 ${P}',
    'kill -9 $TARGET',
  ]) {
    assert.ok(check(command), command);
  }
});

test('a literal PID and a port lookup stay allowed, through wrappers too (H5)', () => {
  for (const command of [
    'kill 1234',
    'kill -9 1234',
    'kill -TERM 1234',
    'kill -1 1234',
    'kill -- 1234',
    'kill $!',
    'command -p kill 1234',
    'time -p kill 1234',
    'bash -c "kill 1234"',
    'lsof -ti tcp:3000 | xargs kill',
    'lsof -ti tcp:3000 | xargs -n 1 kill',
    'PID=$(lsof -ti tcp:3000); kill $PID',
    'npm start & echo $!',
    'ps aux | grep node',
    'bash -c "node server.mjs"',
    'timeout 5 npm test',
    'nice -n 5 npm test',
    'time pnpm -r test',
  ]) {
    assert.equal(check(command), null, command);
  }
});

test('a bash -c payload is checked as its own command, but a script file is not (H5)', () => {
  assert.match(check('bash -c "pkill -f vite"'), /every process with that name/);
  assert.match(check('eval "kill -9 -1"'), /signals every process/);
  assert.equal(check('bash scripts/dev.sh'), null);
  assert.equal(check('sh -e scripts/stop.sh'), null);
});
