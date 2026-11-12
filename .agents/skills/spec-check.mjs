#!/usr/bin/env node
// Validates a spec file against the invariants the Gherkin grammar used to impose for
// free, plus the ones it never had: criterion coverage and path-type coverage.
//
// Parse by section. A table row inside a known section that does not match its shape is
// an error, never a silent skip; silently dropping rows is how a checker reports
// "closure holds" for a spec with no sad paths.
//
// Usage: node spec-check.mjs <spec.md> [more.md ...]
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const PATHS = ['concurrent', 'permission', 'duplicate', 'validation', 'boundary', 'empty', 'sad', 'happy'];

const SECTIONS = new Map([
  ['## Criteria', 'criteria'],
  ['## Rules', 'rules'],
  ['## Cases', 'cases'],
  ['## Coverage', 'coverage'],
  ['## Manual checks', 'manual'],
]);

const COLUMNS = { criteria: 3, rules: 4, cases: 6, coverage: 3, manual: 4 };

const CASE_ID = /^S(\d+)_(\d+|M\d+)$/;
const RULE_ID = /^R(\d+)_(\d+)$/;
const AC_ID = /^AC(\d+)_(\d+)$/;

const isSeparator = cells => cells.every(cell => /^:?-{2,}:?$/.test(cell));
const isHeader = cells => ['ID', 'AC', 'Path'].includes(cells[0]);
const splitRow = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());

