@buyer-confirmation
Feature: Buyer payment confirmation
  As a buyer
  I want confirmation as soon as my transfer arrives, and honest status answers before it does
  So that I know the vendor has my money and my order is secured

  Background:
    Given the vendor "Ada's Closet" is live
    And the buyer "Tunde Bakare" chats from "+234 701 555 0233"
    And order #1042 for "1 x Ankara gown – L" with "Lekki/Ajah" delivery totals "₦31,500"
    And the vendor's fulfilment note reads "Pickup at 12 Adeola Odeku, Victoria Island, from 10am tomorrow."

  # ── Happy path ──────────────────────────────────────────────

  @happy
  Scenario: The buyer is told the amount and order number when payment is verified
    Given the verified webhook for order #1042 arrives at 21:12
    When the payment is confirmed
    Then the buyer receives "Payment of ₦31,500 received for order #1042."
    And the buyer receives the fulfilment note "Pickup at 12 Adeola Odeku, Victoria Island, from 10am tomorrow."

  @happy
  Scenario Outline: Reserved stock becomes a sale with no double counting
    Given "Ankara gown – L" has "<stock>" in stock and "<reserved>" reserved by order #1042
    When the verified webhook confirms payment for order #1042
    Then "Ankara gown – L" shows "<available>" available and "1" sold

    Examples:
      | stock | reserved | available |
      | 4     | 1        | 3         |

  @happy
  Scenario: A status question after payment is answered from the order record
    Given order #1042 was marked paid at 21:12
    When the buyer asks "have you received my payment?"
    Then the buyer receives "Yes — ₦31,500 received for order #1042 at 21:12."

  # ── Sad path ────────────────────────────────────────────────

  @sad
  Scenario: A status question before any webhook reports that nothing has landed
    Given order #1042 is awaiting payment and no webhook has arrived
    When the buyer asks "I transferred ₦31,500 ten minutes ago, have you got it?"
    Then the buyer receives "I haven't received bank confirmation for order #1042 yet. I'll message you as soon as it arrives."
    And order #1042 stays awaiting payment

  @sad
  Scenario: A status question during review never claims payment received
    Given order #1042 is in the state "needs review — underpayment"
    When the buyer asks "have you received my payment?"
    Then the buyer receives "Your payment for order #1042 is with the owner for review. She will follow up with you."
    And the reply does not state "received"

  @sad
  Scenario: A status question about an order that does not exist is declined
    When the buyer asks "have you received my payment for order #9999?"
    Then the buyer receives "There's no order #9999 in this chat."

  @sad
  Scenario: A confirmation draft with a wrong amount is replaced before sending
    Given order #1042 was marked paid at 21:12 for "₦31,500"
    And the outgoing confirmation draft states "₦13,500"
    When the outgoing draft is checked against the order record
    Then the buyer receives "I'm confirming your payment amount with the owner. I'll message you shortly."
    And the blocked confirmation is recorded with the amount "₦13,500"

  # ── Permission ──────────────────────────────────────────────

  @permission
  Scenario: A buyer cannot read another buyer's order status
    Given order #1043 belongs to "+234 706 555 0291"
    When the buyer at "+234 701 555 0233" asks "have you received the payment for order #1043?"
    Then the buyer receives "I can only share order details for orders in this chat."
    And the reply contains no amount or status for order #1043

  # ── Boundary ────────────────────────────────────────────────

  @boundary
  Scenario: A confirmation outside the 24-hour window keeps its content in the approved template
    Given the buyer's 24-hour customer-service window closed at 18:00
    And the verified webhook for order #1042 arrives at 21:12
    When the payment is confirmed
    Then the buyer receives the approved utility template "order_paid_confirmation" carrying "₦31,500" and "#1042"
    And the template carries the fulfilment note "Pickup at 12 Adeola Odeku, Victoria Island, from 10am tomorrow."

  # ── Duplicate / idempotency ─────────────────────────────────

  @duplicate
  Scenario: A retried webhook produces one confirmation message
    Given the verified webhook for order #1042 was processed at 21:12 and the buyer was told the payment arrived
    When the identical webhook is delivered again at 21:14
    Then the buyer has received 1 confirmation message
    And the chat shows one "Payment of ₦31,500 received for order #1042."

  @duplicate
  Scenario: The buyer asking for status three times gets the same recorded answer each time
    Given order #1042 was marked paid at 21:12
    When the buyer asks "have you received my payment?" three times in one minute
    Then the buyer receives "Yes — ₦31,500 received for order #1042 at 21:12." three times
    And the chat shows 1 payment confirmation message

  # ── Empty state ─────────────────────────────────────────────

  @empty
  Scenario: A vendor with no fulfilment note set still confirms with a next step
    Given the vendor's fulfilment note is empty
    And the verified webhook for order #1042 arrives at 21:12
    When the payment is confirmed
    Then the buyer receives "Payment of ₦31,500 received for order #1042."
    And the buyer receives "The owner will share the next step."

  @empty
  Scenario: A status question about an expired unpaid order reports the record truthfully
    Given order #1042 expired unpaid at 21:45
    When the buyer asks "have you received my payment?"
    Then the buyer receives "Order #1042 expired at 21:45 and no payment was received."

  # ── Concurrent / race ───────────────────────────────────────

  @concurrent
  Scenario: A status question that lands with the webhook never says payment is missing
    Given order #1042 is awaiting payment at 21:11:59
    When the buyer asks "have you received my payment?" as the verified webhook arrives at 21:12
    Then the buyer's next status answer states "₦31,500 received for order #1042"
    And the buyer receives no message saying the payment has not arrived

  @concurrent
  Scenario: Two orders paid together produce two separate confirmations
    Given order #1043 for "2 x Gold hoop earrings" with "Pickup" totals "₦15,000"
    When verified webhooks for "#1042" and "#1043" arrive at 21:12
    Then the buyer receives "Payment of ₦31,500 received for order #1042."
    And the buyer receives "Payment of ₦15,000 received for order #1043."

# ── TL;DR ────────────────────────────────────────────────────────────
# Features:          1
# Total scenarios:   15  (15 automated, 0 @manual)
# Scenarios by tag:  @happy 3, @sad 4, @permission 1, @boundary 1,
#                    @duplicate 2, @empty 2, @concurrent 2
# Path coverage:     happy, sad, validation, boundary, permission,
#                    duplicate, empty-state, concurrent
# Gaps:              None for acceptance-criteria group 9. No @validation path
#                    exists in this group because the buyer supplies no input
#                    beyond a question, which validation covers by prompt
#                    matching in group 7.
# ─────────────────────────────────────────────────────────────────────
