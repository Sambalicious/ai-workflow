#!/usr/bin/env node
// Compares a test report's failures with docs/ops/known-failures.md.
// Usage: node scripts/agents/known-failures.mjs --report <vitest json> [--doc docs/ops/known-failures.md]
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function parseKnownFailures(markdown) {
  const section = markdown.split(/^## Known failures$/m)[1] ?? '';
  return section
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .slice(2)
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length > 2 && cells[1] !== '')
    .map((cells) => ({
      name: cells[1],
      reason: cells[2],
      owner: cells[3] ?? '',
    }));
}

export function failedTests(report) {
  const names = [];
  for (const file of report.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status === 'failed') names.push(assertion.fullName ?? assertion.title);
    }
  }
  return names;
}

/** Reasons the report cannot be trusted, so a suite that failed to load cannot read as green. */
export function reportProblems(report) {
  const problems = [];
  if (!Array.isArray(report?.testResults)) problems.push('report has no testResults');
  if (report?.success === false && failedTests(report).length === 0)
    problems.push('report says success: false but lists no failed test');
  for (const file of report?.testResults ?? []) {
    const failed = (file.assertionResults ?? []).some((assertion) => assertion.status === 'failed');
    if (file.status === 'failed' && !failed) problems.push(`suite failed to run: ${file.name ?? 'unknown file'}`);
  }
  return problems;
}

export function compare(actual, known) {
  const knownNames = new Set(known.map((entry) => entry.name));
  const actualNames = new Set(actual);
  return {
    unexpected: [...actualNames].filter((name) => !knownNames.has(name)).sort(),
    stale: [...knownNames].filter((name) => !actualNames.has(name)).sort(),
    expected: [...actualNames].filter((name) => knownNames.has(name)).sort(),
  };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = args.indexOf(name);
    return at === -1 ? fallback : args[at + 1];
  };
  const reportPath = flag('--report');
  const docPath = flag('--doc', 'docs/ops/known-failures.md');
  if (!reportPath) {
    process.stderr.write('usage: node scripts/agents/known-failures.mjs --report <vitest json> [--doc <path>]\n');
    process.exit(1);
  }
  try {
    const known = parseKnownFailures(await readFile(docPath, 'utf8'));
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    const broken = reportProblems(report);
    if (broken.length > 0) {
      for (const problem of broken) process.stderr.write(`known-failures: ${problem}\n`);
      process.exit(1);
    }
    const { unexpected, stale, expected } = compare(failedTests(report), known);
    const lines = [
      `${expected.length} known failure(s), ${unexpected.length} unexpected, ${stale.length} listed but passing`,
    ];
    for (const name of unexpected) lines.push(`  unexpected: ${name}`);
    for (const name of stale) lines.push(`  listed but passing (remove the row): ${name}`);
    process.stdout.write(`${lines.join('\n')}\n`);
    process.exit(unexpected.length === 0 && stale.length === 0 ? 0 : 1);
  } catch (error) {
    process.stderr.write(`known-failures: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
