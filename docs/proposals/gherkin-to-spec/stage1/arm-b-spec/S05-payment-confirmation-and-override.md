# S05 — Automatic payment confirmation and manual override

Epic: EPIC-0005 · Stories: 5 · Owner role: Spec Writer

## Criteria

| AC | Criterion (quoted from PRD) | Rules |
|---|---|---|
| AC5_01 | "Every invoice gets a payment destination tied to that order. The default is a dynamic virtual account with the exact order amount and an expiry. A hosted payment link is the fallback." | R5_01, R5_02 |
| AC5_02 | "An order is marked paid only when a verified provider webhook arrives. Verification requires both of the following: The signature is validated. A server-side transaction lookup confirms the amount and the reference." | R5_03 |
| AC5_03 | "Customer messages, screenshots, or receipts never change payment status on their own. If a buyer sends proof of payment and no confirmed webhook exists, the agent replies that it is waiting for bank confirmation and notifies the owner." | R5_04 |
| AC5_04 | "Webhook processing is idempotent. A duplicate or replayed webhook never double-confirms an order or double-decrements stock." | R5_05 |
| AC5_05 | "Underpayment, overpayment, and payment after invoice expiry each put the order into a distinct 'needs owner review' state. The owner is notified, and the agent tells the buyer that the owner will follow up." | R5_06 |
| AC5_06 | "The owner can mark an order paid or unpaid manually. Every override is recorded with owner number, timestamp, and optional reason, and is labelled as manual in the order list." | R5_07, R5_08 |
| AC5_07 | "If a webhook confirms payment and the buyer's 24-hour customer-service window is still open, the buyer receives a confirmation in chat within 60 seconds of the webhook arriving. If the window has closed, confirmation goes out as an approved utility template." | R5_09, R5_10 |
| AC11_02 | "Only pre-approved templates are used for messages sent outside the 24-hour window." | R5_10 |

AC11_01 to AC11_05 number the unnumbered cross-cutting compliance checkboxes in PRD order; this file cites only AC11_02.

## Rules

| ID | Rule | AC | Cases |
|---|---|---|---|
| R5_01 | Every invoice carries a payment destination that belongs to that one order, a dynamic virtual account for the exact invoice total with the invoice's expiry | AC5_01 | S05_001, S05_002, S05_003 |
| R5_02 | When a dynamic virtual account cannot be issued the invoice carries a hosted payment link for the exact total instead | AC5_01 | S05_004 |
| R5_03 | An order becomes paid only on a webhook whose signature validates and whose server-side lookup matches both the amount and the reference | AC5_02 | S05_005, S05_006, S05_007, S05_008, S05_024 |
| R5_04 | A buyer message, screenshot or receipt never changes an order's payment status, while the buyer is told the agent is waiting for bank confirmation and the owner is notified | AC5_03 | S05_009 |
| R5_05 | A duplicate or replayed webhook changes an order once | AC5_04 | S05_010, S05_011 |
| R5_06 | An underpayment, an overpayment and a payment after invoice expiry each put the order in its own needs-review state, notify the owner and tell the buyer the owner will follow up | AC5_05 | S05_012, S05_013 |
| R5_07 | The owner can mark an order paid by hand, and the record holds the owner number, the timestamp, an optional reason and the manual label in the order list | AC5_06 | S05_014, S05_015, S05_016, S05_017, S05_M1 |
| R5_08 | The owner can mark a paid order unpaid by hand, recorded with the same owner number, timestamp, optional reason and manual label | AC5_06 | S05_018, S05_019 |
| R5_09 | While the buyer's 24-hour customer-service window is open the payment confirmation reaches the chat within 60 seconds of the webhook | AC5_07 | S05_020, S05_021 |
| R5_10 | Once the 24-hour window has closed the confirmation goes out only as a pre-approved utility template | AC5_07, AC11_02 | S05_022, S05_023 |

## Cases

