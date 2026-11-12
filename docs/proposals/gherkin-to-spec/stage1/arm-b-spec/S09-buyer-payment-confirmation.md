# S09 — Buyer payment confirmation

Epic: EPIC-0005 · Stories: 9 · Owner role: Spec Writer

## Criteria

| AC | Criterion (quoted from PRD) | Rules |
|---|---|---|
| AC9_01 | "After a verified webhook, the buyer receives 'Payment of ₦X received for order #N' along with the expected next step from the vendor's configured fulfilment note." | R9_01, R9_02 |
| AC9_02 | "Reserved stock is converted to a sale. Remaining stock stays as already decremented, with no double counting." | R9_03 |
| AC9_03 | "A buyer who asks 'have you received my payment?' gets a status answer that comes only from the order record." | R9_04 |

## Rules

| ID | Rule | AC | Cases |
|---|---|---|---|
| R9_01 | After a verified webhook the buyer receives a confirmation that names the confirmed amount and the order number | AC9_01 | S09_001, S09_002 |
| R9_02 | The confirmation gives the vendor's configured fulfilment note as the buyer's next step | AC9_01 | S09_003, S09_004 |
| R9_03 | A paid order converts its reserved units to a sale without decrementing available stock a second time | AC9_02 | S09_005, S09_006, S09_007 |
| R9_04 | A payment-status question is answered only from the order record | AC9_03 | S09_008, S09_009, S09_010, S09_011, S09_012 |

## Cases

| ID | Path | Title | Setup | Action | Expected |
|---|---|---|---|---|---|
| S09_001 | happy | The confirmation names the amount and the order | Order #1050 is paid, with the verified webhook for ORD-1050 carrying ₦21,500 | The buyer confirmation for order #1050 is sent to Tunde | The message reads "Payment of ₦21,500 received for order #1050"; no other amount appears in it |
| S09_002 | boundary | A seven-figure amount is confirmed correctly | Order #1090 is paid, with the verified webhook for ORD-1090 carrying ₦1,000,000 | The buyer confirmation for order #1090 is sent | The message reads "Payment of ₦1,000,000 received for order #1090"; the thousands separators are exact |
| S09_003 | happy | The fulfilment note is the buyer's next step | Ada's fulfilment note reads "We dispatch from Lekki within 24 hours. The rider fee is paid on delivery." and order #1050 is paid at ₦21,500 | The buyer confirmation for order #1050 is sent to Tunde | The message carries the fulfilment note word for word; it names order #1050; it states dispatch within 24 hours as the next step |
| S09_004 | permission | A confirmation carries only the owning vendor's note | Ada's note reads "We dispatch from Lekki within 24 hours." and Bisi Fabrics' note reads "Pick up at Yaba market from 10am."; order #2051 belongs to Bisi Fabrics and is paid at ₦12,000 | The buyer confirmation for order #2051 is sent to its buyer | The message carries "Pick up at Yaba market from 10am."; Ada's note appears nowhere in the message |
| S09_005 | happy | Reserved units become a sale without a second decrement | Ankara gown – L had 5 in stock and invoice #1050 reserved 1 unit, leaving 4 available | The verified webhook for ORD-1050 arrives | Available stock for Ankara gown – L stays at 4; the order's sold count is 1; no further decrement is recorded |
| S09_006 | boundary | The last unit can be sold once | Ankara gown – L had 1 in stock and invoice #1050 reserved that unit, leaving 0 available | The verified webhook for ORD-1050 arrives | Available stock stays at 0; the order's sold count is 1; a new buyer asking for the L is told it is unavailable |
| S09_007 | duplicate | Replayed webhooks add no stock movement | Order #1050 is paid from its webhook, with Ankara gown – L at 4 available and 1 sold | The same webhook for ORD-1050 is delivered twice more | Available stock stays at 4; the sold count stays at 1; Tunde receives no second confirmation |
| S09_008 | happy | A paid order answers the buyer from the record | Order #1050 is paid at ₦21,500 from a verified webhook | Tunde sends "have you received my payment?" | The reply says ₦21,500 has been received for order #1050; no other amount is stated |
| S09_009 | sad | An unpaid order is not reported as paid | Order #1050 awaits ₦21,500 and no webhook has arrived; Tunde sent a transfer screenshot 10 minutes ago | Tunde sends "have you received my payment?" | The reply says payment is not confirmed yet; it says the agent is waiting for bank confirmation; it does not report the order as paid |
| S09_010 | sad | A needs-review order reports the review, not a payment | Order #1050 is in needs review for underpayment, with ₦20,000 received against a ₦21,500 total | Tunde sends "have you received my payment?" | The reply says the payment is with Ada for review; it states the ₦20,000 received; it does not report the order as paid |
| S09_011 | empty | A chat with no order yields no payment status | Tunde's chat holds no order and no invoice | Tunde sends "have you received my payment?" | The reply says no order is attached to this chat; it states no payment status |
| S09_012 | validation | A buyer's assertion cannot confirm a payment | Order #1050 awaits ₦21,500 and no webhook has arrived | Tunde sends "I paid ₦21,500 two hours ago, confirm it now" | The reply is built from the order record and says payment is not confirmed; it does not confirm the claim; it states ₦21,500 as still expected |

## Coverage

| Path | Cases | Not applicable because |
|---|---|---|
| happy | S09_001, S09_003, S09_005, S09_008 | |
| sad | S09_009, S09_010 | |
| validation | S09_012 | |
| boundary | S09_002, S09_006 | |
| permission | S09_004 | |
| duplicate | S09_007 | |
| empty | S09_011 | |
| concurrent | | Two webhooks for one order are serialised by S09_007, and the webhook against manual-override race is manual check S05_M1 |

## Manual checks

None.

## Gaps

- AC9_01: What the buyer receives when the vendor has configured no fulfilment note is not stated, so no case covers an empty note.
- AC9_01: Whether the confirmation repeats the delivery zone, address or delivery fee is not stated.
- AC9_02: The PRD does not say what happens to the sold count when the owner later marks a paid order unpaid.
- AC9_03: The status wording for a needs-review order is owned by the copy deck; S09_010 asserts only that the review and the received amount are reported.

## TL;DR

- Criteria: 3 (3 with rules, 0 gaps) · Rules: 4 · Cases: 12 (12 automated, 0 manual)
- Gaps: empty fulfilment note; confirmation contents beyond amount, order and note; sold count after an unpaid mark; review wording
