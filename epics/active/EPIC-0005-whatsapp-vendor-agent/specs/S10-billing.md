# S10 — Billing and cost tracking

Epic: EPIC-0005 · Stories: 10 · Owner role: Spec Writer

## Criteria

| AC | Criterion (quoted from PRD) | Rules |
|---|---|---|
| AC10_01 | “Each vendor gets a free trial (length per open question), after which the monthly subscription (assumed ₦5,000) is charged. The per-order fee is applied only to orders confirmed paid, whether by webhook or by manual override.” | R10_01, R10_02, R10_03 |
| AC10_02 | “The per-order fee is collected through provider split settlement where possible. Otherwise it is added to a monthly bill.” | R10_04 |
| AC10_03 | “For each vendor, the platform records per month: WhatsApp messages and conversations by category, template sends, provider fees, and order counts.” | R10_05 |
| AC10_04 | “If the subscription is unpaid after a 7-day grace period, the agent stops taking new orders for that vendor. It hands customer chats back to the owner with a notice, and paid orders already in progress are unaffected.” | R10_06, R10_07, R10_08 |

## Rules

| ID | Rule | AC | Cases |
|---|---|---|---|
| R10_01 | The per-order fee is raised only for orders confirmed paid, whether by verified webhook or by owner override. | AC10_01 | S10_001, S10_002 |
| R10_02 | A vendor inside the free trial is charged no monthly subscription. | AC10_01 | S10_003, S10_004 |
| R10_03 | After the free trial ends the vendor is charged the monthly subscription of ₦5,000. | AC10_01 | S10_005, S10_006 |
| R10_04 | The per-order fee is taken from settlement by provider split where the provider supports it, and is added to the monthly bill where it does not. | AC10_02 | S10_007, S10_008 |
| R10_05 | Each vendor's monthly record holds WhatsApp messages and conversations by category, template sends, provider fees and order counts. | AC10_03 | S10_009, S10_010, S10_017, S10_M1 |
| R10_06 | After 7 days of an unpaid subscription the agent stops taking new orders for that vendor. | AC10_04 | S10_011, S10_012 |
| R10_07 | When the agent stops, customer chats are handed back to the owner with a notice. | AC10_04 | S10_013, S10_014 |
| R10_08 | Paid orders already in progress when the agent stops are unaffected. | AC10_04 | S10_015, S10_016 |

## Cases

| ID | Path | Title | Setup | Action | Expected |
|---|---|---|---|---|---|
| S10_001 | happy | Fee scoped to paid orders | The vendor is billed under the ₦100 per-order fee and has one order in the state <input> | The monthly bill for the vendor is calculated | The bill carries the per-order fee for the state <input> as shown in the examples; no other state adds a fee |
| S10_002 | duplicate | Replayed webhook raises no second fee | Order #1042 is paid and its ₦100 per-order fee is already on the month's bill | The verified webhook for #1042 is delivered again | The month's per-order fee total stays the same; no second ₦100 line exists for #1042 |
| S10_003 | happy | No subscription charge during the trial | Vendor started a 14-day trial on 1 November and is in day 3 of it | The monthly bill is calculated | The bill holds no subscription charge; it holds the paid-order fees for the month |
| S10_004 | boundary | Final trial day | Vendor's 14-day trial ends on 14 November and the vendor is inside day 14 | The subscription charge for November is calculated | No subscription charge is raised for the trial days; a ₦5,000 subscription is raised from 15 November |
| S10_005 | happy | Subscription charged after the trial | Vendor's trial ended and the vendor is now a paying vendor with a verified payout account | The monthly subscription is charged | A ₦5,000 subscription charge is recorded for the vendor |
| S10_006 | sad | Subscription charge fails | Vendor's ₦5,000 monthly charge is due and the provider declines the charge | The subscription charge is attempted | The vendor's subscription reads unpaid; the 7-day grace period starts |
| S10_007 | happy | Per-order fee taken by split settlement | The provider supports split settlement and order #1042 is paid at ₦40,000 | Settlement for #1042 is processed | ₦100 of the settlement is taken as the per-order fee; the vendor's bank receives the balance after the provider fee |
| S10_008 | sad | Split unavailable, fee billed monthly | The provider's split settlement is unavailable and order #1042 is paid at ₦40,000 | Settlement for #1042 is processed | The vendor's bank receives the settlement without the ₦100; ₦100 appears on the vendor's monthly bill |
| S10_009 | happy | Monthly record holds every count | Vendor Ada Styles is active with WhatsApp traffic, 12 template sends, provider fees of ₦2,340 and 87 paid orders in November | The November record is opened | The record shows messages and conversations by category, 12 template sends, ₦2,340 provider fees and 87 paid orders |
| S10_010 | empty | Vendor with no activity in the month | Vendor Ada Styles took no orders and sent no messages in November | The November record is opened | Every count reads 0 and every naira amount reads ₦0; the record opens without an error |
| S10_011 | boundary | Grace period edge | The vendor's ₦5,000 subscription was due on 1 November and is unpaid | The clock reaches 8 November | The agent still takes new orders; the subscription reads unpaid with 0 days of grace left |
| S10_012 | happy | Agent stops taking new orders | The vendor's subscription is unpaid 8 days after the due date | A buyer asks to order 1 Ankara gown – L | No new order is taken; the buyer is told the owner will handle the order |
| S10_013 | happy | Chats handed back with a notice | The vendor's subscription is unpaid 8 days after the due date and a buyer has an open chat | The buyer sends "do you have Ankara gown XL?" | The owner receives a handover notice for that chat; the buyer is told the owner will reply |
| S10_014 | duplicate | Handover notice sent once | The vendor's subscription is unpaid and the handover notice was sent for the chat with +2348030000002 | The buyer sends three more messages in that chat | No further handover notice is sent for that chat; the chat stays with the owner |
| S10_015 | happy | Paid order in progress completes | Order #1042 was invoiced at ₦40,000 before the subscription suspension and the vendor is now suspended | The verified webhook confirms ₦40,000 for order #1042 | Order #1042 is marked paid; the buyer and the owner are both notified |
| S10_016 | concurrent | Webhook and suspension at the same instant | Order #1042 is awaiting payment at ₦40,000 at 10:00:00 and the subscription suspension is applied at 10:00:00 | The verified webhook for #1042 arrives at 10:00:00 | Order #1042 completes as paid; stock is decremented once |
| S10_017 | permission | Vendor asks for another vendor's bill | Vendors Ada Styles and Bola Stores both exist and Bola Stores is signed in | Bola Stores requests Ada Styles' November record | No data from Ada Styles' record is shown; the request is refused |

