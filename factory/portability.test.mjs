import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'factory/cli.mjs');
const example = join(root, 'factory/example.mjs');

async function snapshot(directory) {
  const entries = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const path = join(directory, entry.name);
    entries[entry.name] = entry.isSymbolicLink() ? { link: await readlink(path) }
      : entry.isDirectory() ? await snapshot(path) : await readFile(path, 'base64');
  }
  return entries;
}

test('absolute shared CLI isolates two external projects without installation', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'factory external '));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const factoryBefore = await snapshot(root);
  const runs = [];
  const execute = (cwd, script, args, input) => {
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd, input: input === undefined ? undefined : JSON.stringify(input),
      encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    return JSON.parse(result.stdout);
  };
  for (const name of ['project one', 'project two']) {
    const project = join(temporary, name);
    const runRoot = join(temporary, 'run data', name);
    await mkdir(project);
    await mkdir(join(runRoot, 'reports'), { recursive: true });
    await writeFile(join(project, 'AGENTS.md'), `Target rules for ${name}\n`);
    await writeFile(join(project, 'package.json'), '{"private":true}\n');
    const projectBefore = await snapshot(project);
    const input = execute(project, example, ['input']);
    // Synthetic fixture authority tests persistence, not a real approved run.
    input.run_id = 'same-run-id-in-both-projects';
    input.repository = project;
    input.factory_version = 'test-snapshot-1';
    input.authorization = { approved: true, approved_by: 'test-fixture', scope_ref: 'test:portability' };
    input.candidate.ref = join(project, 'package.json');
    const statePath = join(runRoot, 'state.json');
    const inputPath = join(runRoot, 'input.json');
    await writeFile(inputPath, JSON.stringify(input));
    const initial = execute(project, cli, ['init', statePath, inputPath]);
    assert.equal(initial.run_id, input.run_id);
    assert.equal(initial.version, 0);
    const event = execute(project, example, ['tick']);
    event.event_id = 'same-event-id-in-separate-runs';
    event.expected_version = initial.version;
    const eventPath = join(runRoot, 'event.json');
    await writeFile(eventPath, JSON.stringify(event));
    const applied = execute(project, cli, ['apply', statePath, eventPath]);
    assert.equal(applied.version, 1);
    const report = execute(project, cli, ['show', statePath]);
    assert.deepEqual(report, applied);
    await writeFile(join(runRoot, 'reports/status.json'), JSON.stringify(report));
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(state.config.repository, project);
    assert.equal(state.config.factory_version, 'test-snapshot-1');
    assert.deepEqual((await readdir(runRoot)).sort(), ['event.json', 'input.json', 'reports', 'state.json']);
    assert.deepEqual(await snapshot(project), projectBefore, 'No config, packages, skills, or state installed in target');
    runs.push({ project, runRoot, statePath, projectBefore });
  }
  const secondBefore = await snapshot(runs[1].runRoot);
  const firstState = JSON.parse(await readFile(runs[0].statePath, 'utf8'));
  const tick = {
    type: 'tick', event_id: 'first-only', expected_version: firstState.version,
    actor_id: 'orchestrator', adapter_id: 'local-adapter', attested: true,
  };
  assert.equal(execute(runs[0].project, cli, ['apply', runs[0].statePath, '-'], tick).version, 2);
  assert.deepEqual(await snapshot(runs[1].runRoot), secondBefore, 'Updating one run leaves the other byte-for-byte unchanged');
  assert.equal(execute(runs[1].project, cli, ['show', runs[0].statePath]).version, 2, 'Absolute state path is independent of cwd');
  for (const run of runs) assert.deepEqual(await snapshot(run.project), run.projectBefore);
  assert.deepEqual(await snapshot(root), factoryBefore, 'Shared factory receives no state, reports, locks, or temp files');
});

test('external entry and direct skills declare portable path boundaries', async () => {
  const entry = await readFile(join(root, 'factory/EXTERNAL.md'), 'utf8');
  for (const name of ['FACTORY_ROOT', 'PROJECT_ROOT', 'RUN_ROOT', 'factory_version']) {
    assert.ok(entry.includes(name), `External entry must define ${name}`);
  }
  assert.match(entry, /absolute/);
  assert.match(entry, /target project\s+rules remain authoritative/i);
  assert.match(entry, /read-only/);
  assert.match(entry, /does not enforce/);
  assert.match(entry, /node "\$FACTORY_ROOT\/factory\/cli\.mjs"/);
  assert.match(entry, /"\$RUN_ROOT\/state\.json"/);
  assert.match(entry, /RUN_ROOT\/reports/);
  for (const path of ['README.md', 'AGENTS.md', 'factory/PROTOCOL.md',
    '.agents/skills/factory-loop/SKILL.md', '.agents/skills/triage/SKILL.md', '.agents/skills/code-review/SKILL.md']) {
    const source = await readFile(join(root, path), 'utf8');
    assert.ok(source.includes('EXTERNAL.md'), `${path} must point to shared-checkout entry`);
  }
  for (const path of ['.agents/skills/triage/SKILL.md', '.agents/skills/code-review/SKILL.md']) {
    const source = await readFile(join(root, path), 'utf8');
    assert.doesNotMatch(source, /Inspect the destination roles|file is available in the destination/);
  }
});

test('GitHub reference prompts explicitly load the external entry with task context', async () => {
  const repository = 'https://github.com/Sambalicious/ai-workflow';
  for (const path of ['README.md', 'factory/EXTERNAL.md']) {
    const source = await readFile(join(root, path), 'utf8');
    const prompt = [...source.matchAll(/```text\n([\s\S]*?)```/g)]
      .map(match => match[1]).find(text => text.includes(repository));
    assert.ok(prompt, `${path} must include a copyable GitHub reference prompt`);
    assert.match(prompt, /read\s+\/absolute\/path\/to\/ai-team\/factory\/EXTERNAL\.md/i);
    for (const name of ['FACTORY_ROOT', 'PROJECT_ROOT', 'RUN_ROOT']) {
      assert.ok(prompt.includes(name), `${path} prompt must name ${name}`);
    }
    assert.match(prompt, /request/i, `${path} prompt must use the user's task scope`);
    assert.doesNotMatch(prompt, /\/Users\/|\/home\/|[A-Z]:\\Users\\/);
  }
});

test('complete-epic uses the target root and retains its client symlink', async () => {
  const source = await readFile(join(root, '.agents/skills/complete-epic.md'), 'utf8');
  assert.doesNotMatch(source, /\/Users\/|\/home\/|[A-Z]:\\Users\\/);
  assert.match(source, /PROJECT_ROOT/);
  assert.match(source, /Stop without user authorization and production deployment evidence/);
  assert.match(source, /Otherwise use the latest `code-review` report/);
  assert.match(source, /does not invoke Release Manager or grant release approval/);
  assert.match(source, /\[actual closing actor\]/);
  assert.match(source, /mv "\$PROJECT_ROOT\/epics\/active\/EPIC-XXXX-slug" "\$PROJECT_ROOT\/epics\/completed\/EPIC-XXXX-slug"/);
  assert.equal(await readlink(join(root, '.claude/skills/complete-epic.md')), '../../.agents/skills/complete-epic.md');
});
