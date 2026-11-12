#!/usr/bin/env node
// Fails when a run starts from a base that predates the factory policy.
// Usage: node scripts/agents/stale.mjs [--max-behind 30] [--no-fetch]
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function staleReport({ behind, modelsDiffer, maxBehind = 30 }) {
  if (!Number.isFinite(maxBehind)) {
    return { ok: false, problems: [`--max-behind must be a number, got ${maxBehind}`], behind: Number(behind) };
  }
  if (!Number.isFinite(Number(behind))) {
    return {
      ok: false,
      problems: [`could not read the distance from origin/main (got ${behind})`],
      behind: Number(behind),
    };
  }
  const problems = [];
  if (Number(behind) > maxBehind)
    problems.push(`branch is ${behind} commits behind origin/main (allowance ${maxBehind})`);
  if (modelsDiffer)
    problems.push('.agents/models.json differs from origin/main: the tier policy on this branch is stale');
  return { ok: problems.length === 0, problems, behind: Number(behind) };
}

const run = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = args.indexOf(name);
    return at === -1 ? fallback : args[at + 1];
  };
  const maxBehind = Number(flag('--max-behind', 30));
  try {
    if (!args.includes('--no-fetch')) run(['fetch', '-q', 'origin']);
    const behind = run(['rev-list', '--count', 'HEAD..origin/main']);
    let modelsDiffer = false;
    try {
      run(['diff', '--quiet', 'origin/main', 'HEAD', '--', '.agents/models.json']);
    } catch {
      modelsDiffer = true;
    }
    const report = staleReport({ behind, modelsDiffer, maxBehind });
    if (report.ok) process.stdout.write(`Base: current (${report.behind} behind, policy matches origin/main).\n`);
    else {
      process.stderr.write('Base: stale.\n');
      for (const problem of report.problems) process.stderr.write(`  - ${problem}\n`);
      process.exit(1);
    }
  } catch (error) {
    process.stderr.write(`stale: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
