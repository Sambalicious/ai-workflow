# S05 — Automatic payment confirmation and manual override

Epic: EPIC-0005 · Stories: 5 · Owner role: Spec Writer

## Criteria

| AC | Criterion (quoted from PRD) | Rules |
|---|---|---|
| AC05_01 | "Every invoice gets a payment destination tied to that order. The default is a dynamic virtual account with the exact order amount and an expiry. A hosted payment link is the fallback." | R05_01 |
| AC05_02 | "An order is marked paid only when a verified provider webhook arrives. Verification requires both of the following: The signature is validated. A server-side transaction lookup confirms the amount and the reference." | R05_02, R05_03 |
| AC05_03 | "Customer messages, screenshots, or receipts never change payment status on their own. If a buyer sends proof of payment and no confirmed webhook exists, the agent replies that it is waiting for bank confirmation and notifies the owner." | R05_04, R05_05 |
| AC05_04 | "Webhook processing is idempotent. A duplicate or replayed webhook never double-confirms an order or double-decrements stock." | R05_06 |
| AC05_05 | "Underpayment, overpayment, and payment after invoice expiry each put the order into a distinct "needs owner review" state. The owner is notified, and the agent tells the buyer that the owner will follow up." | R05_07, R05_08, R05_09, R05_10 |
| AC05_06 | "The owner can mark an order paid or unpaid manually. Every override is recorded with owner number, timestamp, and optional reason, and is labelled as manual in the order list." | R05_11, R05_12 |
| AC05_07 | "If a webhook confirms payment and the buyer's 24-hour customer-service window is still open, the buyer receives a confirmation in chat within 60 seconds of the webhook arriving. If the window has closed, confirmation goes out as an approved utility template." | R05_13, R05_14 |
| AC11_02 | "Only pre-approved templates are used for messages sent outside the 24-hour window." | R05_14 |

## Rules

| ID | Rule | AC | Cases |
|---|---|---|---|
| R05_01 | Every invoice carries a payment destination tied to its own order, defaulting to a dynamic virtual account for the exact order amount with an expiry and falling back to a hosted payment link. | AC05_01 | S05_001, S05_002, S05_003 |
| R05_02 | An order becomes paid only on a provider webhook whose signature validates against the provider secret. | AC05_02 | S05_004, S05_005 |
| R05_03 | A webhook confirms payment only after a server-side transaction lookup returns the same amount and the same reference as the order. | AC05_02 | S05_006, S05_007, S05_008, S05_009, S05_030 |
| R05_04 | A customer message, screenshot or receipt never changes an order's payment status. | AC05_03 | S05_010, S05_011 |
| R05_05 | When proof of payment arrives with no confirmed webhook the agent tells the buyer it is waiting for bank confirmation and notifies the owner. | AC05_03 | S05_012, S05_013 |
| R05_06 | A duplicate or replayed webhook never double-confirms an order and never double-decrements its stock. | AC05_04 | S05_014, S05_015, S05_M1 |
| R05_07 | An underpayment puts the order into the needs owner review state for underpayment, notifies the owner and tells the buyer the owner will follow up. | AC05_05 | S05_016 |
| R05_08 | An overpayment puts the order into the needs owner review state for overpayment, notifies the owner and tells the buyer the owner will follow up. | AC05_05 | S05_017 |
| R05_09 | A payment that settles after the invoice expiry puts the order into the needs owner review state for payment after expiry, notifies the owner and tells the buyer the owner will follow up. | AC05_05 | S05_018, S05_019 |
| R05_10 | A needs-review order never shows as paid to the buyer and leaves that state only through an owner action. | AC05_05 | S05_020 |
| R05_11 | The owner can mark an order paid manually, and the override is recorded with the owner number, the timestamp and the optional reason and is labelled manual in the order list. | AC05_06 | S05_021, S05_022, S05_023 |
| R05_12 | The owner can mark an order unpaid manually, and the override is recorded with the owner number, the timestamp and the optional reason and is labelled manual in the order list. | AC05_06 | S05_024, S05_025 |
| R05_13 | While the buyer's 24-hour customer-service window is open, the confirmation reaches the buyer in chat within 60 seconds of the webhook arriving. | AC05_07 | S05_026, S05_027 |
| R05_14 | When the window has closed, the confirmation goes out as an approved utility template and never as an unapproved message. | AC05_07, AC11_02 | S05_028, S05_029 |

## Cases

