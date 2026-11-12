# S02 — Inventory management over WhatsApp

Epic: EPIC-0005 · Stories: 2 · Owner role: Spec Writer

## Criteria

| AC | Criterion (quoted from PRD) | Rules |
|---|---|---|
| AC2_01 | “Only messages from owner numbers registered during onboarding are treated as admin commands. Messages from any other number are treated as customer messages.” | R2_01, R2_02 |
| AC2_02 | “The owner can add an item, set its price, set its quantity, adjust quantity (for example "+10" or "-2"), mark it out of stock, rename it, and remove it, using natural phrasing or short commands.” | R2_03, R2_04, R2_05, R2_06, R2_07, R2_08, R2_09 |
| AC2_03 | “The agent repeats the interpreted change back for confirmation before applying any price change or item removal, and before any quantity change that affects more than one item.” | R2_10, R2_11, R2_12 |
| AC2_04 | “A change is visible to customer-facing answers within 10 seconds of the owner confirming it.” | R2_13 |
| AC2_05 | “The owner can ask "stock list" or "how many [item]?" and gets the current values. These values come from the same inventory record that customer answers use.” | R2_14, R2_15 |
| AC2_06 | “v1 represents variants (size or colour) as separate SKUs that share a parent product name, so that "Ankara gown – L" and "Ankara gown – XL" have independent price and stock.” | R2_16 |
| AC2_07 | “Every inventory change is recorded with timestamp, source (owner WhatsApp, CSV, or order decrement), previous value, and new value.” | R2_17 |

## Rules

| ID | Rule | AC | Cases |
|---|---|---|---|
| R2_01 | A message from a number registered as an owner admin number is executed as an inventory admin command. | AC2_01 | S02_001, S02_002 |
| R2_02 | A message from any number that is not a registered owner admin number is handled as a customer message and changes no inventory. | AC2_01 | S02_003, S02_004 |
| R2_03 | The owner adds an item with a name, a naira price and a quantity. | AC2_02 | S02_005, S02_006 |
| R2_04 | The owner sets the price of one named item to a naira amount. | AC2_02 | S02_007, S02_008 |
| R2_05 | The owner sets the quantity of one named item to an absolute number. | AC2_02 | S02_009, S02_010 |
| R2_06 | The owner adjusts the quantity of one named item by a relative delta such as "+10" or "-2". | AC2_02 | S02_011, S02_012 |
| R2_07 | The owner marks a named item out of stock, after which buyers are told it is unavailable. | AC2_02 | S02_013, S02_014 |
| R2_08 | The owner renames a listed item without changing its price or quantity. | AC2_02 | S02_015, S02_016 |
| R2_09 | The owner removes a listed item, after which it is no longer listed to buyers. | AC2_02 | S02_017, S02_018 |
| R2_10 | Before applying a price change the agent repeats the interpreted change and waits for the owner's confirmation. | AC2_03 | S02_019, S02_020, S02_021 |
| R2_11 | Before applying an item removal the agent repeats the interpreted change and waits for the owner's confirmation. | AC2_03 | S02_022, S02_023 |
| R2_12 | Before applying a quantity change that affects more than one item the agent repeats the interpreted change and waits for the owner's confirmation. | AC2_03 | S02_024, S02_025 |
| R2_13 | A confirmed inventory change is visible in buyer-facing answers within 10 seconds of the confirmation. | AC2_04 | S02_026, S02_027 |
| R2_14 | The owner receives the current name, price and quantity of every listed item when asking for the stock list. | AC2_05 | S02_028, S02_029 |
| R2_15 | The owner receives the current quantity of one named item, read from the same inventory record that buyer answers use. | AC2_05 | S02_030, S02_031 |
| R2_16 | Variants are separate SKUs under one shared parent product name with independent price and quantity. | AC2_06 | S02_032, S02_033 |
| R2_17 | Every applied inventory change records its timestamp, source, previous value and new value. | AC2_07 | S02_034, S02_035, S02_M1 |

## Cases

