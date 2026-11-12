@payments
Feature: Automatic payment confirmation and manual override
  As a vendor owner
  I want orders confirmed paid only from a verified payment-provider webhook, with a manual override for edge cases
  So that fake transfer alerts cannot cost me goods and I can still fix what the provider gets wrong

  Background:
    Given the vendor "Ada's Closet" is live with invoice expiry of 60 minutes
    And the buyer "Tunde Bakare" chats from "+234 701 555 0233"
    And the buyer's 24-hour customer-service window is open
    And order #1042 for "1 x Ankara gown – L" with "Lekki/Ajah" delivery totals "₦31,500"

  # ── Happy path ──────────────────────────────────────────────

  @happy
  Scenario: An invoice carries a payment destination tied to that order
    When order #1042 is invoiced at 20:45
    Then the invoice shows account "7034567890" at "Wema Bank" for exactly "₦31,500"
    And the invoice shows the expiry "21:45"
    And the invoice shows order number "#1042"

  @happy
  Scenario: Two open orders never share a payment destination
    Given order #1042 is invoiced at 20:45
    And order #1043 for "2 x Gold hoop earrings" with "Pickup" totals "₦15,000"
    When order #1043 is invoiced at 20:47
    Then order #1043 shows a different account number from "7034567890"
    And order #1043 shows the amount "₦15,000"

  @happy
  Scenario: A verified webhook marks the order paid
    Given the provider sends a webhook for order #1042 with a valid signature at 21:12
    And the server-side transaction lookup returns "₦31,500" against reference "#1042"
    When the webhook is processed
    Then order #1042 is marked paid at 21:12
    And the payment record is labelled automatic

  @happy
  Scenario: The owner marks an order paid manually with a reason
    Given order #1042 is awaiting payment
    When the owner number "+234 802 555 0147" sends "mark 1042 paid, bank alert never arrived"
    Then order #1042 is marked paid
    And the override records owner "+234 802 555 0147", the time, and the reason "bank alert never arrived"
    And order #1042 is labelled manual in the order list

  @happy
  Scenario: The owner marks a paid order unpaid manually
    Given order #1042 was marked paid by webhook at 21:12
    When the owner number "+234 802 555 0147" sends "mark 1042 unpaid"
    Then order #1042 returns to awaiting payment
    And order #1042 is labelled manual in the order list
    And the earlier webhook confirmation stays in the order history

  @happy
  Scenario: A confirmation is sent in chat within 60 seconds of the webhook
    Given the buyer's 24-hour customer-service window is open
    When the verified webhook for order #1042 arrives at 21:12
    Then the buyer receives a confirmation by 21:13

  # ── Sad path ────────────────────────────────────────────────

  @sad
  Scenario: A webhook with an invalid signature changes nothing
    Given the provider sends a webhook for order #1042 at 21:12
    And the signature does not match the computed signature
    When the webhook is processed
    Then order #1042 stays awaiting payment
    And the buyer receives no payment confirmation

  @sad
  Scenario: A validly signed webhook with no matching transaction is not trusted
    Given the provider sends a webhook for order #1042 with a valid signature at 21:12
    And the server-side transaction lookup finds no transaction for reference "#1042"
    When the webhook is processed
    Then order #1042 stays awaiting payment
    And the verification failure is recorded against order #1042

  @sad
  Scenario Outline: Buyer proof of payment alone never changes payment status
    Given order #1042 is awaiting payment
    When the buyer sends "<proof>"
    Then the buyer receives "I'm waiting for bank confirmation for order #1042. I'll message you as soon as it lands."
    And order #1042 stays awaiting payment
    And the owner receives a payment-proof notification for order #1042

    Examples:
      | proof                                                          |
      | a screenshot of a bank transfer of ₦31,500                     |
      | "Credit alert: NGN31,500.00 from TUNDE BAKARE 21:05" as text    |
      | a PDF receipt named "transfer-1042.pdf"                        |

  @sad
  Scenario: An underpayment puts the order into the underpayment review state
    Given the provider sends a webhook for order #1042 with a valid signature at 21:12
    And the server-side transaction lookup returns "₦30,000" for reference "#1042"
    When the webhook is processed
    Then order #1042 enters the state "needs review — underpayment"
    And the owner is notified of a shortfall of "₦1,500"
    And the buyer receives "The owner will follow up on your payment for order #1042."

  @sad
  Scenario: An overpayment puts the order into the overpayment review state
    Given the provider sends a webhook for order #1042 with a valid signature at 21:12
    And the server-side transaction lookup returns "₦33,000" for reference "#1042"
    When the webhook is processed
    Then order #1042 enters the state "needs review — overpayment"
    And the owner is notified of an excess of "₦1,500"

  @sad
  Scenario: A payment arriving after invoice expiry enters its own review state
    Given order #1042 expired unpaid at 21:45 and its reserved stock was released
    When a verified webhook for "₦31,500" against reference "#1042" arrives at 22:10
    Then order #1042 enters the state "needs review — payment after expiry"
    And the owner is notified with the payment time 22:10
    And the buyer receives "The owner will follow up on your payment for order #1042."

  @sad
  Scenario: A failed virtual-account creation falls back to a hosted payment link
    Given the payment provider returns an error when asked for an account for order #1042
    When order #1042 is invoiced at 20:45
    Then the invoice shows a hosted payment link instead of an account number
    And the invoice still shows the amount "₦31,500" and the expiry "21:45"

  # ── Validation ──────────────────────────────────────────────

  @validation
  Scenario: A webhook with no signature is rejected
    Given the provider sends a webhook for order #1042 at 21:12 with no signature
    When the webhook is processed
    Then order #1042 stays awaiting payment
    And the unverified webhook is recorded against order #1042

  @validation
  Scenario: An owner override with no order number changes no order
    When the owner number "+234 802 555 0147" sends "mark paid"
    Then the owner receives "Which order should I mark? Reply with the order number."
    And order #1042 stays awaiting payment

  @validation
  Scenario: An owner override for an unknown order changes no order
    When the owner number "+234 802 555 0147" sends "mark 9999 paid"
    Then the owner receives "I can't find order #9999."
    And order #1042 stays awaiting payment

  # ── Permission ──────────────────────────────────────────────

  @permission
  Scenario: An override from an unregistered number is handled as a customer message
    When "+234 809 555 0199" sends "mark 1042 paid"
    Then order #1042 stays awaiting payment
    And "+234 809 555 0199" receives a customer reply instead of an admin confirmation

  @permission
  Scenario: A webhook naming another vendor's reference is ignored
    Given the provider sends a validly signed webhook at 21:12 with reference "VID-7781"
    And "VID-7781" belongs to another vendor's order
    When the webhook is processed
    Then order #1042 stays awaiting payment
    And no order in "Ada's Closet" changes payment status

  # ── Boundary ────────────────────────────────────────────────

  @boundary
  Scenario Outline: The expiry boundary decides between confirmation and review
    Given order #1042 expires unpaid at 21:45
    When a verified webhook for "₦31,500" arrives at <payment time>
    Then order #1042 is <result>

    Examples:
      | payment time | result                                       |
      | 21:45        | marked paid                                  |
      | 21:46        | in the state "needs review — payment after expiry" |

  @boundary
  Scenario: One naira short of the invoice total is a review case, not a confirmation
    Given the provider sends a webhook for order #1042 with a valid signature at 21:12
    And the server-side transaction lookup returns "₦31,499" for reference "#1042"
    When the webhook is processed
    Then order #1042 enters the state "needs review — underpayment"
    And the buyer receives no payment confirmation

  @boundary
  Scenario: A closed 24-hour window sends the confirmation as an approved utility template
    Given the buyer's 24-hour customer-service window closed at 18:00
    When the verified webhook for order #1042 arrives at 21:12
    Then the buyer receives the approved utility template "order_paid_confirmation" by 21:13
    And the template carries the amount "₦31,500" and order number "#1042"

  # ── Empty state ─────────────────────────────────────────────

  @empty
  Scenario: An owner with nothing to review is told so
    Given no order is in any "needs review" state
    When the owner number "+234 802 555 0147" asks "needs review"
    Then the owner receives "No orders need review."

  # ── Duplicate / idempotency ─────────────────────────────────

  @duplicate
  Scenario: A duplicate webhook confirms the order once
    Given the verified webhook for order #1042 was processed at 21:12
    When the provider delivers the identical webhook again at 21:13
    Then order #1042 has 1 payment record
    And the buyer has received 1 payment confirmation
    And the owner has received 1 paid-order notification

  @duplicate
  Scenario: A webhook replayed long after confirmation changes no totals
    Given order #1042 was marked paid at 21:12 and its stock was decremented once
    When the identical webhook is delivered again at 21:32
    Then order #1042 is still paid at 21:12
    And "Ankara gown – L" available stock is unchanged at "3"
    And the buyer has received 1 payment confirmation

  # ── Concurrent / race ───────────────────────────────────────

  @concurrent
  Scenario: Two identical webhooks arriving together produce one payment
    When two identical verified webhooks for order #1042 arrive at 21:12 in the same second
    Then order #1042 has 1 payment record
    And the buyer has received 1 payment confirmation

  @concurrent
  Scenario: An owner override racing a webhook leaves the order paid exactly once
    Given order #1042 is awaiting payment
    When the owner sends "mark 1042 paid, bank alert never arrived" and the verified webhook arrives in the same second
    Then order #1042 is marked paid once
    And the override record for "+234 802 555 0147" is stored once
    And "Ankara gown – L" available stock is decremented once

  @concurrent
  Scenario: Two orders paid from one bank account at the same moment are confirmed separately
    Given order #1043 for "2 x Gold hoop earrings" totals "₦15,000"
    When verified webhooks for "#1042" and "#1043" arrive at 21:12
    Then order #1042 is marked paid for "₦31,500"
    And order #1043 is marked paid for "₦15,000"

# ── TL;DR ────────────────────────────────────────────────────────────
# Features:          1
# Total scenarios:   27  (27 automated, 0 @manual)
# Scenarios by tag:  @happy 6, @sad 7, @validation 3, @boundary 3,
#                    @permission 2, @duplicate 2, @empty 1, @concurrent 3
# Path coverage:     happy, sad, validation, boundary, permission,
#                    duplicate, empty-state, concurrent
# Gaps:              None for acceptance-criteria group 5. The buyer's
#                    confirmation content is specified in
#                    04-buyer-payment-confirmation.feature; only its
#                    channel and timing rule is asserted here.
# ─────────────────────────────────────────────────────────────────────
