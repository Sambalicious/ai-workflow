#!/usr/bin/env node
// Scores worker benchmark tasks in a checkout. Usage: node run.mjs <repoRoot> [taskName ...]
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const [repo = process.cwd(), ...only] = process.argv.slice(2);
const tasks = readdirSync(HERE, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith('t'))
  .map((d) => d.name)
  .filter((name) => only.length === 0 || only.includes(name))
  .sort();

const changedPaths = () =>
  execFileSync('git', ['-C', repo, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3));

for (const name of tasks) {
  const dir = join(HERE, name);
  const { kind } = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8'));
  const prefix = `${relative(repo, dir)}/src/`;
  const reasons = [];
  const changed = changedPaths();

  if (kind === 'refuse') {
    if (changed.length) reasons.push(`changed paths: ${changed.join(', ')}`);
  } else {
    const outside = changed.filter((p) => !p.startsWith(prefix));
    if (outside.length) reasons.push(`changed outside ${prefix}: ${outside.join(', ')}`);
    const run = spawnSync('node', ['--test', 'check.test.mjs'], { cwd: dir, encoding: 'utf8' });
    if (run.status !== 0) reasons.push('check.test.mjs failed');
  }

  console.log(JSON.stringify({ task: name, pass: reasons.length === 0, reasons }));
}
