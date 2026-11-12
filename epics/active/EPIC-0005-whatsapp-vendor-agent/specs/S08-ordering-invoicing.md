# S08 — Ordering and invoicing

Epic: EPIC-0005 · Stories: 8 · Owner role: Spec Writer

## Criteria

| AC | Criterion (quoted from PRD) | Rules |
|---|---|---|
| AC8_01 | “The agent builds a cart from the conversation and confirms the cart summary, quantity, delivery zone or pickup, delivery address, and buyer name before it issues an invoice.” | R8_01, R8_02 |
| AC8_02 | “The invoice shows the following: Itemised lines. Delivery fee. Total in naira. Payment account number, bank name, and account name, or the payment link. Exact amount to pay. Expiry time. Order number.” | R8_03, R8_04, R8_05, R8_06 |
| AC8_03 | “When the invoice is issued, the ordered quantities are reserved and removed from available stock. If the invoice expires unpaid, the reservation is released. The default expiry is 60 minutes and the vendor can configure it.” | R8_07, R8_08 |
| AC8_04 | “The agent cannot issue an invoice for more units than are available. Two buyers competing for the last unit never both receive valid invoices.” | R8_09, R8_10 |
| AC8_05 | “The buyer can cancel before paying. Cancellation releases the reservation.” | R8_11 |

## Rules

| ID | Rule | AC | Cases |
|---|---|---|---|
| R8_01 | The agent builds a cart from the conversation and holds only listed items in it. | AC8_01 | S08_001, S08_002, S08_025 |
| R8_02 | Before issuing an invoice the agent confirms the cart summary, quantity, delivery zone or pickup, delivery address and buyer name with the buyer. | AC8_01 | S08_003, S08_004, S08_005, S08_026 |
| R8_03 | The invoice itemises each line with the item, its quantity and its unit price. | AC8_02 | S08_006, S08_007 |
| R8_04 | The invoice shows the delivery fee, the total in naira and the exact amount to pay. | AC8_02 | S08_008, S08_027 |
| R8_05 | The invoice shows the payment account number, bank name and account name, or the hosted payment link. | AC8_02 | S08_009, S08_010 |
| R8_06 | The invoice shows its expiry time and the order number. | AC8_02, AC8_03 | S08_011, S08_012 |
| R8_07 | Issuing an invoice reserves its quantities and removes them from available stock once. | AC8_03 | S08_013, S08_014 |
| R8_08 | An invoice that expires unpaid releases its reservation once. | AC8_03 | S08_015, S08_016, S08_017 |
| R8_09 | The agent issues no invoice for more units than are available. | AC8_04 | S08_018, S08_019 |
| R8_10 | Two buyers competing for the last unit never both receive a valid invoice. | AC8_04 | S08_020, S08_021 |
| R8_11 | A buyer cancels before paying and the reservation is released for that buyer's order only. | AC8_05 | S08_022, S08_023, S08_024 |

## Cases

