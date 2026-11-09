import test from 'node:test';
import assert from 'node:assert/strict';
import { pageCount } from './src/paginate.mjs';

test('a partial last page counts as a page', () => {
  assert.equal(pageCount(10, 3), 4);
  assert.equal(pageCount(1, 10), 1);
});

test('exact multiples and empty lists', () => {
  assert.equal(pageCount(9, 3), 3);
  assert.equal(pageCount(0, 3), 0);
});
