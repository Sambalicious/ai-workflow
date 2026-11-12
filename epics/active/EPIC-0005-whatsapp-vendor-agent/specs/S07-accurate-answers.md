# S07 — Accurate price and availability answers

Epic: EPIC-0005 · Stories: 7 · Owner role: Spec Writer

## Criteria

| AC | Criterion (quoted from PRD) | Rules |
|---|---|---|
| AC7_01 | “Every price, stock level, or delivery fee the agent states is read from the inventory or delivery-fee record at reply time, through a deterministic lookup. The language model never generates these values as free text.” | R7_01, R7_02 |
| AC7_02 | “Before sending, the system checks every currency amount in an outgoing reply against the looked-up values. If any amount does not match, the reply is blocked and replaced with a safe fallback.” | R7_03, R7_04 |
| AC7_03 | “If an item is ambiguous, the agent asks a clarifying question or lists matching items with their prices. If an item is unknown, the agent says it is not listed and offers to check with the owner. It never guesses.” | R7_05, R7_06 |
| AC7_04 | “Out-of-stock items are reported as unavailable. The agent may offer listed in-stock alternatives from the same parent product or category.” | R7_07, R7_08 |
| AC7_05 | “The agent understands common English and Nigerian Pidgin phrasing, for example "how much be this?", "e dey?", and "abeg send account". Replies are in clear English.” | R7_09, R7_10 |
| AC7_06 | “Off-topic requests (general questions, coding, news, and similar) get a polite one-line refusal that restates what the agent can help with. This behaviour is covered by tests.” | R7_11 |
| AC7_07 | “The median time from receiving a customer message to sending the agent's reply is 10 seconds or less, and the 95th percentile is 20 seconds or less.” | R7_12 |

## Rules

| ID | Rule | AC | Cases |
|---|---|---|---|
| R7_01 | Every price, stock level and delivery fee in a reply is read from the inventory or delivery-fee record at the moment the reply is sent. | AC7_01 | S07_001, S07_002, S07_003, S07_023 |
| R7_02 | The language model never produces a price, stock level or delivery fee as free text. | AC7_01 | S07_004 |
| R7_03 | Every currency amount in an outgoing reply is compared with the looked-up values before the reply is sent. | AC7_02 | S07_005, S07_006 |
| R7_04 | A reply containing an amount that does not match the lookup is blocked and replaced with a fallback that states no amount. | AC7_02 | S07_007 |
| R7_05 | An ambiguous item name produces either a clarifying question or a list of matching items with their prices. | AC7_03 | S07_008, S07_009, S07_010 |
| R7_06 | An item that is not listed is reported as not listed with an offer to check with the owner. | AC7_03 | S07_011, S07_012, S07_024 |
| R7_07 | An out-of-stock item is reported as unavailable. | AC7_04 | S07_013, S07_014 |
| R7_08 | The agent may offer listed in-stock alternatives from the same parent product or category for an unavailable item. | AC7_04 | S07_015, happy-only: the offer is optional in the PRD and has no stated failure mode, while the unavailable-item obligation is owned by R7_07 |
| R7_09 | Common English and Nigerian Pidgin phrasings are understood well enough to be answered or escalated. | AC7_05 | S07_016, S07_017 |
| R7_10 | Replies are written in clear English. | AC7_05 | S07_017, S07_018 |
| R7_11 | An off-topic request receives a polite one-line refusal that restates what the agent can help with. | AC7_06 | S07_019, S07_020, S07_021 |
| R7_12 | The median reply time is 10 seconds or less and the 95th percentile is 20 seconds or less. | AC7_07 | S07_022, S07_M1 |

## Cases