export function checkSpec(source, file = 'spec') {
  const problems = [];
  const add = message => problems.push(`${file}: ${message}`);

  const heading = source.match(/^# S(\d+) —/m);
  if (!heading) add('missing "# S<nn> — <title>" heading');
  const prefix = heading ? heading[1] : null;

  const tables = { criteria: [], rules: [], cases: [], coverage: [], manual: [] };
  let section = null;
  for (const line of source.split('\n')) {
    if (line.startsWith('## ')) {
      section = SECTIONS.get(line.trim()) ?? null;
      continue;
    }
    if (!section || !line.trim().startsWith('|')) continue;
    const cells = splitRow(line);
    if (isSeparator(cells) || isHeader(cells)) continue;
    if (cells.length !== COLUMNS[section]) {
      add(`${section}: row has ${cells.length} cells, expected ${COLUMNS[section]}: ${line.trim()}`);
      continue;
    }
    tables[section].push(cells);
  }

  // Shapes and inline rules.
  const criteria = new Map();
  for (const [id, text, rules] of tables.criteria) {
    if (!AC_ID.test(id)) add(`criteria: bad id "${id}"`);
    if (text === '') add(`criteria ${id}: empty criterion text`);
    if (rules === '') add(`criteria ${id}: empty Rules cell`);
    criteria.set(id, rules);
  }

  const rules = new Map();
  for (const [id, statement, acCell, caseCell] of tables.rules) {
    const ruleMatches = statement.match(/\./g) ?? [];
    if (!RULE_ID.test(id)) add(`rules: bad id "${id}"`);
    if (statement === '') add(`rules ${id}: empty rule`);
    if (ruleMatches.length > 2) add(`rules ${id}: ${ruleMatches.length} sentences; a rule is one obligation`);
    const acs = acCell.split(',').map(s => s.trim()).filter(Boolean);
    if (acs.length === 0) add(`rules ${id}: cites no acceptance criterion`);
    for (const ac of acs) if (!AC_ID.test(ac)) add(`rules ${id}: bad AC "${ac}"`);
    const happyOnly = caseCell.match(/happy-only:\s*(.+)$/);
    const cited = caseCell.replace(/happy-only:.*$/, '').split(',').map(s => s.trim()).filter(Boolean);
    if (!happyOnly && cited.length === 0) add(`rules ${id}: cites no case and no happy-only reason`);
    rules.set(id, { acs, cited, happyOnly: happyOnly ? happyOnly[1].trim() : null });
  }

  const cases = new Map();
  for (const [id, path, title, setup, action, expected] of tables.cases) {
    const match = id.match(CASE_ID);
    if (!match || match[2].startsWith('M')) add(`cases: bad id "${id}"`);
    if (!PATHS.includes(path)) add(`cases ${id}: unknown path "${path}"`);
    if (prefix && match && match[1] !== prefix) add(`cases ${id}: prefix does not match # S${prefix}`);
    for (const [name, value] of [['title', title], ['setup', setup], ['action', action], ['expected', expected]]) {
      if (value === '') add(`cases ${id}: empty ${name}`);
    }
    if (action.includes(';')) add(`cases ${id}: Action holds more than one action (";")`);
    if (/\bthen\b/i.test(action)) add(`cases ${id}: Action contains "then"`);
    if ((expected.match(/;/g) ?? []).length > 2) add(`cases ${id}: Expected holds more than three assertions`);
    cases.set(id, path);
  }

  const manual = new Map();
  for (const [id, rule, how, result] of tables.manual) {
    const match = id.match(CASE_ID);
    if (!match || !match[2].startsWith('M')) add(`manual: bad id "${id}" (expected S<nn>_M<n>)`);
    if (!RULE_ID.test(rule)) add(`manual ${id}: bad rule reference "${rule}"`);
    if (how === '' || result === '') add(`manual ${id}: empty procedure or required result`);
    manual.set(id, rule);
  }

  const coverage = new Map();
  for (const [path, caseCell, reason] of tables.coverage) {
    if (!PATHS.includes(path)) add(`coverage: unknown path "${path}"`);
    const listed = caseCell.split(',').map(s => s.trim()).filter(Boolean);
    if (listed.length === 0 && reason === '') add(`coverage ${path}: no cases and no reason`);
    for (const id of listed) {
      if (!cases.has(id)) add(`coverage ${path}: cites missing case ${id}`);
      else if (cases.get(id) !== path) add(`coverage ${path}: case ${id} is labelled ${cases.get(id)}`);
    }
    coverage.set(path, listed);
  }
  for (const path of PATHS) if (!coverage.has(path)) add(`coverage: missing row for "${path}"`);
  for (const [id, path] of cases) {
    if (coverage.has(path) && !coverage.get(path).includes(id)) add(`case ${id}: not listed under its ${path} Coverage row`);
  }

  // Closure: criteria to rules, rules to cases, cases back to rules.
  for (const [id, rule] of rules) {
    for (const ac of rule.acs) if (!criteria.has(ac)) add(`rules ${id}: cites AC ${ac} absent from Criteria`);
    if (rule.happyOnly && rule.happyOnly.length < 4) add(`rules ${id}: happy-only needs a reason`);
  }
  for (const [ac, targets] of criteria) {
    if (targets === 'Gap') continue;
    const ruleIds = targets.split(',').map(s => s.trim()).filter(Boolean);
    for (const rule of ruleIds) {
      if (!rules.has(rule)) add(`criteria ${ac}: cites missing rule ${rule}`);
    }
    const covered = ruleIds.some(ruleId => {
      const rule = rules.get(ruleId);
      return rule && rule.cited.some(caseId => cases.has(caseId) && cases.get(caseId) !== 'happy');
    });
    if (!covered) add(`criteria ${ac}: every case is happy; add a failure case or map it to a Gap`);
  }
  const cited = new Set();
  for (const [id, rule] of rules) {
    for (const caseId of rule.cited) {
      cited.add(caseId);
      if (!cases.has(caseId) && !manual.has(caseId)) add(`rules ${id}: cites missing case ${caseId}`);
    }
    const hasFailureCase = rule.cited.some(caseId => cases.has(caseId) && cases.get(caseId) !== 'happy');
    if (!hasFailureCase && !rule.happyOnly) add(`rules ${id}: every case is happy; add a failure case or happy-only: <reason>`);
  }
  for (const id of [...cases.keys(), ...manual.keys()]) {
    if (!cited.has(id)) add(`case ${id} proves no rule`);
  }
  for (const [id, rule] of manual) {
    if (rules.has(rule) && !rules.get(rule).cited.includes(id)) add(`manual ${id}: not cited by ${rule}`);
  }

  if (tables.criteria.length === 0) add('no Criteria table found');
  if (rules.size === 0) add('no Rules table found');
  if (cases.size === 0) add('no Cases table found');

  return { file, criteria: criteria.size, rules: rules.size, cases: cases.size, problems };
}

// Node resolves module symlinks, so import.meta.url is the real path while
// process.argv[1] keeps the symlinked one. Comparing them directly made the CLI
// exit 0 without checking anything when invoked through a link, such as /tmp on
// macOS. Compare resolved paths instead.
const resolve = path => { try { return realpathSync(path); } catch { return path; } };
const calledDirectly = Boolean(process.argv[1]) && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
const files = calledDirectly ? process.argv.slice(2) : [];
if (calledDirectly && files.length === 0) {
  console.error('Usage: node spec-check.mjs <spec.md> [more.md ...]');
  process.exitCode = 2;
} else if (calledDirectly) {
  let failed = false;
  for (const file of files) {
    const result = checkSpec(await readFile(file, 'utf8'), file);
    if (result.problems.length) {
      failed = true;
      for (const problem of result.problems) console.error(problem);
    } else {
      console.log(`${file}: ${result.criteria} criteria, ${result.rules} rules, ${result.cases} cases, closure holds`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}