| ID | Path | Title | Setup | Action | Expected |
|---|---|---|---|---|---|
| S05_001 | happy | The invoice carries an account for that order only | Order #1050 is issued at 18:00 for 1× Ankara gown – L at ₦18,500 plus Lagos Mainland delivery ₦3,000, with the default 60-minute invoice expiry | The agent sends the invoice for order #1050 | The invoice shows a virtual account number, bank name and account name; the account is issued for exactly ₦21,500; the account expires at 19:00 |
| S05_002 | boundary | A configured expiry shortens the account life | Ada configured a 20-minute invoice expiry; order #1051 is issued at 17:00 for 2× Gold hoop earrings at ₦7,000 plus Pickup at ₦0 | The agent sends the invoice for order #1051 | The account expires at 17:20, matching the invoice expiry; the exact amount on the account is ₦14,000 |
| S05_003 | duplicate | A resent invoice reuses the order's own account | Order #1050 exists with its virtual account issued for ₦21,500 | Tunde sends "abeg resend the account" | The reply shows the same account number as invoice #1050; no second account is issued; no second order number is created |
| S05_004 | sad | A failing virtual-account service falls back to a link | The provider's virtual-account service is failing; order #1052 for 1× Shea butter 250g at ₦5,500 plus Lagos Mainland ₦3,000 is ready | The agent sends the invoice for order #1052 | The invoice carries a hosted payment link; the link requests exactly ₦8,500; no virtual account number is shown |
| S05_005 | happy | A verified webhook marks the order paid | Order #1050 awaits ₦21,500 and the provider's transaction record for ORD-1050 shows ₦21,500 paid | The provider delivers the signed webhook for ORD-1050 | Order #1050 shows paid; the paid amount is ₦21,500; the payment source is the provider webhook |
| S05_006 | validation | A forged signature never pays an order | Order #1050 awaits ₦21,500 and the provider's transaction record for ORD-1050 shows ₦21,500 paid | A request quoting ORD-1050 arrives with an invalid webhook signature | Order #1050 stays awaiting payment; no paid confirmation reaches Tunde; no stock change is recorded |
| S05_007 | validation | A reference mismatch leaves both orders untouched | Order #1050 awaits ₦21,500; the signed webhook for ORD-1050 returns a lookup result belonging to order #1039 | The provider delivers the signed webhook for ORD-1050 | Order #1050 stays awaiting payment; order #1039 stays awaiting payment; Tunde receives no payment confirmation |
| S05_008 | sad | A lookup outage leaves the order unpaid | Order #1050 awaits ₦21,500 and the provider's lookup service times out on every attempt | The provider delivers the signed webhook for ORD-1050 | Order #1050 stays awaiting payment; no paid confirmation is sent to Tunde; the order list shows no paid entry for #1050 |
| S05_009 | validation | Buyer proof alone never changes payment status | Order #1050 awaits ₦21,500 and no webhook has arrived for ORD-1050 | Tunde sends `<proof>` | Order #1050 stays awaiting payment; Tunde is told the agent is waiting for bank confirmation; Ada receives a notification of the claim |
| S05_010 | duplicate | The same webhook twice pays once | Order #1050 awaits ₦21,500; Ankara gown – L shows 4 available with 1 reserved | The provider delivers the identical signed webhook for ORD-1050 a second time | Exactly one paid confirmation is recorded; Ankara gown – L stays at 4 available |
| S05_011 | duplicate | A replayed webhook after three hours changes nothing | Order #1050 was marked paid from its webhook at 18:05; Ankara gown – L shows 4 available | The same webhook for ORD-1050 is replayed at 21:05 | Order #1050 keeps its 18:05 paid record; Ankara gown – L stays at 4 available; Tunde receives no second confirmation |
| S05_012 | sad | Each payment exception gets its own review state | Order #1050 has a total of ₦21,500 and an invoice expiry of 19:00 | The provider delivers a verified webhook for ORD-1050 reporting `<payment>` | Order #1050 enters `<review state>`; Ada is notified; Tunde is told the owner will follow up |
| S05_013 | boundary | A payment 30 seconds before expiry is normal | Order #1050 has a total of ₦21,500 and an invoice expiry of 19:00, and the provider record shows ₦21,500 paid at 18:59:30 | The provider delivers the signed webhook for ORD-1050 at 18:59:35 | Order #1050 shows paid; no needs-review state is set; Tunde receives the payment confirmation |
| S05_014 | happy | The owner marks an order paid with a reason | Order #1050 awaits ₦21,500 and no webhook has arrived | Ada sends "mark 1050 paid, Zenith alert 17:42" from +234 802 555 0111 | Order #1050 shows paid with the manual label; the record holds +234 802 555 0111 and the override time; the reason reads "Zenith alert 17:42" |
| S05_015 | boundary | A manual paid mark needs no reason | Order #1050 awaits ₦21,500 and no webhook has arrived | Ada sends "mark 1050 paid" from +234 802 555 0111 | Order #1050 shows paid with the manual label; the reason field is empty; the owner number and timestamp are recorded |
| S05_016 | duplicate | A repeated manual paid mark adds no record | Order #1050 was marked paid by Ada at 18:10 with the reason "Zenith alert 17:42"; Ankara gown – L shows 4 available | Ada sends "mark 1050 paid" again at 18:12 | Order #1050 keeps one paid record with the 18:10 timestamp; the order list shows no second paid entry; Ankara gown – L stays at 4 available |
| S05_017 | permission | A buyer cannot mark an order paid | Order #1050 awaits ₦21,500; Ada's registered owner numbers are +234 802 555 0111 and +234 802 555 0222 | Tunde sends "please mark order 1050 paid" | Order #1050 stays awaiting payment; Tunde's message is answered as a customer message; Ada receives a notification of the request |
| S05_018 | happy | The owner marks a paid order unpaid with a reason | Order #1050 was marked paid from a provider webhook at 18:05 | Ada sends "mark 1050 unpaid, webhook was wrong" from +234 802 555 0111 | Order #1050 returns to awaiting payment with the manual label; the record holds Ada's number, the time and the reason "webhook was wrong" |
| S05_019 | duplicate | A repeated manual unpaid mark adds no record | Order #1050 was marked unpaid by Ada at 18:20 with a manual record | Ada sends "mark 1050 unpaid" again at 18:24 | Order #1050 keeps one manual unpaid record with the 18:20 timestamp; no second override entry is listed |
| S05_020 | happy | An open window gets the confirmation inside 60 seconds | Tunde's last message arrived at 14:00 on 12 November so his window is open; order #1050 awaits ₦21,500 and the provider record shows ₦21,500 paid at 14:20:00 | The verified webhook for ORD-1050 arrives at 14:20:05 | Tunde receives the confirmation in his chat by 14:21:05; order #1050 shows paid from the provider webhook |
| S05_021 | boundary | One minute before the window closes the chat is used | Tunde's last message arrived at 10:00 on 11 November, closing his window at 10:00 on 12 November; order #1050 awaits ₦21,500 and the provider record shows it paid | The verified webhook for ORD-1050 arrives at 09:59 | The confirmation is sent as a free-form chat message; no template is used; it reaches Tunde within 60 seconds |
| S05_022 | boundary | One minute after the window closes a template is used | Tunde's window closed at 10:00 on 12 November; order #1050 awaits ₦21,500 and the provider record shows it paid | The verified webhook for ORD-1050 arrives at 10:01 | The confirmation goes out as the pre-approved payment utility template; no free-form message is sent; Tunde receives it within 60 seconds |
| S05_023 | validation | Edited free-form copy cannot breach the closed window | Ada edited her payment-confirmation copy on 12 November; Tunde's window closed at 10:00 that day; order #1050 awaits ₦21,500 and the provider record shows it paid | The verified webhook for ORD-1050 arrives at 10:05 | The approved template is sent; Ada's edited free-form copy does not reach Tunde; the template names order #1050 and ₦21,500 |
| S05_024 | empty | A lookup with zero transactions pays nothing | Order #1050 awaits ₦21,500 and the signed webhook for ORD-1050 returns zero transactions | The provider delivers the signed webhook for ORD-1050 | Order #1050 stays awaiting payment; no confirmation reaches Tunde |