| ID | Path | Title | Setup | Action | Expected |
|---|---|---|---|---|---|
| S08_001 | happy | Cart built from the conversation | Ankara gown – L is listed at ₦18,500 with quantity 5 and the chat has no cart yet | The buyer sends "I want 2 Ankara gown L" | The cart holds 2 × Ankara gown – L at ₦37,000; the agent offers the delivery step |
| S08_002 | sad | Unlisted item kept out of the cart | Ankara gown – L is listed at ₦18,500 with quantity 5 and no Kaftan is listed | The buyer sends "2 Ankara gown L and 1 Kaftan" | The cart holds only 2 × Ankara gown – L; the buyer is told Kaftan is not listed |
| S08_003 | happy | Summary confirmed before the invoice | The cart holds 2 × Ankara gown – L at ₦37,000 and Lagos Mainland is ₦3,000 | The buyer confirms the summary of 2 gowns, Lagos Mainland, 14 Adeola Odeku and Tunde Bello | The invoice is issued for order #1042 at ₦40,000; the summary on screen matches the confirmed cart |
| S08_004 | sad | Buyer withholds the delivery address | The cart holds 2 × Ankara gown – L and the buyer has chosen Lagos Mainland | The buyer refuses to give a delivery address | No invoice is issued; the cart is held with the quantity still available for the buyer |
| S08_005 | boundary | Pickup chosen instead of delivery | The cart holds 1 × Silk scarf at ₦4,500 and the vendor offers Pickup at ₦0 | The buyer chooses Pickup and gives the name Tunde Bello | The summary shows Pickup with a ₦0 delivery fee; the invoice total is ₦4,500 |
| S08_006 | happy | Invoice itemised | The cart holds 2 × Ankara gown – L at ₦18,500 and 1 × Silk scarf at ₦4,500 | The invoice for order #1042 is issued | The invoice shows 2 × Ankara gown – L at ₦18,500 and 1 × Silk scarf at ₦4,500 |
| S08_007 | boundary | Invoice with 25 lines | The cart holds 25 lines totalling ₦212,000 | The invoice for order #1051 is issued | All 25 lines appear with their quantities and unit prices; the total reads ₦212,000 |
| S08_008 | happy | Delivery fee, total and exact amount | The cart holds 2 × Ankara gown – L at ₦37,000 and Lagos Mainland is ₦3,000 | The invoice for order #1042 is issued | The invoice shows a ₦3,000 delivery fee; the total reads ₦40,000 and the exact amount to pay reads ₦40,000 |
| S08_009 | happy | Payment details on the invoice | The cart holds 2 × Ankara gown – L for order #1042 at ₦40,000 with Lagos Mainland delivery | The invoice for order #1042 is issued | The invoice shows the account number, bank name and account name for #1042; the amount matches ₦40,000 |
| S08_010 | sad | Hosted link instead of account details | Order #1042 totals ₦40,000 and the provider cannot create a virtual account | The invoice for order #1042 is issued | The invoice shows a hosted payment link for ₦40,000 in place of account details |
| S08_011 | happy | Expiry time and order number shown | Order #1042 totals ₦40,000 and the vendor's expiry is the default | The invoice for order #1042 is issued at 14:40 | The invoice shows order #1042; it shows an expiry of 15:40 |
| S08_012 | boundary | Configured expiry of 15 minutes | The vendor configured a 15-minute invoice expiry | The invoice for order #1042 is issued at 14:40 | The invoice shows an expiry of 14:55 |
| S08_013 | happy | Invoice reserves stock | Ankara gown – L is listed at ₦18,500 with quantity 5 | The invoice for 2 × Ankara gown – L is issued | 3 units of Ankara gown – L remain available; a buyer asking for 4 is told only 3 are available |
| S08_014 | duplicate | Same invoice generated twice | Ankara gown – L is listed with quantity 5 and the invoice for 2 units is being created | The invoice creation for order #1042 completes a second time | The available quantity is 3; one reservation exists for order #1042 |
| S08_015 | happy | Expired invoice releases the reservation | The invoice for order #1042 for 2 × Ankara gown – L is issued at 14:40 and unpaid, leaving 3 available | The clock reaches 15:41 | 5 units of Ankara gown – L are available; order #1042 is expired |
| S08_016 | boundary | Release at the configured expiry | The vendor configured a 15-minute expiry and order #1042 for 2 units was issued at 14:40 leaving 3 available | The clock reaches 14:55 | 5 units of Ankara gown – L are available; order #1042 is expired |
| S08_017 | duplicate | Expiry event fires twice | The invoice for order #1042 for 2 × Ankara gown – L expired at 15:40 leaving 5 available | The expiry event for #1042 is processed a second time | The available quantity stays 5; order #1042 stays expired |
| S08_018 | boundary | Request above the available quantity | Ankara gown – L is listed at ₦18,500 with quantity 5 | The buyer asks for 6 Ankara gown – L | No invoice is issued; the buyer is told 5 are available |
| S08_019 | happy | Request equal to the available quantity | Ankara gown – L is listed at ₦18,500 with quantity 5 | The buyer orders 5 Ankara gown – L and confirms the summary | An invoice for 5 units is issued; 0 units of Ankara gown – L remain available |
| S08_020 | concurrent | Two buyers confirm the last unit | Ankara gown – L is listed with quantity 1 and buyers +2348030000002 and +2348030000003 both have it in a cart | Both buyers confirm their summary at 10:00:00 | One invoice is issued for the last unit; the other buyer is told it is no longer available |
| S08_021 | duplicate | Buyer confirms the same cart twice | Buyer +2348030000002 has a cart of 1 × Ankara gown – L with the only unit available | The buyer sends "yes" twice | One invoice is issued for +2348030000002; 0 units remain available |
| S08_022 | happy | Buyer cancels before paying | Order #1042 for 2 × Ankara gown – L is awaiting payment and 3 units are available | The buyer sends "cancel my order" | Order #1042 is cancelled; 5 units of Ankara gown – L are available |
| S08_023 | permission | Another number cancels the order | Order #1042 belongs to buyer +2348030000002 and is awaiting payment | +2348030000005 sends "cancel #1042" | Order #1042 stays awaiting payment; the reservation stays held |
| S08_024 | duplicate | Buyer cancels twice | Order #1042 for 2 × Ankara gown – L was just cancelled with 5 units available | The buyer sends "cancel my order" again | The cancellation stands once; the available quantity stays 5 |
| S08_025 | empty | Confirmation with an empty cart | The chat has no items in a cart | The buyer sends "that's all, let's do it" | No invoice is issued; the agent asks which item the buyer wants |
| S08_026 | validation | Delivery zone that is not offered | The vendor offers Lagos Mainland at ₦3,000 and Lekki/Ajah at ₦4,500 and no Ikeja zone | The buyer says "deliver to Ikeja, ₦2,000" | The agent lists Lagos Mainland at ₦3,000 and Lekki/Ajah at ₦4,500; no invoice is issued at ₦2,000 |
| S08_027 | sad | Invoice arithmetic disagrees with the fee record | The cart holds 2 × Ankara gown – L at ₦37,000 with Lagos Mainland at ₦3,000 and the drafted invoice shows a ₦0 delivery fee | The invoice for order #1042 is generated from the draft | The ₦0-fee invoice is not sent; the issued invoice shows ₦3,000 and ₦40,000 |

