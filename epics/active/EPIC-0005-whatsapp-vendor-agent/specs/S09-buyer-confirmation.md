# S09 — Buyer payment confirmation

Epic: EPIC-0005 · Stories: 9 · Owner role: Spec Writer

## Criteria

| AC | Criterion (quoted from PRD) | Rules |
|---|---|---|
| AC9_01 | “After a verified webhook, the buyer receives "Payment of ₦X received for order #N" along with the expected next step from the vendor's configured fulfilment note.” | R9_01, R9_02 |
| AC9_02 | “Reserved stock is converted to a sale. Remaining stock stays as already decremented, with no double counting.” | R9_03 |
| AC9_03 | “A buyer who asks "have you received my payment?" gets a status answer that comes only from the order record.” | R9_04 |

## Rules

| ID | Rule | AC | Cases |
|---|---|---|---|
| R9_01 | After a verified webhook the buyer receives a confirmation stating the amount paid and the order number. | AC9_01 | S09_001, S09_002 |
| R9_02 | The payment confirmation carries the next step taken from the vendor's configured fulfilment note. | AC9_01 | S09_003, S09_004 |
| R9_03 | Payment converts the reserved quantity into a sale and leaves the remaining quantity as already decremented. | AC9_02 | S09_005, S09_006 |
| R9_04 | A buyer's payment question is answered only from the order record, and only for orders in that buyer's chat. | AC9_03 | S09_007, S09_008, S09_009, S09_010, S09_011 |

## Cases

Fixture note: #1042 in this file is 2 × Ankara gown – L at ₦18,500 plus the Lagos Mainland ₦3,000 delivery fee, total ₦40,000. That is the same order as #1042 in S08 and S10 and a different order from #2042 in S03 and #5042 in S05, which a seed shared across specs must keep apart. Two quantities are cited: a record's quantity is its physical unit count, and its available quantity is that count minus the units reserved on unpaid invoices.

| ID | Path | Title | Setup | Action | Expected |
|---|---|---|---|---|---|
| S09_001 | happy | Buyer told the amount and order number | Order #1042 for 2 × Ankara gown – L at ₦18,500 with Lagos Mainland delivery of ₦3,000, total ₦40,000, is reserved and the vendor's fulfilment note reads "We dispatch within 24 hours of payment" | The verified webhook confirms ₦40,000 for order #1042 | The buyer receives a confirmation reading Payment of ₦40,000 received for order #1042 |
| S09_002 | duplicate | Replayed webhook sends one confirmation | Order #1042 is paid at ₦40,000 and one confirmation was already sent to the buyer | The verified webhook for #1042 is delivered again | The buyer receives no second confirmation within 10 minutes of the redelivery; order #1042 stays paid |
| S09_003 | happy | Fulfilment note is the next step | Order #1042 is paid at ₦40,000 for 2 × Ankara gown – L at ₦18,500 plus the Lagos Mainland ₦3,000 fee, and the fulfilment note reads "We dispatch within 24 hours of payment" | The confirmation for #1042 is sent | The confirmation contains the words We dispatch within 24 hours of payment |
| S09_004 | empty | No fulfilment note configured | Order #1042 is paid at ₦40,000 for 2 × Ankara gown – L at ₦18,500 plus the Lagos Mainland ₦3,000 fee, and the vendor has saved no fulfilment note | The confirmation for #1042 is sent | The confirmation states ₦40,000 and order #1042; it contains none of the words dispatch, delivery, collection or pickup |
| S09_005 | happy | Reservation becomes a sale | Ankara gown – L is listed at ₦18,500 with quantity 5 and available quantity 3, and 2 units are reserved on order #1042 at ₦40,000, which is awaiting payment | The verified webhook confirms order #1042 | The record's quantity is 3 and its available quantity is 3; one sale of 2 units is recorded |
| S09_006 | duplicate | No second decrement after payment | Ankara gown – L has a quantity of 3 and an available quantity of 3 after order #1042 was paid for 2 units | The verified webhook for #1042 is processed again | The record's quantity stays 3 and its available quantity stays 3; the recorded sale stays at 2 units |
| S09_007 | happy | Payment status answered from the record | The buyer's chat holds one order in the state <input> | The buyer asks "have you received my payment?" | The reply states the <input> status of that order; it names no other order |
| S09_008 | validation | Buyer insists the bank confirmed | Order #1042 is awaiting payment with no verified webhook and the buyer claims the bank confirmed the transfer | The buyer asks "have you received my payment?" | The reply states the payment is still awaiting confirmation; order #1042 stays awaiting payment |
| S09_009 | concurrent | Webhook lands as the buyer asks | Order #1042 is awaiting payment and the buyer asks "have you received my payment?" at 10:00:00 | The verified webhook for #1042 arrives at 10:00:00 before the reply is sent | The reply reflects the order record at reply time; no paid statement is made without the webhook |
| S09_010 | permission | Buyer asks about another buyer's order | Order #1044 belongs to buyer +2348030000003 and no order #1044 exists in the chat with +2348030000002 | +2348030000002 asks "have you received my payment for order #1044?" | The reply gives no data about order #1044; the buyer is asked to confirm their own order number |
| S09_011 | sad | Buyer asks about an order that does not exist | The vendor's highest order number is #1042 and the chat holds orders #1040 and #1042 | The buyer asks "have you received my payment for order #1099?" | The reply states order #1099 does not exist; no status or amount is given for it |

## Examples

### S09_007

| input | expected |
|---|---|
| awaiting payment | the reply states no payment has been received for that order |
| paid | the reply states the payment was received for that order and names the order number |
| underpayment review state | the reply states the payment is being reviewed by the owner and names the order number |

## Coverage

| Path | Cases | Not applicable because |
|---|---|---|
| happy | S09_001, S09_003, S09_005, S09_007 | |
| sad | S09_011 | |
| validation | S09_008 | |
| boundary | | the 60-second confirmation deadline and the 24-hour window edge are owned by S05_028 and S05_029 |
| permission | S09_010 | |
| duplicate | S09_002, S09_006 | |
| empty | S09_004 | |
| concurrent | S09_009 | |

## Manual checks

None.

## Gaps

- AC9_01: the PRD does not say what the buyer sees when no fulfilment note is configured, so S09_004 asserts only that no next step is claimed, checked against the words dispatch, delivery, collection and pickup.
- AC9_01: the exact confirmation wording is given only as a shape, so the cases assert amount and order number rather than final copy; the string belongs to the Copywriter through the Designer's copy slots, and no copy deck exists for this epic.
- AC9_03: whether the buyer may ask about an order older than the current chat is unstated, so S09_010 and S09_011 assume only orders in that buyer's own chat.
- AC9_02 with AC5_04 and AC2_07: S09_005 and S09_006 read a record's quantity and its available quantity as two numbers, following AC8_03, AC9_02 and AC2_07; S05 Gaps records the same model and the PM should confirm it. Both cases are also blocked on the inventory read surface (C11) and the sale-record surface (C7).
- AC9_03: S09_009 cannot fail as written. Whether the status answer reads the order record when the buyer's message is received or when the reply is sent is unstated, so both awaiting-payment and paid satisfy it. The read point is needed from the PM with the Architect, and S09_009 stays blocked until then.

## TL;DR

- Criteria: 3 (3 with rules) · Rules: 4 · Cases: 11, all automated · Manual checks: 0
- Gaps: missing fulfilment note (AC9_01), confirmation copy and missing copy deck (AC9_01), order history scope (AC9_03), quantity versus available-quantity model (AC9_02 with AC5_04), read point for the status answer and blocked S09_009 (AC9_03)
