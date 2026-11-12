# S06 — Paid-order notifications and order list

Epic: EPIC-0005 · Stories: 6 · Owner role: Spec Writer

## Criteria

| AC | Criterion (quoted from PRD) | Rules |
|---|---|---|
| AC6_01 | “On payment confirmation, the owner receives a WhatsApp notification with the order number, items, quantities, total, delivery zone and address, and buyer contact.” | R6_01, R6_02 |
| AC6_02 | “The owner can request "open orders", "paid today", or "order #123" over WhatsApp. A minimal mobile web order list shows the same data with status filters: awaiting payment, paid, needs review, cancelled, and expired.” | R6_03, R6_04, R6_05, R6_06, R6_07 |
| AC6_03 | “The owner can mark a paid order "fulfilled". This is informational only and has no logistics integration.” | R6_08 |

## Rules

| ID | Rule | AC | Cases |
|---|---|---|---|
| R6_01 | A paid order produces an owner notification naming the order number, its items and the quantity of each item. | AC6_01 | S06_001, S06_002, S06_020 |
| R6_02 | The paid-order notification also carries the total, the delivery zone, the delivery address and the buyer's contact. | AC6_01 | S06_003, S06_004 |
| R6_03 | The owner receives the open orders when asking for open orders over WhatsApp. | AC6_02 | S06_005, S06_006 |
| R6_04 | The owner receives the orders paid that day when asking for paid today over WhatsApp. | AC6_02 | S06_007, S06_008 |
| R6_05 | The owner receives one order's details over WhatsApp when asking for its order number. | AC6_02 | S06_009, S06_010, S06_011, S06_012 |
| R6_06 | The mobile order list filters orders by awaiting payment, paid, needs review, cancelled and expired. | AC6_02 | S06_013, S06_014 |
| R6_07 | The order list and the WhatsApp order answers show the same values for the same order. | AC6_02 | S06_015, S06_016 |
| R6_08 | The owner marks a paid order fulfilled, which changes no payment status and triggers no logistics action. | AC6_03 | S06_017, S06_018, S06_019 |

## Cases

Fixture note: order numbers are local to this file. Here #6042 is the paid ₦21,500 order of 1 × Ankara gown – L plus the Lagos Mainland ₦3,000 fee; #1042 in S08, S09 and S10 is a different order, so a seed shared across specs must allocate order numbers per spec.

