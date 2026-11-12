# S05 — Automatic payment confirmation and manual override

Epic: EPIC-0005 · Stories: 5, 9 · Owner role: Spec Writer

## Criteria

| AC | Criterion (quoted from PRD) | Rules |
|---|---|---|
| AC5_01 | “Every invoice gets a payment destination tied to that order. The default is a dynamic virtual account with the exact order amount and an expiry. A hosted payment link is the fallback.” | R5_01, R5_02, R5_03 |
| AC5_02 | “An order is marked paid only when a verified provider webhook arrives. Verification requires both of the following: The signature is validated. A server-side transaction lookup confirms the amount and the reference.” | R5_04, R5_05, R5_06 |
| AC5_03 | “Customer messages, screenshots, or receipts never change payment status on their own. If a buyer sends proof of payment and no confirmed webhook exists, the agent replies that it is waiting for bank confirmation and notifies the owner.” | R5_07, R5_08 |
| AC5_04 | “Webhook processing is idempotent. A duplicate or replayed webhook never double-confirms an order or double-decrements stock.” | R5_09, R5_10 |
| AC5_05 | “Underpayment, overpayment, and payment after invoice expiry each put the order into a distinct "needs owner review" state. The owner is notified, and the agent tells the buyer that the owner will follow up.” | R5_11, R5_12 |
| AC5_06 | “The owner can mark an order paid or unpaid manually. Every override is recorded with owner number, timestamp, and optional reason, and is labelled as manual in the order list.” | R5_13, R5_14 |
| AC5_07 | “If a webhook confirms payment and the buyer's 24-hour customer-service window is still open, the buyer receives a confirmation in chat within 60 seconds of the webhook arriving. If the window has closed, confirmation goes out as an approved utility template.” | R5_15, R5_16 |

## Rules

| ID | Rule | AC | Cases |
|---|---|---|---|
| R5_01 | Each invoice carries a payment destination unique to that order for exactly the order amount. | AC5_01 | S05_001, S05_002, S05_003, S05_M1 |
| R5_02 | The virtual account for an invoice stops accepting payment at the invoice's expiry time. | AC5_01 | S05_004 |
| R5_03 | When the virtual account cannot be created, the invoice carries a hosted payment link for the same amount. | AC5_01 | S05_005 |
| R5_04 | An order becomes paid only when a verified provider webhook confirms it. | AC5_02 | S05_006, S05_007 |
| R5_05 | A webhook whose signature does not validate is rejected and changes no order. | AC5_02 | S05_008 |
| R5_06 | A webhook is accepted only when a server-side transaction lookup returns the matching amount and reference. | AC5_02 | S05_009, S05_010 |
| R5_07 | A buyer message, screenshot or receipt changes no payment status. | AC5_03 | S05_011, S05_012 |
| R5_08 | A buyer's proof of payment with no verified webhook gets a reply that the vendor is waiting for bank confirmation and an owner notification. | AC5_03 | S05_013, S05_014 |
| R5_09 | A duplicate or replayed webhook confirms an order once. | AC5_04 | S05_015, S05_016 |
| R5_10 | A duplicate or replayed webhook decrements stock once. | AC5_04 | S05_017, S05_018 |
| R5_11 | Underpayment, overpayment and payment after invoice expiry each produce a needs-owner-review state distinct from the other two. | AC5_05 | S05_019, S05_020 |
| R5_12 | A needs-review order notifies the owner and tells the buyer that the owner will follow up. | AC5_05 | S05_021, S05_022 |
| R5_13 | The owner marks an order paid manually, with the owner number, timestamp and optional reason recorded and the order labelled manual. | AC5_06 | S05_023, S05_024, S05_025 |
| R5_14 | The owner marks an order unpaid manually, with the override recorded on the order. | AC5_06 | S05_026, S05_027 |
| R5_15 | With the buyer's 24-hour customer-service window open the buyer receives the payment confirmation in chat within 60 seconds of the webhook. | AC5_07 | S05_028, S05_029 |
| R5_16 | With the buyer's 24-hour window closed the payment confirmation goes out as an approved utility template. | AC5_07 | S05_029, S05_030 |

## Cases

