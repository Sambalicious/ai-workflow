import { calcTotal } from './pricing.mjs';

export function invoiceLine(invoice) {
  return `Total: ${calcTotal(invoice.items).toFixed(2)}`;
}
