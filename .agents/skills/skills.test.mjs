import assert from 'node:assert/strict';
import { mkdtemp, readFile, readlink, readdir, rm, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// install.sh never installs into the factory itself, so its presence marks the
// factory checkout. Installs carry their own README.md, package.json and no
// installer, so the factory-only assertions are skipped there instead of failing
// and training everyone to ignore a red suite.
const factoryRoot = new URL('../../', import.meta.url);
const isFactory = await access(new URL('install.sh', factoryRoot)).then(() => true, () => false);
const factoryOnly = isFactory
  ? {}
  : { skip: 'factory checkout only: installs ship their own README.md and package.json' };

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

test('usage links and package rules include the shared skills', factoryOnly, async () => {
  const root = new URL('../../', import.meta.url);
  const readme = await readFile(new URL('README.md', root), 'utf8');
  const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.ok(packageJson.files.includes('.agents/'));
  for (const name of Object.keys(skills)) {
    assert.ok(readme.includes(`.agents/skills/${name}/SKILL.md`));
  }
});

test('factory integration references executable roles and controller', factoryOnly, async () => {
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

test('factory policy keeps assessments opt-in without weakening verification or pinned runs', factoryOnly, async () => {
  const root = new URL('../../', import.meta.url);
  const orchestrator = await readFile(new URL('AGENTS.md', root), 'utf8');
  const policy = orchestrator.split('## Role activation policy\n')[1]?.split('\n## ')[0];
  assert.ok(policy, 'Role selection needs one authoritative policy');
  for (const role of ['growth', 'data-analyst', 'pentester', 'release-manager']) assert.ok(policy.includes(`\`${role}\``));
  assert.match(policy, /disabled by default/);
  assert.match(policy, /only when the user explicitly requests/);
  assert.match(policy, /"full pipeline" request uses enabled defaults/);
  assert.match(policy, /Omit disabled tasks and their dependency edges/);
  assert.match(policy, /QA, Security, and fresh independent code review remain mandatory/);
  assert.match(policy, /Existing active pinned runs retain their graph/);
  assert.match(policy, /VERIFIED/);
  assert.match(policy, /PRODUCTION_READY/);
  for (const path of ['README.md', '.agents/rules/02-no-pipeline-jump.md',
    '.agents/skills/factory-loop/SKILL.md', '.agents/skills/code-review/SKILL.md',
    'factory/PROTOCOL.md', 'factory/EXTERNAL.md']) {
    const source = await readFile(new URL(path, root), 'utf8');
    assert.match(source, /role activation policy/, `${path} must reference the policy`);
  }
  const prompt = orchestrator.split('## Invoking the full pipeline')[1].split('```')[1];
  assert.match(prompt, /Use AGENTS.md role defaults/);
  assert.doesNotMatch(prompt, /Invoke.*(?:Growth|Data Analyst|Pentester|Release Manager)/);
  assert.match(policy, /`copywriter` and `seo` are default pipeline roles/);
  assert.match(policy, /fast lane/);
  assert.match(policy, /When in doubt, run the role/);
  assert.match(orchestrator, /## Role model policy/);
  const roleModel = orchestrator.split('## Role model policy\n')[1].split('\n## ')[0];
  assert.match(roleModel, /Designer review, the QA gate and the Security candidate review run on\s+the lead tier/);
  assert.match(roleModel, /independent code review/);
  assert.match(prompt, /Invoke the Copywriter/);
  assert.match(prompt, /SEO Specialist/);
});

test('agent-agnostic cost policy has one authority and short role references', factoryOnly, async () => {
  const root = new URL('../../', import.meta.url);
  const source = await readFile(new URL('AGENTS.md', root), 'utf8');
  const policy = source.split('## Cost reporting policy\n')[1]?.split('\n## ')[0];
  assert.ok(policy);
  for (const term of ['every coding agent and client', 'whole-feature', 'Before coding', 'planning',
    'tests', 'QA', 'Security', 'independent review', 'retries', 'pricing', 'uncertainty',
    'Estimate unavailable', 'Actual cost unavailable', 'subtotal', 'source references',
    'model downgrades', 'skipped checks', 'provider', 'schema 1', 'immutable']) {
    assert.ok(policy.includes(term), `Missing cost-policy obligation: ${term}`);
  }
  for (const path of ['.agents/backend-engineer.md', '.agents/frontend-engineer.md', '.agents/devops.md',
    '.agents/skills/factory-loop/SKILL.md', 'README.md', 'factory/PROTOCOL.md', 'factory/EXTERNAL.md']) {
    const doc = await readFile(new URL(path, root), 'utf8');
    assert.match(doc, /cost reporting policy/, `${path} must reference the authority`);
  }
  const loop = await readFile(new URL('.agents/skills/factory-loop/SKILL.md', root), 'utf8');
  assert.match(loop, /missing telemetry does not block dispatch or\ncompletion/);
  assert.match(loop, /Explicit strict and legacy schema 1 runs still require reservations/);
  assert.doesNotMatch(loop, /Reserve invocation, token, and cost capacity before dispatch/);
});

test('opt-in agent definitions and client links remain usable', async () => {
  const root = new URL('../../', import.meta.url);
  for (const [definition, link] of [
    ['.agents/skills/growth.md', '.claude/skills/growth.md'],
    ['.agents/data-analyst.md', '.claude/agents/data-analyst.md'],
    ['.agents/pentester.md', '.claude/agents/pentester.md'],
    ['.agents/release-manager.md', '.claude/agents/release-manager.md'],
  ]) {
    const source = await readFile(new URL(definition, root), 'utf8');
    assert.match(source, /Disabled by default under `AGENTS.md` role activation policy/);
    assert.match(source, /Invoke only when the\s+user explicitly requests/);
    assert.match(source, /## Inputs/);
    assert.match(source, /## Output format/);
    assert.equal(await readlink(new URL(link, root)), `../../${definition}`);
    assert.equal(await readFile(new URL(link, root), 'utf8'), source);
  }
});

test('release assessment distinguishes unrequested plans from required evidence', async () => {
  const source = await readFile(new URL('../release-manager.md', import.meta.url), 'utf8');
  assert.match(source, /This opt-in does not enable Growth or Data Analyst/);
  for (const section of ['GTM readiness', 'Measurement readiness']) {
    const body = source.split(`### ${section}\n`)[1].split('\n### ')[0];
    assert.match(body, /no approved required check needs this assessment/);
    assert.match(body, /Not assessed \(not requested\)/);
    assert.match(body, /missing required evidence as blocked/);
  }
  assert.match(source, /Keep approved required checks and unresolved blockers binding/);
  assert.match(source, /scope\s+conflict for a user decision/);
});

test('installer includes controller, preserves files, and force avoids nested copies', factoryOnly, async () => {
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

test('default copy and SEO roles are wired into the pipeline and client links', async () => {
  const root = new URL('../../', import.meta.url);
  for (const [definition, link] of [
    ['.agents/copywriter.md', '.claude/agents/copywriter.md'],
    ['.agents/seo.md', '.claude/agents/seo.md'],
  ]) {
    const source = await readFile(new URL(definition, root), 'utf8');
    assert.match(source, /Default pipeline role under `AGENTS.md` role activation policy/);
    assert.doesNotMatch(source, /Disabled by default/);
    assert.match(source, /## Inputs/);
    assert.match(source, /## Output format/);
    assert.equal(await readlink(new URL(link, root)), `../../${definition}`);
  }
  const rule = await readFile(new URL('.agents/rules/02-no-pipeline-jump.md', root), 'utf8');
  assert.match(rule, /\| Frontend Engineer \|.*copy deck \+ SEO plan/);
  assert.match(rule, /\| DevOps \| Architecture \+ API contract handoff \+ SEO plan/);
});

test('merge-only updates get a merge check, not repeated gates', async () => {
  const root = new URL('../../', import.meta.url);
  const loop = await readFile(new URL('.agents/skills/factory-loop/SKILL.md', root), 'utf8');
  for (const term of ['merge-only update', 'merge check', 'byte-identical',
    'passes alone', 'no migration number repeats', 'did not author the merge',
    'full candidate change', 'fresh independent review']) {
    assert.ok(loop.includes(term), `factory-loop missing merge-only term: ${term}`);
  }
  const overnight = await readFile(new URL('.agents/commands/overnight.md', root), 'utf8');
  assert.match(overnight, /merge\s+check for a merge-only update/);
});

test('every shared command has one source and client links', async () => {
  const root = new URL('../../', import.meta.url);
  const commands = (await readdir(new URL('.agents/commands/', root))).filter(file => file.endsWith('.md'));
  assert.ok(commands.length > 0, 'expected at least one shared command');
  for (const file of commands) {
    const name = file.replace(/\.md$/, '');
    const source = await readFile(new URL(`.agents/commands/${file}`, root), 'utf8');
    assert.match(source, /^---\r?\ndescription: .+\r?\n/);
    assert.match(source, /\$ARGUMENTS/);
    assert.doesNotMatch(source, /[^\x00-\x7F]/, 'Keep the shared definitions ASCII');
    for (const dir of ['.kilo/command', '.claude/commands']) {
      const link = await readlink(fileURLToPath(new URL(`${dir}/${file}`, root)));
      assert.equal(link, `../../.agents/commands/${file}`, `${dir}/${file} must link to its source`);
    }
  }
});

test('designer owns layout and copy slots, copywriter owns words, and review mode is wired', async () => {
  const root = new URL('../../', import.meta.url);
  const read = path => readFile(new URL(path, root), 'utf8');
  const designer = await read('.agents/skills/designer.md');
  for (const section of ['### Screen blueprints', '### Feedback matrix', '### Copy slots', '## Review mode steps', '### Findings']) {
    assert.ok(designer.includes(section), `designer missing ${section}`);
  }
  assert.match(designer, /The Copywriter writes the final words/);
  assert.match(designer, /BLOCKER\[copywriter\]/);
  assert.match(designer, /375px and 1280px/);
  const copywriter = await read('.agents/copywriter.md');
  assert.match(copywriter, /Designer's slot ID as each string's key/);
  const frontend = await read('.agents/frontend-engineer.md');
  assert.match(frontend, /raise `BLOCKER\[designer\]`/);
  assert.match(frontend, /raise `BLOCKER\[copywriter\]`/);
  const orchestrator = await read('AGENTS.md');
  assert.match(await read('.agents/reference/pipeline.md'), /\[6b\] Designer review/);
  assert.match(orchestrator, /design-review\.md/);
  const rule = await read('.agents/rules/02-no-pipeline-jump.md');
  assert.match(rule, /\| Designer \(review mode\) \|/);
});

test('rule 12 makes agents read the policies before dispatching', async () => {
  const root = new URL('../../', import.meta.url);
  const rule = await readFile(new URL('.agents/rules/12-check-policies-first.md', root), 'utf8');
  assert.match(rule, /Role model policy/);
  assert.match(rule, /\.agents\/models\.json/);
  assert.match(rule, /orchestrator_capabilities/);
  assert.match(rule, /never fall back on your own/);
});