| ID | Path | Title | Setup | Action | Expected |
|---|---|---|---|---|---|
| S02_001 | happy | Owner number executes an admin command | +2348030000001 is a registered owner admin number and Ankara gown – L is listed at ₦18,500 | The owner sends "change Ankara gown – L to 20000" | The message is interpreted as an admin price change; no buyer-style answer is produced |
| S02_002 | duplicate | Same admin message delivered twice | WhatsApp delivers the owner message "change Ankara gown – L to 20000" twice with one message identifier and the owner confirms once | The duplicate delivery is processed after the confirmation | The price is ₦20,000; one inventory-change record exists for it |
| S02_003 | permission | Buyer sends an admin command | +2348030000002 is not registered and Ankara gown – L is listed at ₦18,500 with quantity 5 | +2348030000002 sends "remove Ankara gown – L" | Ankara gown – L stays listed at ₦18,500 with quantity 5; the reply confirms no inventory change |
| S02_004 | permission | Buyer asks for the stock list | +2348030000002 is not registered and 12 items are listed | +2348030000002 sends "stock list" | No price-and-quantity table for the whole inventory is sent; the reply lists no price or quantity for another item |
| S02_005 | happy | Item added with price and quantity | No item named Silk scarf exists | The owner sends "add Silk scarf, 4500, 10" | Silk scarf is listed at ₦4,500 with quantity 10 |
| S02_006 | validation | Add request without a price | No item named Silk scarf exists | The owner sends "add Silk scarf, 10" | The agent asks for a naira price; no item is created |
| S02_007 | happy | Price set on one item | Ankara gown – L is listed at ₦18,500 with quantity 5 | The owner confirms the repeated change from ₦18,500 to ₦20,000 for Ankara gown – L | Ankara gown – L is listed at ₦20,000; its quantity stays 5 |
| S02_008 | validation | Price given as a word | Ankara gown – L is listed at ₦18,500 with quantity 5 | The owner sends "change Ankara gown – L to cheap" | The agent asks for a naira amount; the listed price stays ₦18,500 |
| S02_009 | happy | Quantity set to an absolute value | Ankara gown – L is listed at ₦18,500 with quantity 5 | The owner sends "set Ankara gown – L quantity to 8" | The listed quantity of Ankara gown – L is 8 |
| S02_010 | boundary | Quantity set to zero | Ankara gown – L is listed at ₦18,500 with quantity 5 | The owner sends "set Ankara gown – L quantity to 0" | The listed quantity is 0; a buyer asking for Ankara gown – L is told it is unavailable |
| S02_011 | happy | Quantity moved by a delta | Ankara gown – L is listed at ₦18,500 with the quantity shown in <input> | The owner sends <input> for Ankara gown – L | The listed quantity matches the expected value; a buyer asking for it sees the same quantity effect |
| S02_012 | duplicate | Retried delta applied once | Ankara gown – L is listed at ₦18,500 with quantity 3 | WhatsApp delivers the owner message "+10 Ankara gown – L" twice with one message identifier | The listed quantity is 13; one inventory-change record exists for it |
| S02_013 | happy | Mark item out of stock | Ankara gown – L is listed at ₦18,500 with quantity 5 | The owner sends "mark Ankara gown – L out of stock" | A buyer asking for Ankara gown – L is told it is unavailable; the item stays in the owner's list |
| S02_014 | sad | Mark an unknown item out of stock | No item named Kaftan is listed | The owner sends "mark Kaftan out of stock" | The agent replies that Kaftan is not listed; no inventory change is recorded |
| S02_015 | happy | Rename a listed item | Ankara gown – L is listed at ₦18,500 with quantity 5 | The owner sends "rename Ankara gown – L to Ankara gown – Large" | The item is listed as Ankara gown – Large at ₦18,500 with quantity 5; a buyer asking for Ankara gown – L is told it is not listed |
| S02_016 | sad | Rename an unknown item | No item named Kaftan is listed | The owner sends "rename Kaftan to Kaftan gold" | The agent replies that Kaftan is not listed; no item is created |
| S02_017 | happy | Removed item leaves the buyer inventory | Ankara gown – L is listed at ₦18,500 with quantity 5 and its removal has been confirmed | The removal is applied after the owner's confirmation | Ankara gown – L is no longer listed; a buyer asking for it is told it is not listed |
| S02_018 | sad | Remove an unknown item | No item named Kaftan is listed | The owner sends "remove Kaftan" | The agent replies that Kaftan is not listed; no inventory change is recorded |
| S02_019 | happy | Price change repeated back before applying | Ankara gown – L is listed at ₦18,500 with quantity 5 | The owner sends "set Ankara gown – L price to 20000" | The agent repeats the change from ₦18,500 to ₦20,000 for Ankara gown – L and asks for confirmation; the price stays ₦18,500 until the owner confirms |
| S02_020 | sad | Price change never confirmed | Ankara gown – L is listed at ₦18,500 with quantity 5 and the repeated price change to ₦20,000 is on screen | The owner stops replying for 6 hours | The listed price stays ₦18,500; a buyer asking for Ankara gown – L is quoted ₦18,500 |
| S02_021 | duplicate | Confirmation sent twice | Ankara gown – L is listed at ₦18,500 with the repeated change to ₦20,000 on screen | The owner sends "yes" twice | The price becomes ₦20,000 once; one inventory-change record exists for the price |
| S02_022 | sad | Removal never confirmed | Ankara gown – L is listed at ₦18,500 with quantity 5 and its repeated removal is on screen | The owner replies "no" | Ankara gown – L stays listed at ₦18,500 with quantity 5 |
| S02_023 | duplicate | Removal confirmed twice | Ankara gown – L is listed at ₦18,500 and its repeated removal is on screen | The owner sends "yes" twice | Ankara gown – L is removed once; one inventory-change record exists for the removal |
| S02_024 | happy | Multi-item quantity change repeated back | Ankara gown – L has quantity 5 and Ankara gown – XL has quantity 4 | The owner sends "reduce all Ankara gown sizes by 2" | The agent repeats the change for both SKUs and asks for confirmation; both quantities stay unchanged until the owner confirms |
| S02_025 | boundary | Single-item quantity change applies without confirmation | Ankara gown – L is listed at ₦18,500 with quantity 5 and Ankara gown – XL at ₦20,000 with quantity 4 | The owner sends "-2 Ankara gown – XL" | The quantity of Ankara gown – XL is 3 immediately; no confirmation prompt is produced |
| S02_026 | happy | Confirmed change reaches buyer answers | Ankara gown – L is listed at ₦18,500 and the owner confirms ₦20,000 at 10:00:00 | A buyer asks the price of Ankara gown – L at 10:00:09 | The agent quotes ₦20,000 |
| S02_027 | concurrent | Buyer question overlaps the confirmation | Ankara gown – L is listed at ₦18,500 and a buyer asks its price at 09:59:59 | The owner confirms ₦20,000 at 10:00:00 and the agent sends the buyer reply at 10:00:02 | The reply quotes ₦20,000; the value matches the inventory record at reply time |
| S02_028 | happy | Stock list over WhatsApp | Ankara gown – L has quantity 5, Ankara gown – XL quantity 4 and Silk scarf quantity 10 | The owner sends "stock list" | The reply lists all three with their names, prices ₦18,500, ₦20,000 and ₦4,500 and quantities 5, 4 and 10 |
| S02_029 | empty | Stock list on an empty inventory | Vendor went live with 0 confirmed items | The owner sends "stock list" | The reply states the inventory has no items; no item rows are shown |
| S02_030 | happy | How many of one item | Ankara gown – L is listed at ₦18,500 with quantity 5 | The owner sends "how many Ankara gown – L?" | The reply states 5; a buyer asking for the same item at that moment is offered the same 5 |
| S02_031 | sad | How many of an unknown item | No item named Kaftan is listed | The owner sends "how many Kaftan?" | The reply states Kaftan is not listed; no quantity is reported |
| S02_032 | happy | Variants priced independently | Ankara gown – L is listed at ₦18,500 with quantity 3 and Ankara gown – XL at ₦20,000 with quantity 1 | A buyer asks "how much is Ankara gown XL" | The agent quotes ₦20,000 for Ankara gown – XL; Ankara gown – L stays at ₦18,500 |
| S02_033 | sad | Variant size that is not listed | Ankara gown – L is listed at ₦18,500 with quantity 3 and Ankara gown – XL at ₦20,000 with quantity 1 | A buyer asks "do you have Ankara gown in size M" | The agent states size M is not listed; the reply names Ankara gown – L at ₦18,500 and Ankara gown – XL at ₦20,000 |
| S02_034 | happy | Change record carries all four fields | An inventory change of <input> is applied to Ankara gown – L at 10:00:00 | A buyer asks the price of Ankara gown – L | No buyer-facing effect beyond the new value; the change record shows 10:00:00, <input>, the previous value and the new value |
| S02_035 | sad | Unconfirmed change leaves no record | A repeated price change to ₦20,000 for Ankara gown – L is on screen | The owner closes the chat without confirming | The inventory-change log holds no price record for Ankara gown – L; the listed price stays ₦18,500 |