## Examples

### S10_001

| input | expected |
|---|---|
| paid by verified webhook | one ₦100 per-order fee for that order |
| paid by owner override | one ₦100 per-order fee for that order |
| awaiting payment | no per-order fee for that order |
| cancelled by the buyer before payment | no per-order fee for that order |
| expired unpaid | no per-order fee for that order |
| needs owner review | no per-order fee for that order |

## Coverage

| Path | Cases | Not applicable because |
|---|---|---|
| happy | S10_001, S10_003, S10_005, S10_007, S10_009, S10_012, S10_013, S10_015 | |
| sad | S10_006, S10_008 | |
| validation | | billing inputs come from provider amounts and order states, so no user-supplied billing input can be malformed in v1 |
| boundary | S10_004, S10_011 | |
| permission | S10_017 | |
| duplicate | S10_002, S10_014 | |
| empty | S10_010 | |
| concurrent | S10_016 | |

## Manual checks

| ID | Rule | How it is run | Required result |
|---|---|---|---|
| S10_M1 | R10_05 | For one pilot vendor, compare the November record against the provider's settlement statement and the WhatsApp category report | Message and conversation counts by category, template sends, provider fees and paid-order counts match the two source statements |

## Gaps

- AC10_01: Q3 (blocking) — the trial length, the per-order fee amount or percentage, and whether provider fees are passed to the vendor or the buyer are unconfirmed, so every case uses the assumptions of ₦5,000 per month and ₦100 per paid order.
- AC10_01: whether the subscription is charged in advance or in arrears, and on which day of the month, is unstated.
- AC10_01: what happens to a vendor's data, chats and inventory if the subscription stays unpaid indefinitely is unstated.
- AC10_04: whether a suspended vendor's agent still answers price and stock questions, as opposed to taking new orders, is unstated.
- AC10_02: Q2 (blocking) — whether the chosen provider supports split settlement, and how the split is configured, is undecided.
- AC10_03: the record period is monthly but the billing time zone and month boundary are unstated.
- AC10_04: Q5 (non-blocking) — launch positioning is not a behavioural requirement and no criterion in this epic depends on it.

## TL;DR

- Criteria: 4 (4 with rules) · Rules: 8 · Cases: 17, all automated · Manual checks: 1
- Gaps: Q3 pricing and trial length (AC10_01), charge timing (AC10_01), abandoned vendors (AC10_01), suspended-agent scope (AC10_04), Q2 split support (AC10_02), billing month boundary (AC10_03), Q5 positioning (AC10_04)
