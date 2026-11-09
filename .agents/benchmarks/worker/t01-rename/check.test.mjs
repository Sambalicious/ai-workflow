import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { computeTotal } from './src/pricing.mjs';
import { cartTotal } from './src/cart.mjs';
import { invoiceLine } from './src/invoice.mjs';

test('computeTotal sums price times quantity', () => {
  assert.equal(computeTotal([{ price: 2, qty: 3 }, { price: 1, qty: 1 }]), 7);
});

test('callers still total correctly', () => {
  assert.equal(cartTotal({ items: [{ price: 2, qty: 2 }] }), 4);
  assert.equal(invoiceLine({ items: [{ price: 1.5, qty: 2 }] }), 'Total: 3.00');
});

test('no old name is left under src', () => {
  for (const file of readdirSync('src')) {
    assert.doesNotMatch(readFileSync(`src/${file}`, 'utf8'), /calcTotal/);
  }
});