## Examples

### S02_011

| input | expected |
|---|---|
| "+10 Ankara gown – L" | listed quantity 3 becomes 13 |
| "-2 Ankara gown – L" | listed quantity 5 becomes 3 |

### S02_034

| input | expected |
|---|---|
| owner WhatsApp price change to ₦20,000 | record with source owner WhatsApp, previous ₦18,500, new ₦20,000, timestamp 10:00:00 |
| CSV upload setting quantity to 8 | record with source CSV, previous 5, new 8, timestamp 10:00:00 |
| order decrement of 1 after payment | record with source order decrement, previous 5, new 4, timestamp 10:00:00 |

## Coverage

| Path | Cases | Not applicable because |
|---|---|---|
| happy | S02_001, S02_005, S02_007, S02_009, S02_011, S02_013, S02_015, S02_017, S02_019, S02_024, S02_026, S02_028, S02_030, S02_032, S02_034 | |
| sad | S02_014, S02_016, S02_018, S02_020, S02_022, S02_031, S02_033, S02_035 | |
| validation | S02_006, S02_008 | |
| boundary | S02_010, S02_025 | |
| permission | S02_003, S02_004 | |
| duplicate | S02_002, S02_012, S02_021, S02_023 | |
| empty | S02_029 | |
| concurrent | S02_027 | |