| ID | Path | Title | Setup | Action | Expected |
|---|---|---|---|---|---|
| S05_001 | happy | Invoice gets its own payment destination | Order #1042 totals ₦21,500 and no payment destination exists for it | The invoice for #1042 is issued | A payment destination tied to #1042 is created for exactly ₦21,500; it carries the invoice's expiry time |
| S05_002 | concurrent | Two invoices issued at the same moment | Orders #1042 and #1043 are being invoiced at 10:00:00 with totals ₦21,500 and ₦18,500 | Both invoices are issued | Each order gets its own payment destination; neither destination is shared between the two orders |
| S05_003 | boundary | Two orders with the same total | Orders #1042 and #1047 both total ₦21,500 | Both invoices are issued in the same hour | #1042 and #1047 carry different payment destinations; each destination is tied to its own order |
| S05_004 | boundary | Transfer one minute before invoice expiry | Invoice #1042 for ₦21,500 expires at 11:00 and the provider reports a ₦21,500 transfer at 10:59 | The webhook and lookup for the 10:59 transfer are processed | Order #1042 is marked paid; no review state is applied |
| S05_005 | sad | Virtual account creation fails | Order #1042 totals ₦21,500 and the provider returns an error when the virtual account is requested | The invoice for #1042 is issued | The invoice carries a hosted payment link for ₦21,500; the invoice is issued and payable |
| S05_006 | happy | Verified webhook marks the order paid | Invoice #1042 for ₦21,500 is unpaid and the provider sends a signed webhook for reference #1042 | The webhook is verified and the lookup returns reference #1042 for ₦21,500 | Order #1042 is marked paid |
| S05_007 | sad | Webhook without a matching transaction | Invoice #1042 for ₦21,500 is unpaid and a signed webhook arrives for reference #1042 | The server-side lookup finds no transaction for reference #1042 | Order #1042 stays awaiting payment; no payment is recorded |
| S05_008 | validation | Forged webhook signature | Invoice #1042 for ₦21,500 is unpaid | A webhook claiming payment for #1042 arrives with a signature that does not validate | The webhook is rejected; order #1042 stays awaiting payment |
| S05_009 | sad | Lookup returns a smaller amount | Invoice #1042 for ₦21,500 is unpaid and a signed webhook claims ₦20,000 for reference #1042 | The lookup returns ₦20,000 for reference #1042 | Order #1042 is not marked paid; it enters the underpayment review state |
| S05_010 | sad | Lookup returns a different reference | Invoice #1042 for ₦21,500 is unpaid and a signed webhook claims payment for reference #1042 | The lookup returns a transaction for reference #1099 | Order #1042 stays awaiting payment; no payment is recorded against it |
| S05_011 | validation | Buyer sends a transfer screenshot | Invoice #1042 for ₦21,500 is unpaid and no webhook has arrived | The buyer sends a transfer screenshot captioned "₦21,500 sent" | Order #1042 stays awaiting payment; no paid status is recorded |
| S05_012 | duplicate | Buyer sends the same receipt three times | Invoice #1042 for ₦21,500 is unpaid and no webhook has arrived | The buyer sends the same receipt image three times | Order #1042 stays awaiting payment; the owner is notified about the unverified claim |
| S05_013 | happy | Proof of payment answered and escalated | Invoice #1042 for ₦21,500 is unpaid and no webhook has arrived | The buyer asks "I've paid, check your bank" | The buyer is told the vendor is waiting for bank confirmation; the owner is notified about the claim |
| S05_014 | concurrent | Webhook lands just after the buyer's claim | Invoice #1042 for ₦21,500 is unpaid and the buyer sends a receipt at 10:00:00 | The verified webhook for #1042 arrives at 10:00:04 | The buyer first gets the waiting-for-bank-confirmation reply; order #1042 is then marked paid once |
| S05_015 | duplicate | Same webhook delivered three times | Order #1042 for ₦21,500 is awaiting payment and one verified webhook is being processed | The identical verified webhook is delivered twice more | Order #1042 is paid once; one payment record exists for it |
| S05_016 | concurrent | Two identical webhooks at once | Order #1042 for ₦21,500 is awaiting payment | Two identical verified webhooks for #1042 are processed at the same instant | Order #1042 is paid once; no second payment record exists |
| S05_017 | duplicate | Replayed webhook after payment | Order #1042 is paid for 2 units of Ankara gown – L, whose listed quantity is now 3 | The verified webhook for #1042 is delivered again | The listed quantity stays 3; no further decrement happens |
| S05_018 | concurrent | Replay during the first decrement | Order #1042 is paid for 2 units of Ankara gown – L with listed quantity 5 | The same verified webhook is processed twice at the same instant | The listed quantity becomes 3; exactly one decrement of 2 is applied |
| S05_019 | happy | Payment mismatch enters a distinct review state | Order #1042 totals ₦21,500 and has not been paid | A verified payment of <input> arrives for #1042 | Order #1042 enters the <input> review state; it is not marked paid |
| S05_020 | boundary | Exact amount at the expiry edge | Invoice #1042 for ₦21,500 expires at 11:00 and the provider reports ₦21,500 at 10:59:59 | The verified webhook is processed | Order #1042 is marked paid; no review state is applied |
| S05_021 | happy | Review state notifies owner and answers buyer | Order #1042 entered the underpayment review state with ₦20,000 against ₦21,500 | The review notification is sent | The owner's notification names order #1042 and the ₦20,000 against ₦21,500; the buyer is told the owner will follow up |
| S05_022 | sad | Owner review notice outside the window | Order #1042 entered the overpayment review state and the owner's last message was 30 hours ago | The review notification is sent | The owner receives the notification as an approved utility template; its text names order #1042 |
| S05_023 | happy | Owner marks an order paid manually | Order #1042 is awaiting payment at ₦21,500 and +2348030000001 is a registered owner number | The owner sends "mark #1042 paid, saw it in my bank app" | Order #1042 is paid; the order list labels it manual |
| S05_024 | permission | Buyer marks an order paid | Order #1042 is awaiting payment at ₦21,500 | +2348030000002 sends "mark #1042 paid" | Order #1042 stays awaiting payment; the sender receives a customer-style reply |
| S05_025 | duplicate | Manual paid mark sent twice | Order #1042 is awaiting payment and the owner has just marked it paid manually | The owner's "mark #1042 paid" arrives a second time | Order #1042 is paid once; one override record exists for it |
| S05_026 | happy | Owner marks a manual payment unpaid | Order #1042 was marked paid manually and carries one override record | The owner sends "mark #1042 unpaid" | Order #1042 returns to awaiting payment; the override record shows the owner number and the time |
| S05_027 | duplicate | Unpaid mark sent twice | Order #1042 was marked paid manually and the owner is marking it unpaid | The owner sends "mark #1042 unpaid" twice | Order #1042 is awaiting payment; one unpaid override record exists for it |
| S05_028 | boundary | Confirmation inside the 60-second deadline | Order #1042 is paid by verified webhook at 10:00:00 and the buyer's window is open | The confirmation is published at 10:00:59 | The buyer has the payment confirmation in chat within the deadline; it states ₦21,500 and order #1042 |
| S05_029 | boundary | Webhook one minute after the window closed | The buyer's last message was at 09:00 yesterday and the verified webhook arrives at 09:01 today | The payment confirmation is sent | The confirmation is sent as an approved utility template; no free-form message is sent |
| S05_030 | happy | Closed-window confirmation as a template | The verified webhook confirms order #1042 for ₦21,500 and the buyer's 24-hour window is closed | The payment confirmation is sent | The buyer receives an approved utility template naming ₦21,500 and order #1042 |