| ID | Path | Title | Setup | Action | Expected |
|---|---|---|---|---|---|
| S05_001 | happy | Invoice carries a per-order virtual account for the exact total | Tunde's cart holds 1x Ankara gown – L at ₦18,500 with Lagos Mainland delivery at ₦3,000, the provider is issuing dynamic accounts, order #1042 is being invoiced at 20:40 with a 60-minute expiry | The agent issues the invoice for order #1042 | The invoice shows Wema Bank account 7812345678 named ADA STYLES; the account is created for ₦21,500; the invoice states an expiry of 21:40 |
| S05_002 | sad | Provider account creation fails and the link fallback is used | Tunde's cart holds 1x Ankara gown – L at ₦18,500 with Pickup at ₦0, order #1043 is being invoiced, the provider's virtual-account creation is timing out after 30 seconds | The agent issues the invoice for order #1043 | The invoice shows a hosted payment link for ₦18,500 instead of an account number; the total stays ₦18,500; the 60-minute expiry is unchanged |
| S05_003 | duplicate | A second order gets its own payment destination | Order #1042 was paid as ₦21,500 into virtual account 7812345678, Tunde's chat is open, Beaded bag is listed at ₦7,500 with 12 in stock, Pickup is available at ₦0 | Tunde orders 1x Beaded bag with Pickup | The new order #1048 gets a virtual account different from 7812345678; the new account is created for ₦7,500; another transfer into 7812345678 cannot confirm order #1048 |
| S05_004 | happy | Validly signed webhook for the exact amount marks the order paid | Order #1042 is awaiting payment on virtual account 7812345678 for ₦21,500, the invoice expiry is 21:40, the provider secret is configured | The provider sends a transfer webhook for reference INV-1042 with a valid signature and ₦21,500 | Order #1042 shows paid; Tunde receives the payment confirmation within 60 seconds; Ada receives the paid-order notification for #1042 |
| S05_005 | validation | Webhook with an invalid signature | Order #1042 is awaiting payment for ₦21,500, its invoice is unexpired, the provider secret is configured | A webhook for INV-1042 arrives carrying a signature that fails the secret check | Order #1042 stays awaiting payment; no payment confirmation reaches Tunde; the rejected delivery is recorded for the operator |
| S05_006 | sad | Transaction lookup times out | Order #1042 is awaiting payment for ₦21,500, a correctly signed webhook for INV-1042 has arrived | The server-side transaction lookup times out after 30 seconds | Order #1042 stays awaiting payment; no confirmation reaches Tunde; the webhook remains queued for retry |
| S05_007 | happy | Lookup returns the matching amount and reference | Order #1042 is awaiting payment for ₦21,500, a correctly signed webhook for INV-1042 has arrived | The lookup returns reference INV-1042 with settled amount ₦21,500 | Order #1042 is marked paid; Ada receives the paid-order notification; Tunde receives the payment confirmation |
| S05_008 | sad | Lookup returns a reference belonging to another order | Order #1042 is awaiting payment for ₦21,500, order #1043 is awaiting payment for ₦7,500, a correctly signed webhook for INV-1042 has arrived | The lookup returns reference INV-1043 for ₦21,500 | Order #1042 stays awaiting payment; order #1043 stays awaiting payment; no payment confirmation reaches Tunde |
| S05_009 | sad | Lookup amount disagrees with the webhook | Order #1042 is awaiting payment for ₦21,500, a correctly signed webhook claiming ₦21,500 for INV-1042 has arrived | The lookup returns reference INV-1042 with settled amount ₦19,000 | Order #1042 is not marked paid; order #1042 enters the underpayment review state; Ada is notified of the ₦2,500 shortfall |
| S05_010 | validation | Buyer sends a transfer screenshot | Order #1042 is awaiting payment for ₦21,500, no webhook has arrived for it, Tunde's chat is open | Tunde sends a photo of a transfer receipt showing ₦21,500 to ADA STYLES | Order #1042 stays awaiting payment; no payment confirmation reaches Tunde |
| S05_011 | validation | Buyer asserts the transfer has left his bank | Order #1042 is awaiting payment for ₦21,500, no webhook has arrived for it, Tunde's chat is open | Tunde writes "I have sent the money, check your bank app now" | Order #1042 stays awaiting payment; the amount on order #1042 remains ₦21,500 |
| S05_012 | sad | Proof of payment with no confirmed webhook | Order #1042 is awaiting payment for ₦21,500, no webhook exists for INV-1042, Ada is the registered owner number | Tunde sends a receipt image for ₦21,500 | The reply says the agent is waiting for bank confirmation; Ada receives a notice naming order #1042 and Tunde |
| S05_013 | duplicate | Buyer sends the same receipt three times | Order #1042 is awaiting payment for ₦21,500, no webhook exists for INV-1042, Tunde's chat is open | Tunde sends the same receipt image a third time | The reply still says the agent is waiting for bank confirmation; order #1042 stays awaiting payment |
| S05_014 | duplicate | Replayed webhook after confirmation | Order #1042 was confirmed paid at ₦21,500 ten minutes ago and its reserved unit converts to a sale, the provider replays the same event identifier | The provider resends the same event for INV-1042 | Order #1042 stays paid once; Tunde receives no second confirmation; the recorded sale stays at one unit |
| S05_015 | concurrent | Two provider deliveries for one order | Order #1042 is awaiting payment for ₦21,500 on virtual account 7812345678, the provider emits both a transfer-success event and a settlement event for reference INV-1042 | Both events for INV-1042 arrive within the same second | Order #1042 is marked paid once; Tunde receives exactly one confirmation; exactly one sale is recorded for the ₦21,500 |
| S05_016 | sad | Underpayment of ₦1,500 | Order #1042 is awaiting payment for ₦21,500, a correctly signed webhook for INV-1042 has arrived, the lookup returns ₦20,000 | The confirmed amount of ₦20,000 is applied to order #1042 | Order #1042 shows the needs review state for underpayment; Ada is notified of the ₦1,500 shortfall; Tunde is told the owner will follow up |
| S05_017 | sad | Overpayment of ₦500 | Order #1042 is awaiting payment for ₦21,500, a correctly signed webhook for INV-1042 has arrived, the lookup returns ₦22,000 | The confirmed amount of ₦22,000 is applied to order #1042 | Order #1042 shows the needs review state for overpayment; Ada is notified of the ₦500 excess; Tunde is told the owner will follow up |
| S05_018 | boundary | Payment lands one minute after expiry | Order #1042 is awaiting payment for ₦21,500 and its invoice expired at 21:40, the provider sends a correctly signed webhook for INV-1042 at 21:41 | The confirmed ₦21,500 settles at 21:41 | Order #1042 shows the needs review state for payment after expiry; Ada is notified that order #1042 was paid after expiry; Tunde is told the owner will follow up |
| S05_019 | boundary | Payment lands at the expiry minute | Order #1042 is awaiting payment for ₦21,500 with an expiry of 21:40, the provider sends a correctly signed webhook for INV-1042 at 21:40 | The confirmed ₦21,500 settles at 21:40 | Order #1042 is marked paid without a review state; Ada receives the paid-order notification |
| S05_020 | sad | Buyer asks for status while the order needs review | Order #1042 holds ₦20,000 confirmed against a ₦21,500 invoice and sits in the needs review state for underpayment, Tunde's chat is open | Tunde asks "Have you received my payment?" | The reply says Ada will follow up on order #1042; the reply does not state that payment is confirmed |
| S05_021 | happy | Owner marks an order paid by hand | Order #1042 is awaiting payment for ₦21,500, Ada at +234 802 111 7788 is the registered owner number, the order list is open | Ada writes "Mark #1042 paid, cash at pickup" | Order #1042 shows paid; the order list labels the payment manual; the record holds +234 802 111 7788, the timestamp and the reason "cash at pickup" |
| S05_022 | permission | A non-owner number marks an order paid | Order #1042 is awaiting payment for ₦21,500, +234 809 222 3344 is not a registered owner number | +234 809 222 3344 writes "Mark #1042 paid" | Order #1042 stays awaiting payment; no override is recorded; the message is handled as a customer message |
| S05_023 | validation | Owner override without an order number | Orders #1042 for ₦21,500 and #1043 for ₦7,500 are both awaiting payment, Ada is the registered owner number | Ada writes "Mark it paid" | Neither order changes status; the agent asks Ada which order number she means |
| S05_024 | happy | Owner marks a paid order unpaid | Order #1042 shows paid from a webhook for ₦21,500, Ada is the registered owner number | Ada writes "Mark #1042 unpaid, false alert" | Order #1042 returns to awaiting payment; the order list labels the change manual; the record holds +234 802 111 7788, the timestamp and the reason "false alert" |
| S05_025 | concurrent | Owner override and webhook on one order | Order #1042 is awaiting payment for ₦21,500, Ada is marking it paid by hand, a correctly signed webhook for INV-1042 is arriving | Ada's "Mark #1042 paid" and the provider webhook for INV-1042 land at the same moment | Order #1042 ends paid once; Tunde receives exactly one payment confirmation; the conversion to a sale is recorded once |
| S05_026 | happy | Confirmation inside the open service window | Tunde's last message to the vendor was at 13:30, a correctly signed webhook for order #1042 and ₦21,500 arrives at 14:00, the provider lookup succeeds within 3 seconds | The webhook for INV-1042 arrives at 14:00 | Tunde receives the confirmation in his chat at 14:00:35; the confirmation states ₦21,500 and order #1042 |
| S05_027 | boundary | Confirmation dispatched at 59 seconds | Tunde's last message to the vendor was at 13:30, a correctly signed webhook for order #1042 and ₦21,500 arrives at 14:00, the provider lookup is slow | The confirmation is dispatched at 14:00:59 | The confirmation still counts as within 60 seconds of the webhook arriving; Tunde receives it in his chat |
| S05_028 | sad | Confirmation after the window has closed | Tunde's last message to the vendor was 25 hours before the payment, a correctly signed webhook for order #1042 and ₦21,500 arrives, the approved utility template is available at Meta | The webhook for INV-1042 is verified | No free-form message is sent to Tunde; the approved utility template is delivered with ₦21,500 and order #1042 |
| S05_029 | validation | Only unapproved templates exist for the closed window | Tunde's last message to the vendor was 25 hours before the payment, a correctly signed webhook for order #1042 and ₦21,500 is verified, the only matching template is rejected at Meta | The confirmation for order #1042 is prepared for the closed window | Nothing is sent to Tunde; order #1042 still shows paid |
| S05_030 | empty | Lookup returns no transaction | Order #1042 is awaiting payment for ₦21,500, a correctly signed webhook for INV-1042 has arrived | The lookup returns no transaction for reference INV-1042 | Order #1042 stays awaiting payment; no confirmation reaches Tunde |

