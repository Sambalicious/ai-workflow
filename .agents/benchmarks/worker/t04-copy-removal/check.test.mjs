import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { copy } from './src/copy.mjs';

test('retired labels are gone', () => {
  assert.doesNotMatch(readFileSync('src/copy.mjs', 'utf8'), /Skipped by rules|Excluded families/);
});

test('other keys and values are unchanged', () => {
  assert.deepEqual(copy, {
    tabs: { good: 'Good matches', not_a_match: 'Not a match', all: 'All' },
    emptyTitle: 'Nothing here yet',
  });
});