## Examples

### S05_019

| input | expected |
|---|---|
| ₦20,000 for order #1042 totalling ₦21,500 | underpayment review state |
| ₦22,000 for order #1042 totalling ₦21,500 | overpayment review state |
| ₦21,500 for order #1042 arriving 10 minutes after its expiry | payment-after-expiry review state |

## Coverage

| Path | Cases | Not applicable because |
|---|---|---|
| happy | S05_001, S05_006, S05_013, S05_019, S05_021, S05_023, S05_026, S05_030 | |
| sad | S05_005, S05_007, S05_009, S05_010, S05_022 | |
| validation | S05_008, S05_011 | |
| boundary | S05_003, S05_004, S05_020, S05_028, S05_029 | |
| permission | S05_024 | |
| duplicate | S05_012, S05_015, S05_017, S05_025, S05_027 | |
| empty | | an invoice always carries a positive total before a payment destination exists, so there is no empty-payment state |
| concurrent | S05_002, S05_014, S05_016, S05_018 | |

## Manual checks

| ID | Rule | How it is run | Required result |
|---|---|---|---|
| S05_M1 | R5_01 | Issue 3 invoices with different totals through a test vendor and read the provider dashboard for each account | Three distinct dynamic accounts exist, each with its own order amount and expiry, and each is tied to one order |

## Gaps

- AC5_01: Q2 (blocking) — the payment provider is undecided, so virtual account features, link format and expiry granularity are unstated and S05_M1 names no provider.
- AC5_01: the PRD does not state when the hosted payment link is chosen instead of the virtual account, beyond calling it a fallback.
- AC5_01: whether the virtual account stays payable after the invoice expires while the payment is reviewed is unstated.
- AC5_05: no tolerance is given for a mismatch, so whether ₦1 short is an underpayment or a rounding pass is unstated.
- AC5_05: the exact instant of expiry is not defined to the second, so S05_004 and S05_020 test one minute and one second either side.
- AC5_06: whether the owner can mark a webhook-paid order unpaid, and what happens to decremented stock when an order is un-paid, is unstated.
- AC5_07: what the buyer sees when a payment confirmation cannot be sent because no approved template exists is unstated.
- AC5_03: the PRD does not state how many times the owner is notified about repeated unverified payment claims in one chat.

## TL;DR

- Criteria: 7 (7 with rules) · Rules: 16 · Cases: 30, all automated · Manual checks: 1
- Gaps: Q2 provider features (AC5_01), link fallback trigger (AC5_01), post-expiry account payability (AC5_01), mismatch tolerance (AC5_05), expiry instant (AC5_05), un-paying a webhook-paid order (AC5_06), missing template fallback (AC5_07), repeat claim notifications (AC5_03)
