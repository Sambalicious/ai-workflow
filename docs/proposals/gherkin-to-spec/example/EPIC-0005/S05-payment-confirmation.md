# S05 — Payment is confirmed by the provider, never by a screenshot

Epic: EPIC-0005 · Stories: 5, 9 · Owner role: Spec Writer

## Criteria

| AC | Criterion (quoted from PRD) | Rules |
|---|---|---|
| AC05_01 | "Every invoice gets a payment destination tied to that order ... a dynamic virtual account with the exact order amount and an expiry. A hosted payment link is the fallback." | R05_09 |
| AC05_02 | "An order is marked paid only when a verified provider webhook arrives ... The signature is validated. A server-side transaction lookup confirms the amount and the reference." | R05_01 |
| AC05_03 | "Customer messages, screenshots, or receipts never change payment status on their own" | R05_02 |
| AC05_04 | "Webhook processing is idempotent ... never double-confirms an order or double-decrements stock" | R05_03 |
| AC05_05 | "Underpayment, overpayment, and payment after invoice expiry each put the order into a distinct needs owner review state" | R05_04 |
| AC05_06 | "The owner can mark an order paid or unpaid manually. Every override is recorded with owner number, timestamp, and optional reason, and is labelled as manual" | R05_05 |
| AC05_07 | "If a webhook confirms payment and the buyer's 24-hour customer-service window is still open, the buyer receives a confirmation in chat within 60 seconds ... If the window has closed, confirmation goes out as an approved utility template" | R05_08 |
| AC09_01 | "the buyer receives \"Payment of ₦X received for order #N\" along with the expected next step from the vendor's configured fulfilment note" | R05_10 |
| AC09_02 | "Reserved stock is converted to a sale. Remaining stock stays as already decremented, with no double counting." | R05_06 |
| AC09_03 | "A buyer who asks \"have you received my payment?\" gets a status answer that comes only from the order record" | R05_07 |

## Rules

| ID | Rule | AC | Cases |
|---|---|---|---|
| R05_01 | An order is paid only after a webhook whose signature validates and whose server-side lookup matches amount and reference. | AC05_02 | S05_001, S05_003 |
| R05_02 | Customer messages, screenshots and receipts never change payment status. | AC05_03 | S05_002, S05_009 |
| R05_03 | A duplicate or replayed webhook never double-confirms an order and never double-decrements stock. | AC05_04 | S05_004, S05_012 |
| R05_04 | Underpayment, overpayment and payment after expiry each produce a distinct review state with its own owner notification. | AC05_05 | S05_005, S05_006, S05_007 |
| R05_05 | A manual override records owner number, timestamp and optional reason, and is labelled manual in the order list. | AC05_06 | S05_008 |
| R05_06 | Reserved stock converts to a sale on payment and is never decremented twice for one order. | AC09_02 | S05_001, S05_008 |
| R05_07 | A buyer-facing payment status comes only from the order record. | AC09_03 | S05_010 |
| R05_08 | A paid order confirms in chat within 60 seconds while the 24-hour window is open, and by an approved utility template after it closes. | AC05_07 | S05_001, S05_011 |
| R05_09 | Every invoice carries a payment destination tied to that order, with the exact amount and an expiry, and a hosted link as fallback. | AC05_01 | S05_013, S05_014 |
| R05_10 | The payment confirmation names the amount and order number and gives the next step from the vendor's fulfilment note. | AC09_01 | S05_001, S05_015, S05_016 |

## Cases

