import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { bugPlan } from './fix-runner.mjs';
import { featurePlan } from './feature-runner.mjs';
import { ROLE_SKILLS, skillBlock } from './skill-map.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Installed projects add their own skills and edit their role files, so ownership and
// mention checks hold only in the factory checkout.
const isFactory = await readFile(join(root, 'package.json'), 'utf8').then((text) => JSON.parse(text).name === 'ai-workflow', () => false);
const factoryOnly = isFactory ? {} : { skip: 'factory checkout only: installs carry their own skills and role files' };

const entries = Object.entries(ROLE_SKILLS).flatMap(([role, list]) => list.map(([skill, when, file = 'SKILL.md']) => ({ role, skill, when, file })));
const DESIGN = /^(impeccable|emil-design-eng|apple-design|mobile-native|break-ui|animate.*|animation-.*|review-animations)$/;

test('every skill has an owner', factoryOnly, async () => {
  const dirs = (await readdir(join(root, '.agents/skills'), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  const owned = new Set(entries.map((e) => e.skill));
  assert.deepEqual(dirs.filter((name) => !owned.has(name)).sort(), [], 'add these to ROLE_SKILLS with a trigger');
});

test('every mapped skill file exists and has a trigger', factoryOnly, async () => {
  for (const { role, skill, when, file } of entries) {
    assert.ok(when, `${role}/${skill} needs a trigger`);
    await assert.doesNotReject(access(join(root, '.agents/skills', skill, file)), `${role} maps a missing file: ${skill}/${file}`);
  }
});

test('each owner file names its skills', factoryOnly, async () => {
  const missing = [];
  for (const { role, skill } of entries) {
    if (role === 'code-reviewer') continue;
    const file = role === 'lead' ? 'AGENTS.md' : `.agents/${role}.md`;
    const text = await readFile(join(root, file), 'utf8');
    if (!text.includes(`skills/${skill}/`) && !text.includes(`\`${skill}\``)) missing.push(`${file}: ${skill}`);
  }
  assert.deepEqual(missing, []);
});

test('design skills belong to the Designer and the Frontend Engineer only', () => {
  const wrong = entries.filter((e) => DESIGN.test(e.skill) && !['designer', 'frontend-engineer'].includes(e.role));
  assert.deepEqual(wrong.map((e) => `${e.role}: ${e.skill}`), []);
});

test('runner sessions receive skill paths under the factory root', () => {
  const [worker] = bugPlan({ reportPath: '/r.md', wt: '/wt', factoryRoot: '/f' }).workers;
  assert.match(worker.skills, /\/f\/\.agents\/skills\/tdd\/SKILL\.md/);
  assert.match(worker.skills, /\/f\/\.agents\/skills\/vercel-react-best-practices\/SKILL\.md/);
  const plan = featurePlan({ prdPath: '/p', wt: '/wt', factoryRoot: '/f', artifactsDir: '/a' });
  const of = (name) => [...plan.stages, ...plan.workers].find((s) => (s.role ?? s.name) === name).skills;
  assert.match(of('architect'), /\/f\/\.agents\/skills\/codebase-design\/SKILL\.md/);
  assert.match(of('tests'), /\/f\/\.agents\/skills\/playwright-testing\/SKILL\.md/);
  assert.doesNotMatch(of('tests'), /break-ui|impeccable/);
  assert.doesNotMatch(of('api-contract'), /nestjs|tdd/);
  assert.match(of('implementation'), /nestjs-best-practices/);
});

test('the CLI prints a brief block and rejects an unknown role', () => {
  const cli = fileURLToPath(new URL('./skill-map.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(run('security').stdout, `${skillBlock(['security'])}\n`);
  assert.equal(run('nobody').status, 1);
  assert.equal(run().status, 2);
});