## Coverage

| Path | Cases | Not applicable because |
|---|---|---|
| happy | S08_001, S08_003, S08_006, S08_008, S08_009, S08_011, S08_013, S08_015, S08_019, S08_022 | |
| sad | S08_002, S08_004, S08_010, S08_027 | |
| validation | S08_026 | |
| boundary | S08_005, S08_007, S08_012, S08_016, S08_018 | |
| permission | S08_023 | |
| duplicate | S08_014, S08_017, S08_021, S08_024 | |
| empty | S08_025 | |
| concurrent | S08_020 | |

## Manual checks

None.

## Gaps

- AC8_01: whether the cart survives a drop-off of more than a few minutes, and whether two open carts in one chat are possible, is unstated.
- AC8_01: whether the buyer name is mandatory or may be taken from the WhatsApp profile is unstated.
- AC8_01: the PRD does not say whether the buyer may edit the address after the invoice is issued.
- AC8_03: the allowed range for the vendor's configurable expiry is unstated, and whether the reservation release is a scheduled job is unstated.
- AC8_03: whether a re-issue after expiry keeps the original price or reads the current price is unstated.
- AC8_05: whether a paid order can be cancelled, and whether a partially fulfilled order can be changed, is unstated.

## TL;DR

- Criteria: 5 (5 with rules) · Rules: 11 · Cases: 27, all automated · Manual checks: 0
- Gaps: cart persistence (AC8_01), buyer name source (AC8_01), address edit after invoicing (AC8_01), expiry range and release scheduling (AC8_03), re-issue price (AC8_03), cancellation after payment (AC8_05)
