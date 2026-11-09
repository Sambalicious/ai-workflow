import { calcTotal } from './pricing.mjs';

export function cartTotal(cart) {
  return calcTotal(cart.items);
}