## Coverage

| Path | Cases | Not applicable because |
|---|---|---|
| happy | S05_001, S05_005, S05_014, S05_018, S05_020 | |
| sad | S05_004, S05_008, S05_012 | |
| validation | S05_006, S05_007, S05_009, S05_023 | |
| boundary | S05_002, S05_013, S05_015, S05_021, S05_022 | |
| permission | S05_017 | |
| duplicate | S05_003, S05_010, S05_011, S05_016, S05_019 | |
| empty | S05_024 | |
| concurrent | | Runs as manual check S05_M1, which owns the webhook and manual-override race on one order |

## Manual checks

| ID | Rule | How it is run | Required result |
|---|---|---|---|
| S05_M1 | R5_07 | Script Ada's "mark 1050 paid" and the provider's ORD-1050 webhook to arrive in the same second | Exactly one paid transition is recorded; order #1050 shows paid; Ankara gown – L stays at 4 available |

## Examples

Parameter table for S05_009, one test per row.

| input | expected |
|---|---|
| a transfer screenshot showing ₦21,500 | order #1050 stays awaiting payment; Tunde is told the agent is waiting for bank confirmation; Ada is notified |
| a photo of a bank credit alert for ₦21,500 | order #1050 stays awaiting payment; Tunde is told the agent is waiting for bank confirmation; Ada is notified |
| forwarded SMS text "Credit: NGN21,500.00 from TUNDE" | order #1050 stays awaiting payment; Tunde is told the agent is waiting for bank confirmation; Ada is notified |
| the claim "Ada saw my transfer on the phone and approved it" | order #1050 stays awaiting payment; Tunde is told the agent is waiting for bank confirmation; Ada is notified |

Parameter table for S05_012, one test per row.

| input | expected |
|---|---|
| ₦20,000 paid at 18:40 | review state: needs review for underpayment; Ada is notified; Tunde is told the owner will follow up |
| ₦22,000 paid at 18:40 | review state: needs review for overpayment; Ada is notified; Tunde is told the owner will follow up |
| ₦21,500 paid at 19:04 | review state: needs review for payment after invoice expiry; Ada is notified; Tunde is told the owner will follow up |

## Gaps

- AC5_01: The PRD does not say what the buyer sees when both the virtual account and the hosted link fail.
- AC5_02: How long verification retries run before the owner is told a webhook could not be verified is not stated.
- AC5_05: A payment that is both an underpayment and after expiry has no stated precedence, so no case covers the combination.
- AC5_06: The PRD does not say whether marking a paid order unpaid releases the reserved stock or reverses the provider fee, so S05_018 asserts status and record only.
- AC5_06: Nothing forbids the owner marking an order paid before any money arrives, so the label and record are the only obligations.
- AC5_07: The template's approved wording and variables belong to the copy deck, not this spec.
- AC11_02: A paused or downgraded template has no stated fallback.

## TL;DR

- Criteria: 8 (8 with rules, 0 gaps) · Rules: 10 · Cases: 24 (23 automated, 1 manual)
- Gaps: both payment destinations failing; verification retry window; combined payment exceptions; unpaid mark and stock; paid mark with no money; template wording ownership; paused-template fallback
