import test from 'node:test';
import assert from 'node:assert/strict';
import { toSlug } from './src/slug.mjs';

test('lowercases, trims, and hyphenates', () => {
  assert.equal(toSlug('  Hello World! '), 'hello-world');
});

test('throws TypeError with the guard message for non-string input', () => {
  for (const value of [null, undefined, 42, {}]) {
    assert.throws(() => toSlug(value), { name: 'TypeError', message: 'toSlug expects a string' });
  }
});
