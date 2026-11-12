import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkSpec, PATHS } from './spec-check.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const examples = join(here, '..', '..', 'docs', 'proposals', 'gherkin-to-spec', 'example', 'EPIC-0005');
const examplesPresent = await access(examples).then(() => true, () => false);

const HEADER = '# S07 — Test feature\n\nEpic: EPIC-0005 · Stories: 7 · Owner role: Spec Writer\n';

const valid = `${HEADER}
## Criteria

| AC | Criterion (quoted from PRD) | Rules |
|---|---|---|
| AC07_01 | "Every price is read from the record" | R07_01 |
| AC07_02 | "Off-topic requests are refused" | Gap |

## Rules

| ID | Rule | AC | Cases |
|---|---|---|---|
| R07_01 | Every price is read from the record at reply time. | AC07_01 | S07_001, S07_002 |

## Cases

| ID | Path | Title | Setup | Action | Expected |
|---|---|---|---|---|---|
| S07_001 | happy | Price | Item listed at N18,500 | Buyer asks the price | Reply states N18,500 |
| S07_002 | sad | Unknown item | No matching item listed | Buyer asks for it | Reply says it is not listed; offers the owner |

## Coverage

| Path | Cases | Not applicable because |
|---|---|---|
| happy | S07_001 | |
| sad | S07_002 | |
| validation | | No input is accepted in this feature |
| boundary | | No numeric edge exists |
| permission | | No actor other than the buyer |
| duplicate | | The action is idempotent by construction |
| empty | | No list state |
| concurrent | | No shared resource |

## Manual checks

None.

## Gaps

- AC07_02: refuses off-topic requests, outside this feature

## TL;DR

- Criteria: 2 (1 with rules, 1 gap) · Rules: 1 · Cases: 2 (2 automated, 0 manual)
- Gaps: AC07_02
`;

const mutate = (from, to) => valid.replace(from, to);

test('the two worked examples pass the checker',
  { skip: !examplesPresent && 'worked examples live in the factory checkout' },
  async () => {
    for (const file of ['S07-accurate-answers-escalation.md', 'S05-payment-confirmation.md']) {
      const result = checkSpec(await readFile(join(examples, file), 'utf8'), file);
      assert.deepEqual(result.problems, [], file);
    }
  });

test('a well-formed spec passes', () => {
  assert.deepEqual(checkSpec(valid).problems, []);
});

test('every path type is represented in the checker', () => {
  assert.equal(PATHS.length, 8);
});

test('rows the checker cannot parse are errors, not skips', () => {
  const capitalised = mutate('| S07_002 | sad |', '| S07_002 | Sad |');
  assert.ok(checkSpec(capitalised).problems.some(p => /unknown path/.test(p)));

  const backticked = mutate('| S07_001 | happy |', '| `S07_001` | happy |');
  assert.ok(checkSpec(backticked).problems.some(p => /bad id/.test(p)));

  const compound = mutate('| S07_002 | sad |', '| S07_002 | sad/permission |');
  assert.ok(checkSpec(compound).problems.some(p => /unknown path/.test(p)));
});

test('coverage gaps and mismatches fail', () => {
  const missingRow = mutate('| concurrent | | No shared resource |\n', '');
  assert.ok(checkSpec(missingRow).problems.some(p => /missing row for "concurrent"/.test(p)));

  const blankWithoutReason = mutate('| concurrent | | No shared resource |', '| concurrent | | |');
  assert.ok(checkSpec(blankWithoutReason).problems.some(p => /no cases and no reason/.test(p)));

  const wrongRow = mutate('| sad | S07_002 | |', '| sad | S07_001 | |');
  assert.ok(checkSpec(wrongRow).problems.some(p => /is labelled happy/.test(p)));

  const unlisted = mutate('| happy | S07_001 | |', '| happy | | Covered by S07_001 |');
  assert.ok(checkSpec(unlisted).problems.some(p => /not listed under its happy Coverage row/.test(p)));
});

test('a happy-only rule cannot carry a criterion on its own', () => {
  const noFailureCase = mutate('| AC07_01 | S07_001, S07_002 |', '| AC07_01 | S07_001 |');
  assert.ok(checkSpec(noFailureCase).problems.some(p => /every case is happy/.test(p)));

  // A happy-only rule is allowed only when its criterion reaches a failure case
  // through another rule; here it is the criterion's only rule, so it fails too.
  const reasoned = mutate('| AC07_01 | S07_001, S07_002 |',
    '| AC07_01 | S07_001, happy-only: the record always exists |');
  assert.ok(checkSpec(reasoned).problems.some(p => /criteria AC07_01: every case is happy/.test(p)));
});

test('criteria closure is enforced', () => {
  const droppedCriterion = mutate('| AC07_01 | "Every price is read from the record" | R07_01 |\n', '');
  assert.ok(checkSpec(droppedCriterion).problems.some(p => /absent from Criteria/.test(p)));

  const danglingRule = mutate('| AC07_01 | "Every price is read from the record" | R07_01 |',
    '| AC07_01 | "Every price is read from the record" | R07_09 |');
  assert.ok(checkSpec(danglingRule).problems.some(p => /cites missing rule R07_09/.test(p)));
});

test('one action and bounded outcomes are enforced', () => {
  const twoActions = mutate('| Buyer asks the price |', '| Buyer asks; then waits |');
  assert.ok(checkSpec(twoActions).problems.some(p => /more than one action/.test(p)));

  const thenAction = mutate('| Buyer asks the price |', '| Buyer asks and then pays |');
  assert.ok(checkSpec(thenAction).problems.some(p => /contains "then"/.test(p)));

  const fourAssertions = mutate('| Reply states N18,500 |', '| a; b; c; d |');
  assert.ok(checkSpec(fourAssertions).problems.some(p => /more than three assertions/.test(p)));
});

test('empty cells and orphan cases fail', () => {
  const emptyExpected = mutate('| Reply states N18,500 |', '| |');
  assert.ok(checkSpec(emptyExpected).problems.some(p => /empty expected/.test(p)));

  const orphan = mutate('| Buyer asks for it | Reply says it is not listed; offers the owner |',
    '| Buyer asks for it | Reply says it is not listed; offers the owner |\n| S07_003 | happy | Extra | Item listed | Buyer asks | Reply states the price |');
  assert.ok(checkSpec(orphan).problems.some(p => /S07_003 proves no rule/.test(p)));
});

test('the file heading and ID prefix must agree', () => {
  const wrongPrefix = mutate('# S07 — Test feature', '# S09 — Test feature');
  assert.ok(checkSpec(wrongPrefix).problems.some(p => /prefix does not match/.test(p)));
});