## Manual checks

| ID | Rule | How it is run | Required result |
|---|---|---|---|
| S02_M1 | R2_17 | For one vendor, apply 5 owner WhatsApp changes, 1 CSV upload of 3 rows and 2 order decrements, then read the inventory-change log | Every change shows a timestamp, its source as owner WhatsApp, CSV or order decrement, a previous value and a new value |

## Gaps

- AC2_02: the PRD does not state what happens when a delta would take a quantity below zero, so no case is written for "-5" against a quantity of 3.
- AC2_02: whether natural-language admin commands must be recognised in Pidgin as well as English is unstated.
- AC2_02: what quantity a "mark out of stock" command leaves behind (0 or an unchanged quantity with an unavailable flag) is unstated, so S02_013 asserts only the buyer-visible effect.
- AC2_03: whether a quantity change on exactly one item ever needs confirmation when the owner phrased it as a multi-item command is unstated.
- AC2_06: whether renaming a parent product name is possible, and whether parents can hold their own price and quantity, is unstated.
- AC2_07: the PRD does not say how long inventory-change records are kept or who may read them.
- AC2_07 with AC8_03 and AC9_02: S02_034 includes an "order decrement of 1 after payment", while AC8_03 removes the ordered units from available stock when the invoice is issued and AC9_02 says the remaining quantity is already decremented. Whether payment writes one order-decrement record against the reservation is the same question recorded in S05 Gaps. Owner: PM with the Architect.
- AC2_01: what a non-owner who sends an admin command is told is unstated, so S02_003 and S02_004 assert that no inventory effect and no inventory data follow, not the reply's shape. Owner: PM, with wording from the Copywriter.

## TL;DR

- Criteria: 7 (7 with rules) · Rules: 17 · Cases: 35, all automated · Manual checks: 1
- Gaps: below-zero quantity (AC2_02), Pidgin admin phrasing (AC2_02), out-of-stock quantity semantics (AC2_02), single-item multi-phrased confirmation (AC2_03), parent product behaviour (AC2_06), change-record retention (AC2_07), order-decrement record versus the reservation model (AC2_07 with AC8_03 and AC9_02), reply shape for a non-owner admin command (AC2_01)
