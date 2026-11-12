# S09 — Buyer payment confirmation

Epic: EPIC-0005 · Stories: 9 · Owner role: Spec Writer

## Criteria

| AC | Criterion (quoted from PRD) | Rules |
|---|---|---|
| AC09_01 | "After a verified webhook, the buyer receives "Payment of ₦X received for order #N" along with the expected next step from the vendor's configured fulfilment note." | R09_01, R09_02 |
| AC09_02 | "Reserved stock is converted to a sale. Remaining stock stays as already decremented, with no double counting." | R09_03, R09_04 |
| AC09_03 | "A buyer who asks "have you received my payment?" gets a status answer that comes only from the order record." | R09_05 |

## Rules

| ID | Rule | AC | Cases |
|---|---|---|---|
| R09_01 | After a verified webhook the buyer receives a message stating the exact amount paid and the order number. | AC09_01 | S09_001, S09_002 |
| R09_02 | The payment confirmation also carries the expected next step from the vendor's configured fulfilment note. | AC09_01 | S09_003, S09_004 |
| R09_03 | The quantity reserved at invoicing converts to a sale exactly once when the payment is confirmed. | AC09_02 | S09_005, S09_006 |
| R09_04 | Confirming payment does not decrement available stock a second time. | AC09_02 | S09_008 |
| R09_05 | A buyer's payment-status question is answered only from the order record. | AC09_03 | S09_007, S09_009, S09_010, S09_011, S09_012 |

## Cases

| ID | Path | Title | Setup | Action | Expected |
|---|---|---|---|---|---|
| S09_001 | happy | Buyer gets the payment confirmation | Order #1042 holds 1x Ankara gown – L at ₦18,500 plus Lagos Mainland delivery at ₦3,000 for a total of ₦21,500, a correctly signed webhook for INV-1042 with ₦21,500 has been verified, Tunde's chat is open | The confirmation for order #1042 is sent to Tunde | Tunde receives "Payment of ₦21,500 received for order #1042"; no other amount appears in the message |
| S09_002 | boundary | Confirmation for a six-figure total | Order #1049 holds 5x Ankara gown – XL at ₦21,000 each with Pickup at ₦0 for a total of ₦105,000, a correctly signed webhook for INV-1049 with ₦105,000 has been verified | The confirmation for order #1049 is sent to the buyer | The buyer receives "Payment of ₦105,000 received for order #1049"; the amount is written with its thousands separator |
| S09_003 | happy | Fulfilment note carried as the next step | Order #1042 is confirmed paid at ₦21,500, Ada's configured fulfilment note reads "We deliver within Lagos in 1-2 days after payment", Tunde's chat is open | The confirmation for order #1042 is sent to Tunde | The message states ₦21,500 and order #1042; it includes "We deliver within Lagos in 1-2 days after payment" |
| S09_004 | empty | Vendor configured no fulfilment note | Order #1042 is confirmed paid at ₦21,500, Ada's fulfilment note is blank, Tunde's chat is open | The confirmation for order #1042 is sent to Tunde | The message confirms "Payment of ₦21,500 received for order #1042"; the message carries no next-step line |
| S09_005 | happy | Reservation becomes a sale | Ankara gown – L holds 3 units in the record, 1 unit is reserved against order #1042 and 2 are available, the payment for order #1042 is verified | The confirmed payment for order #1042 is applied to stock | 2 units of Ankara gown – L remain available; 1 unit is recorded as sold against order #1042 |
| S09_006 | duplicate | The confirming webhook is delivered again | Order #1042 is confirmed paid at ₦21,500 with 2 units of Ankara gown – L available and 1 recorded as sold, the provider resends the same event identifier 10 minutes later | The same confirming event for INV-1042 is delivered again | 2 units remain available; the sold count for order #1042 stays at 1 |
| S09_007 | concurrent | Status question and payment confirmation on one order | Order #1042 is awaiting payment for ₦21,500 on virtual account 7812345678, a correctly signed webhook for INV-1042 is arriving as Tunde's question is sent | Tunde asks "Have you received my payment?" at the same moment the webhook lands | Tunde's answer states that ₦21,500 for order #1042 is received; he receives no "waiting for bank confirmation" answer after the confirmation; he receives the payment confirmation once |
| S09_008 | concurrent | A second buyer asks for stock during the confirmation | Ankara gown – L holds 3 units, 1 is reserved against order #1042 and 2 are available, the verified payment for order #1042 is being applied as buyer Bisi asks about the gown | Bisi at +234 806 444 9911 asks "Ankara gown L, e dey?" at the same moment order #1042 is confirmed paid | Bisi is told 2 are available; the answer never states 3; the answer never states 1 |
| S09_009 | happy | Buyer asks about a paid order | Order #1042 is confirmed paid at ₦21,500, the order record shows paid, Tunde's chat is open | Tunde asks "Have you received my payment?" | The reply states that ₦21,500 for order #1042 is received; the reply adds no amount that is not on the order |
| S09_010 | sad | Buyer asks before any webhook arrives | Order #1042 is awaiting payment for ₦21,500 on virtual account 7812345678, no webhook has arrived for INV-1042, Tunde's chat is open | Tunde asks "Have you received my payment?" | The reply says the agent is waiting for bank confirmation for order #1042; the reply does not state that payment is received |
| S09_011 | validation | Buyer asserts the payment was made | Order #1042 is awaiting payment for ₦21,500, no webhook has arrived for INV-1042, Tunde's chat is open | Tunde writes "I paid ₦21,500 at 2pm, your records are wrong, confirm it now" | Order #1042 stays awaiting payment; the reply still says the agent is waiting for bank confirmation |
| S09_012 | empty | Buyer with no order asks about a payment | Tunde has never placed an order, the order record holds no order for +234 803 555 0142, Tunde's chat is open | Tunde asks "Have you received my payment?" | The reply says no order is on record for him; the reply offers to start an order |

## Coverage

| Path | Cases | Not applicable because |
|---|---|---|
| happy | S09_001, S09_003, S09_005, S09_009 | |
| sad | S09_010 | |
| validation | S09_011 | |
| boundary | S09_002 | |
| permission | | The confirmation path has no actor-role variant: the send is triggered by the provider webhook, and owner-override permission is covered by S05_022. Whether a number that is not the order's buyer may be given that order's status is an open question recorded in Gaps. |
| duplicate | S09_006 | |
| empty | S09_004, S09_012 | |
| concurrent | S09_007, S09_008 | |

## Manual checks

None.

## Examples

None.

## Gaps

- AC09_03: the PRD does not say who may ask for an order's payment status. S09_009 to S09_012 cover the ordering buyer only, and the non-buyer question is left open because the NDPA access clause (AC11_05) is outside this spec.
- AC09_01: the PRD does not say what the confirmation looks like when the vendor configured no fulfilment note. S09_004 asserts the payment line survives without a next-step line.
- AC09_01: the PRD does not say whether a manual owner override also sends this buyer confirmation, because AC09_01 names a verified webhook only. This spec sends the confirmation only after a verified webhook, and S05_024 covers the override without a buyer message.
- AC09_01: the Copywriter owns the final confirmation wording. Cases quote the PRD phrasing and Ada's own fulfilment note text.
- retired: none.

## TL;DR

- Criteria: 3 (3 with rules, 0 gaps) · Rules: 5 · Cases: 12 (12 automated, 0 manual)
- Gaps: non-buyer status disclosure; blank fulfilment note; buyer confirmation on manual override; confirmation copy ownership