| ID | Path | Title | Setup | Action | Expected |
|---|---|---|---|---|---|
| S06_001 | happy | Paid order notified to the owner | Order #6042 for 1 Ankara gown – L at ₦18,500 is confirmed paid by verified webhook | The owner notification is sent | The notification names order #6042; it lists 1 × Ankara gown – L |
| S06_002 | boundary | Long order fully listed | Order #6051 holds 25 item lines and is confirmed paid by verified webhook | The owner notification is sent | All 25 lines appear with their quantities; the notification names order #6051 |
| S06_003 | happy | Notification carries totals and buyer details | Order #6042 is paid at ₦21,500 with delivery zone Lagos Mainland, address 14 Adeola Odeku, Victoria Island and buyer +2348030000002 | The owner notification is sent | The notification shows ₦21,500, Lagos Mainland, the full address and +2348030000002 |
| S06_004 | boundary | Pickup order notification | Order #6052 is paid at ₦37,000 with Pickup chosen and no delivery address collected | The owner notification is sent | The notification shows Pickup with a ₦0 delivery fee; it names buyer +2348030000003 |
| S06_005 | happy | Open orders over WhatsApp | Orders #6042, #6043 and #6044 are awaiting payment and #6041 is paid | The owner sends "open orders" | The reply lists #6042, #6043 and #6044 with their totals; #6041 is absent |
| S06_006 | empty | Open orders with none open | Only paid order #6041 exists for the vendor | The owner sends "open orders" | The reply states there are no open orders; no order rows are listed |
| S06_007 | happy | Paid today over WhatsApp | Orders #6040 and #6041 were paid today at ₦21,500 and ₦37,000, and #6039 was paid yesterday | The owner sends "paid today" | The reply lists #6040 and #6041 with their totals; #6039 is absent |
| S06_008 | boundary | Day boundary in Lagos time | Order #6040 is paid at 23:59 Lagos time and order #6050 is paid at 00:01 the next Lagos day | The owner sends "paid today" at 09:00 on the day after #6050 was paid | The reply lists #6050; #6040 is counted under the previous day |
| S06_009 | happy | One order by number | Order #6042 exists, paid, 1 × Ankara gown – L, total ₦21,500 | The owner sends "order #6042" | The reply shows #6042, its item, quantity and ₦21,500 |
| S06_010 | sad | Order number that does not exist | The vendor's highest order number is #6042 and #999 does not exist | The owner sends "order #999" | The reply states no order #999 exists; no order details are shown |
| S06_011 | validation | Malformed order request | Order #6042 exists for the vendor | The owner sends "order #abc" | The agent asks for a numeric order number; no order details are shown |
| S06_012 | permission | Non-owner asks for an order | Order #6042 exists for vendor Ada Styles with buyer +2348030000002 | +2348030000005 sends "order #6042" | The sender is shown no owner-facing order detail, address, contact or total |
| S06_013 | happy | Order list filters by status | The vendor has 1 awaiting payment, 1 paid, 1 needs review, 1 cancelled and 1 expired order | The owner selects the <input> filter in the mobile order list | Only orders in the <input> state are listed; the count matches that state |
| S06_014 | empty | Filter with no matching orders | The vendor has 2 paid orders and no cancelled orders | The owner selects the cancelled filter | The list shows 0 orders; the filter stays selectable |
| S06_015 | happy | List and WhatsApp answers agree | Order #6042 is paid at ₦21,500 with delivery zone Lagos Mainland | The owner asks "order #6042" and opens the same order in the list | Both show paid, ₦21,500 and Lagos Mainland |
| S06_016 | concurrent | List opened as the webhook lands | Order #6042 is awaiting payment and the owner opens it in the list at 10:00:00 | The verified webhook marks #6042 paid at 10:00:00 and the owner asks "order #6042" at 10:00:05 | The WhatsApp answer shows paid; the list shows paid once refreshed |
| S06_017 | happy | Mark a paid order fulfilled | Order #6042 is paid at ₦21,500 and no fulfilment is recorded | The owner marks #6042 fulfilled | The order shows fulfilled with the owner's timestamp; its status stays paid |
| S06_018 | permission | Non-owner marks an order fulfilled | Order #6042 is paid and unfulfilled | +2348030000002 sends "fulfil #6042" | Order #6042 stays unfulfilled; the sender is shown no owner-facing order detail |
| S06_019 | duplicate | Fulfilled marked twice | Order #6042 is paid and the owner has just marked it fulfilled | The owner marks #6042 fulfilled again | The order stays fulfilled; one fulfilment timestamp is recorded |
| S06_020 | sad | Payment notice outside the window | Order #6042 is paid and the owner has been silent for 30 hours, outside the 24-hour owner window stated in assumption A2 | The owner notification is sent | The notification arrives as an approved utility template; it names order #6042 and ₦21,500 |

## Examples

### S06_013

| input | expected |
|---|---|
| awaiting payment | the 1 order awaiting payment, and no order in any other state |
| paid | the 1 paid order, and no order in any other state |
| needs review | the 1 needs-review order, and no order in any other state |
| cancelled | the 1 cancelled order, and no order in any other state |
| expired | the 1 expired order, and no order in any other state |

## Coverage

| Path | Cases | Not applicable because |
|---|---|---|
| happy | S06_001, S06_003, S06_005, S06_007, S06_009, S06_013, S06_015, S06_017 | |
| sad | S06_010, S06_020 | |
| validation | S06_011 | |
| boundary | S06_002, S06_004, S06_008 | |
| permission | S06_012, S06_018 | |
| duplicate | S06_019 | |
| empty | S06_006, S06_014 | |
| concurrent | S06_016 | |

## Manual checks

None.

## Gaps

- AC6_01: the PRD does not say whether a pickup order carries any delivery address, so S06_004 asserts the absence of one.
- AC6_02: "paid today" is not stated to use Lagos time, so S06_008 fixes the day boundary at Lagos time.
- AC6_02: the PRD does not state the order of rows in the list, whether the list paginates, or how many orders it holds.
- AC6_03: whether fulfilment can be undone, and what the owner sees for an order that is not paid, is unstated.
- AC6_01: the PRD does not say whether the owner notification is a utility template or free-form when the window is open.
- AC6_01 with A2: S06_020 rests on the owner-side 24-hour window, which no acceptance criterion states; assumption A2 is the basis, and the approved template registry that the notice must come from is undecided (Q1). Owner: PM, with the messaging partner for the registry.
- AC6_02: what a non-owner who sends an owner command is told is unstated, so S06_012 and S06_018 assert only that no owner-facing data is shown. Owner: PM, with wording from the Copywriter.

## TL;DR

- Criteria: 3 (3 with rules) · Rules: 8 · Cases: 20, all automated · Manual checks: 0
- Gaps: pickup address (AC6_01), Lagos day boundary (AC6_02), list ordering and pagination (AC6_02), reversal of fulfilment and unpaid fulfilment (AC6_03), notification template choice (AC6_01), owner-side 24-hour window and template registry (AC6_01 with A2), non-owner reply shape (AC6_02)
