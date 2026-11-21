#!/usr/bin/env node
// Fails when a run starts from a base that predates the factory policy, and warns
// (never fails) when main's latest completed CI run is not green.
// Usage: node scripts/agents/stale.mjs [--max-behind 30] [--no-fetch]
import { realpathSync } from 'node:fs';
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

// Warning only, by design: a red main is a fact the run brief must carry, not a reason to
// refuse to start. A missing or unauthenticated gh degrades to the same warning.
export function mainHealthReport(gh) {
  let runs;
  try {
    runs = JSON.parse(gh(['run', 'list', '--branch', 'main', '--limit', '5', '--json', 'conclusion,status,createdAt,databaseId']));
  } catch (error) {
    return { level: 'unknown', problems: [`main CI health unknown: gh is missing or unauthenticated (${error?.code ?? error?.message})`] };
  }
  const latest = (Array.isArray(runs) ? runs : [])
    .filter((entry) => entry.status === 'completed' && entry.conclusion !== 'cancelled')
    .sort((a, b) => Date.parse(b.createdAt ?? 0) - Date.parse(a.createdAt ?? 0))[0];
  if (latest === undefined) return { level: 'unknown', problems: ['main CI health unknown: no completed workflow run on main'] };
  if (latest.conclusion === 'success') return { level: 'ok', problems: [] };

  const problems = [`latest completed run on main (#${latest.databaseId}) finished ${latest.conclusion}`];
  try {
    const { jobs = [] } = JSON.parse(gh(['run', 'view', String(latest.databaseId), '--json', 'jobs']));
    const owner = JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
    for (const job of jobs.filter((candidate) => (candidate.steps ?? []).length === 0)) {
      try {
        const note = gh(['api', `repos/${owner}/check-runs/${job.databaseId ?? job.id}/annotations`, '--jq', '.[] | .message']).trim();
        if (note !== '') problems.push(`${job.name}: ${note.split('\n')[0]}`);
      } catch {
        // An annotation needs permission; the failed run is still reported.
      }
    }
  } catch {
    // Jobs are context for the warning, never a requirement for it.
  }
  return { level: 'warn', problems };
}

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
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
    const health = mainHealthReport(gh);
    if (health.level === 'ok') process.stdout.write('Main CI: latest completed run on main passed.\n');
    else for (const problem of health.problems) process.stderr.write(`Main CI: ${problem}\n`);
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