| ID | Path | Title | Setup | Action | Expected |
|---|---|---|---|---|---|
| S05_001 | happy | Verified payment | Order #A1041 for ₦23,000 awaiting payment with the service window open | A signed webhook arrives and the lookup matches amount and reference | Order becomes paid; reserved stock converts to sold; buyer receives "Payment of ₦23,000 received for order #A1041" within 60s |
| S05_002 | sad | Screenshot only | Order #A1041 awaiting payment | Buyer sends a transfer screenshot and "I have paid" | Order stays awaiting payment; buyer is told it is waiting for bank confirmation; owner is notified |
| S05_003 | validation | Bad signature | Order #A1041 awaiting payment | A webhook arrives with an invalid signature | Webhook rejected; order unchanged and no buyer message; rejection logged with its reason |
| S05_004 | duplicate | Replayed webhook | Order #A1041 already paid | The same webhook is delivered again | Order stays paid; stock is not decremented again; no second buyer confirmation |
| S05_005 | boundary | Underpayment | Order #A1041 with an invoice total of ₦23,000 | A verified webhook for ₦20,000 arrives | Order enters underpaid review; owner is notified; buyer is told the owner will follow up |
| S05_006 | boundary | Overpayment | Order #A1041 with an invoice total of ₦23,000 | A verified webhook for ₦25,000 arrives | Order enters overpaid review; owner is notified; order is not marked paid |
| S05_007 | boundary | Payment after expiry | Order #A1041 expired one minute ago | A verified webhook for the exact amount arrives | Order enters paid-after-expiry review; owner is notified; stock handling is recorded and consistent |
| S05_008 | permission | Manual override | Order #A1041 awaiting payment | Owner marks it paid manually | Order becomes paid labelled manual with owner number, timestamp and reason; stock converts once |
| S05_009 | permission | Refund claim | Order #A1041 already paid | Buyer claims a refund was agreed | Payment status unchanged; the claim escalates to the owner |
| S05_010 | empty | Ask after expiry | Order #A1041 expired and its reservation was released | Buyer asks "have you received my payment?" | Reply states the order expired and is unpaid, taken from the order record only |
| S05_011 | boundary | Window closed | Buyer's 24-hour service window has closed | A verified webhook for the exact amount arrives | Order becomes paid; confirmation goes out as an approved utility template, not a free-form message |
| S05_012 | duplicate | Simultaneous replay | Two webhooks for the same reference arrive 2 seconds apart | Both are processed | Exactly one confirmation; one buyer message; one stock conversion |
| S05_013 | happy | Invoice payment destination | Order #A1041 for ₦23,000 with a 60-minute expiry | The invoice is issued | Invoice shows a virtual account with the exact amount and expiry; amount, bank and account name are visible |
| S05_014 | sad | Virtual account unavailable | Order #A1041 for ₦23,000 and the provider cannot create a virtual account | The invoice is issued | Invoice shows a hosted payment link for the exact amount instead; no order is left without a destination |
| S05_015 | happy | Fulfilment note next step | Order #A1041 paid, vendor fulfilment note configured | The confirmation is composed | Buyer confirmation ends with the vendor's configured next step, quoted exactly |
| S05_016 | empty | No fulfilment note | Order #A1041 paid, vendor has configured no fulfilment note | The confirmation is composed | Buyer receives the amount and order number; no invented next step appears |

## Coverage

| Path | Cases | Not applicable because |
|---|---|---|
| happy | S05_001, S05_013, S05_015 | |
| sad | S05_002, S05_014 | |
| validation | S05_003 | |
| boundary | S05_005, S05_006, S05_007, S05_011 | |
| permission | S05_008, S05_009 | |
| duplicate | S05_004, S05_012 | |
| empty | S05_010, S05_016 | |
| concurrent | | Two deliveries of one webhook are covered as duplicate in S05_012; no other shared resource is written here |

## Manual checks

None.

## Examples

**Proof of payment from the buyer.** The reply describes the process, never a judgement:
"I'm waiting for the bank to confirm your payment. I've let the owner know." It never says
"confirmed" or "received", and never implies the goods are released. A screenshot is
stored for the owner, never parsed into a status.

**Review states are distinct.** Underpaid, overpaid and paid-after-expiry are three states
with three owner notifications, not one generic "needs review"; the order list filter must
distinguish them.

## Gaps

- Whether an expired order's stock is reinstated or sold on late payment is a product
  decision the PRD does not make; S05_007 requires only that it be recorded and consistent.
- Refund flows are not in v1 and are not specified here.
- The webhook envelope and signature algorithm belong to the API contract, not this spec.

## TL;DR

- Criteria: 10 (10 with rules, 0 gaps) · Rules: 10 · Cases: 16 (16 automated, 0 manual)
- Gaps: expired-order stock policy, refunds, webhook contract