## Coverage

| Path | Cases | Not applicable because |
|---|---|---|
| happy | S05_001, S05_004, S05_007, S05_021, S05_024, S05_026 | |
| sad | S05_002, S05_006, S05_008, S05_009, S05_012, S05_016, S05_017, S05_020, S05_028 | |
| validation | S05_005, S05_010, S05_011, S05_023, S05_029 | |
| boundary | S05_018, S05_019, S05_027 | |
| permission | S05_022 | |
| duplicate | S05_003, S05_013, S05_014 | |
| empty | S05_030 | |
| concurrent | S05_015, S05_025 | |

## Manual checks

| ID | Rule | How it is run | Required result |
|---|---|---|---|
| S05_M1 | R05_06 | Replay one confirmed transfer webhook 50 times, with mixed delivery of the same event identifier and of overlapping events, against a seeded order of ₦21,500 with one unit reserved, and inspect order state and stock after each delivery. | Order status reads paid once; the recorded sale is one unit; the buyer receives one confirmation in total. |

## Examples

None.

## Gaps

- AC05_06: the PRD does not say whether the order list shows manual or confirmed when an override and a webhook both occur. S05_025 asserts a single paid state and does not assert the label.
- AC05_03: the PRD does not say whether repeated proof of payment produces one owner notice or one per message. S05_013 asserts only the buyer reply and the order status.
- AC05_01: the PRD names a hosted payment link as the fallback but does not say what triggers it. S05_002 assumes provider account creation is unavailable.
- AC05_07: the PRD does not say what happens when no approved template exists for a closed window. S05_029 asserts only that nothing unapproved is sent.
- AC05_05: the PRD does not say whether the buyer may be told which review reason applies. S05_016 to S05_018 give the buyer the generic follow-up wording only.
- AC05_01: the bank and account number on a dynamic virtual account come from the provider. Cases seed Wema Bank 7812345678 and the provider is open question 2 in the PRD.
- retired: none.

## TL;DR

- Criteria: 8 (8 with rules, 0 gaps) · Rules: 14 · Cases: 30 (30 automated, 1 manual)
- Gaps: override label versus webhook; repeat-proof owner notices; hosted-link fallback trigger; missing approved template; buyer-facing review wording; provider choice for the account data