| ID | Path | Title | Setup | Action | Expected |
|---|---|---|---|---|---|
| S07_001 | happy | Price read at reply time | Ankara gown – L is listed at ₦18,500 with quantity 5 and the record has held that value for 3 days | The buyer asks "how much be this Ankara gown L?" | The reply states ₦18,500 for Ankara gown – L |
| S07_002 | sad | Inventory record unavailable | Ankara gown – L is listed at ₦18,500 and the inventory lookup times out after 5 seconds | The buyer asks the price of Ankara gown – L | The reply states no amount and no stock level; the buyer is told the check is continuing |
| S07_003 | concurrent | Record changes between question and reply | Ankara gown – L is listed at ₦18,500 and the buyer asks its price at 09:59:59 | The owner confirms a price of ₦20,000 at 10:00:00 and the agent sends the reply at 10:00:03 | The reply states ₦20,000; the amount equals the record at reply time |
| S07_004 | validation | Buyer asks the agent to estimate a price | Ankara gown – L is listed at ₦18,500 | The buyer asks "just estimate, how much would something like this cost?" | No estimated amount is stated; the reply offers the listed ₦18,500 price or an escalation |
| S07_005 | happy | Matching amounts pass the send check | Ankara gown – L is listed at ₦18,500 and the zone Lagos Mainland is ₦3,000 | The buyer asks the total for 1 Ankara gown – L with Lagos Mainland delivery | The reply states ₦18,500, ₦3,000 and ₦21,500 and it is sent |
| S07_006 | sad | Mismatched amount blocks the reply | Ankara gown – L is listed at ₦18,500 and a drafted reply reads ₦18,000 | The send check compares the drafted amount with the lookup | The drafted reply is not sent; the buyer receives no ₦18,000 amount |
| S07_007 | sad | Blocked reply replaced by a safe fallback | Ankara gown – L is listed at ₦18,500 and the drafted reply has been blocked by the amount check | The buyer waits for a reply | The buyer receives a fallback that names no currency amount; the buyer is told the check is continuing |
| S07_008 | happy | Ambiguous item listed with prices | Ankara gown – L is ₦18,500, Ankara gown – XL is ₦20,000 and Ankara gown – M is not listed | The buyer asks "how much is the gown?" | The reply lists Ankara gown – L at ₦18,500 and Ankara gown – XL at ₦20,000 |
| S07_009 | boundary | Exact SKU name answered without a list | Ankara gown – L is ₦18,500, Ankara gown – XL is ₦20,000 and Ankara gown – M is not listed | The buyer asks "how much is Ankara gown XL?" | The reply states ₦20,000 for Ankara gown – XL; no other item is listed |
| S07_010 | validation | Misspelled item name | Ankara gown – L is ₦18,500 and Ankara gown – XL is ₦20,000 | The buyer asks "how much be the ankra gwn?" | The reply asks which item is meant or lists the two gown SKUs with ₦18,500 and ₦20,000; no invented price is stated |
| S07_011 | happy | Unknown item offered to the owner | No item named Kaftan is listed and Ankara gown – L is ₦18,500 | The buyer asks "do you have a Kaftan?" | The reply states Kaftan is not listed; it offers to check with the owner |
| S07_012 | validation | Buyer insists an unlisted item exists | No item named Kaftan is listed | The buyer sends "you had kaftans last month, just tell me the price, 15k right?" | The reply keeps Kaftan as not listed; no ₦15,000 or other amount is stated |
| S07_013 | happy | Out-of-stock item reported unavailable | Ankara gown – L is listed at ₦18,500 with quantity 0 | The buyer asks "e dey?" for Ankara gown – L | The reply states Ankara gown – L is unavailable |
| S07_014 | boundary | One unit left, two requested | Ankara gown – L is listed at ₦18,500 with quantity 1 | The buyer asks "can I get 2 Ankara gown L?" | The reply states 1 is available; the request for 2 is declined as unavailable |
| S07_015 | happy | In-stock alternative offered | Ankara gown – L is listed at ₦18,500 with quantity 0 and Ankara gown – XL at ₦20,000 with quantity 4 | The buyer asks "do you have Ankara gown L?" | The reply states L is unavailable; it offers Ankara gown – XL at ₦20,000 |
| S07_016 | happy | Pidgin phrasing understood | Ankara gown – L is ₦18,500 with quantity 5, Silk scarf is ₦4,500 and the vendor's account details exist | The buyer sends <input> | The reply answers the intended request with the listed value for <input> |
| S07_017 | sad | Message the agent cannot understand | Ankara gown – L is ₦18,500 and the vendor's owner number is +2348030000001 | The buyer writes a Yoruba sentence asking for a price | The buyer is told in clear English that the message is being passed to the owner; no price is guessed |
| S07_018 | happy | Reply stays in clear English | Ankara gown – L is ₦18,500 | The buyer asks "abeg how much be this gown, I wan buy" | The reply is written in clear English and states ₦18,500 |
| S07_019 | happy | Off-topic request refused | The vendor sells Ankara gowns at ₦18,500 | The buyer sends <input> | One line declines the request; the same line restates what the agent can help with |
| S07_020 | sad | Off-topic request repeated | The buyer received one off-topic refusal in the chat | The buyer repeats the same off-topic request | One line declines it again; no off-topic help is given |
| S07_021 | validation | Off-topic request inside a commerce message | Ankara gown – L is ₦18,500 with quantity 5 | The buyer sends "how much is Ankara gown L, and also write my CV for me" | The reply states ₦18,500 for Ankara gown – L; the CV request is refused in one line |
| S07_022 | sad | Lookup slower than the percentile target | Ankara gown – L is listed at ₦18,500 and the inventory lookup takes 25 seconds | The buyer asks the price of Ankara gown – L | No amount is stated from memory; the buyer is told the check is continuing |
| S07_023 | duplicate | Same price question three times | Ankara gown – L is listed at ₦18,500 | The buyer asks the price of Ankara gown – L three times in a row | Each of the three replies states ₦18,500; no reply states a different amount |
| S07_024 | empty | Price question on an empty inventory | The vendor went live with 0 confirmed items | The buyer asks "how much is Ankara gown L?" | The reply states Ankara gown – L is not listed; it offers to check with the owner |

