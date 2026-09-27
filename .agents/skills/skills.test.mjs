import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const skills = {
  triage: [
    'READY_BUG',
    'READY_FEATURE',
    'DUPLICATE',
    'NEEDS_INFORMATION',
    'BLOCKED',
    'DECLINED',
  ],
  'code-review': ['PASS', 'CHANGES_REQUIRED', 'BLOCKED'],
  'factory-loop': ['controller', 'three global repair waves', 'independent'],
};

for (const [name, verdicts] of Object.entries(skills)) {
  test(`${name}: portable skill with an explicit handoff`, async () => {
    const source = await readFile(new URL(`./${name}/SKILL.md`, import.meta.url), 'utf8');
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    assert.ok(frontmatter, 'YAML frontmatter must be first');
    assert.match(frontmatter[1], new RegExp(`^name: ${name}$`, 'm'));
    assert.match(frontmatter[1], /^description: "[^"\n]+"$/m);
    assert.match(source, /read-only/i);
    assert.match(source, /^#{2,3} .*TL;DR.*$/m);
    for (const verdict of verdicts) {
      assert.ok(source.includes(verdict), `Missing disposition: ${verdict}`);
    }
    assert.doesNotMatch(source, /\b(?:TODO|TBD)\b/, 'Resolve placeholders before publishing');
    assert.match(source, /BLOCKER\[agent-name\]/);
    assert.doesNotMatch(source, /[^\x00-\x7F]/, 'Keep the shared definitions ASCII');
  });
}

test('usage links and package rules include the shared skills', async () => {
  const root = new URL('../../', import.meta.url);
  const readme = await readFile(new URL('README.md', root), 'utf8');
  const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.ok(packageJson.files.includes('.agents/'));
  for (const name of Object.keys(skills)) {
    assert.ok(readme.includes(`.agents/skills/${name}/SKILL.md`));
  }
});

test('factory integration references executable roles and controller', async () => {
  const root = new URL('../../', import.meta.url);
  const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.ok(packageJson.files.includes('factory/'));
  assert.ok(packageJson.files.includes('AGENTS.md'));
  const orchestrator = await readFile(new URL('AGENTS.md', root), 'utf8');
  assert.match(orchestrator, /\.agents\/skills\/factory-loop\/SKILL\.md/);
  assert.match(orchestrator, /dispatch a fresh independent reviewer/);
  const protocol = await readFile(new URL('factory/PROTOCOL.md', root), 'utf8');
  assert.match(protocol, /local attestations/);
  assert.match(protocol, /publish/);
  for (const name of ['backend-engineer', 'frontend-engineer', 'qa', 'release-manager']) {
    const role = await readFile(new URL(`.agents/${name}.md`, root), 'utf8');
    assert.match(role, /factory-loop\/SKILL\.md/);
    assert.doesNotMatch(role, /No full implementations|Do not write full implementations/);
  }
});

test('installer includes controller, preserves files, and force avoids nested copies', async () => {
  const root = new URL('../../', import.meta.url);
  const destination = await mkdtemp(join(tmpdir(), 'factory-install-'));
  const install = (...args) => {
    const result = spawnSync('bash', [fileURLToPath(new URL('install.sh', root)), destination, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  try {
    install();
    const source = await readFile(new URL('factory/cli.mjs', root), 'utf8');
    assert.equal(await readFile(join(destination, 'factory/cli.mjs'), 'utf8'), source);
    await access(join(destination, 'AGENTS.md'));
    await access(join(destination, 'factory/PROTOCOL.md'));
    await access(join(destination, '.agents/skills/factory-loop/SKILL.md'));
    await writeFile(join(destination, 'factory/cli.mjs'), 'local customization\n');
    install();
    assert.equal(await readFile(join(destination, 'factory/cli.mjs'), 'utf8'), 'local customization\n');
    install('--force');
    assert.equal(await readFile(join(destination, 'factory/cli.mjs'), 'utf8'), source);
    await assert.rejects(access(join(destination, 'factory/factory')), { code: 'ENOENT' });
    await assert.rejects(access(join(destination, '.agents/.agents')), { code: 'ENOENT' });
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});

test('controller help is callable without a run or side effects', () => {
  const cli = fileURLToPath(new URL('../../factory/cli.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /does not launch agents/);
});