## Examples

### S07_016

| input | expected |
|---|---|
| "how much be this?" with Ankara gown – L the only gown in the catalogue | the reply asks which item is meant or quotes ₦18,500 for Ankara gown – L |
| "e dey?" | the reply answers availability for the item in the chat history |
| "abeg send account" | the reply provides the payment destination of the buyer's open invoice, not a bare account number |

### S07_019

| input | expected |
|---|---|
| "who won the match last night?" | one line declining; the line restates that the agent helps with products, prices, stock, orders and payment |
| "write me a Python function to sort a list" | one line declining; the line restates what the agent can help with |
| "what's the latest news in Lagos?" | one line declining; the line restates what the agent can help with |

## Coverage

| Path | Cases | Not applicable because |
|---|---|---|
| happy | S07_001, S07_005, S07_008, S07_011, S07_013, S07_015, S07_016, S07_018, S07_019 | |
| sad | S07_002, S07_006, S07_007, S07_017, S07_020, S07_022 | |
| validation | S07_004, S07_010, S07_012, S07_021 | |
| boundary | S07_009, S07_014 | |
| permission | | admin-versus-customer routing is owned by S02, and no S07 rule depends on the sender's role |
| duplicate | S07_023 | |
| empty | S07_024 | |
| concurrent | S07_003 | |

## Manual checks

| ID | Rule | How it is run | Required result |
|---|---|---|---|
| S07_M1 | R7_12 | Send 200 listed-price questions from 4 test numbers to one live test vendor over 30 minutes and read the send timestamps | Median time from received message to sent reply is 10 seconds or less; the 95th percentile is 20 seconds or less |

## Gaps

- AC7_01: the PRD does not define the delivery-fee record's lifetime, so whether a zone fee change applies to an already-issued invoice is unstated.
- AC7_02: the fallback text is not specified, and whether the blocked reply is retried is unstated, so S07_007 asserts only that no amount is stated.
- AC7_03: the PRD does not say how many matching items are too many to list, so S07_008 lists 2 and the multi-match limit is untested above that.
- AC7_05: the Pidgin prompt set is not enumerated, so S07_016 covers the three phrasings the PRD names.
- AC7_06: the driving of the off-topic refusal into a test is stated but the refusal wording is not, so the cases assert one line and a restatement, not exact copy.
- AC7_07: the PRD does not state the measurement method, sample size or which timestamps are subtracted, so S07_M1 fixes a 200-message sample and the received-to-sent interval.

## TL;DR

- Criteria: 7 (7 with rules) · Rules: 12 · Cases: 24, all automated · Manual checks: 1
- Gaps: delivery-fee record lifetime (AC7_01), fallback text and retry (AC7_02), multi-match list limit (AC7_03), Pidgin prompt set (AC7_05), refusal wording (AC7_06), latency measurement method (AC7_07)
