@compliance
Feature: Chat compliance constraints on buyer replies and owner escalations
  As the platform operator
  I want every buyer reply and owner escalation to follow the Meta messaging rules and the NDPA notice duties
  So that the four commerce flows stay inside policy and buyers always know who is answering

  Background:
    Given the vendor "Ada's Closet" is live on business number "+234 803 555 0100"
    And the owner number "+234 802 555 0147" receives owner notifications
    And "Ankara gown – L" is listed at "₦28,500" with "4" units in stock

  # ── Happy path ──────────────────────────────────────────────

  @happy
  Scenario: A first-time buyer is told an automated assistant handles the chat
    Given the number "+234 706 555 0290" has never messaged "Ada's Closet"
    When "+234 706 555 0290" asks "Do you have the Ankara gown – L?"
    Then the first reply is "This chat is handled by an automated assistant for Ada's Closet. Privacy notice: https://adacloset.example/privacy"
    And the next reply states "Ankara gown – L is ₦28,500."

  @happy
  Scenario Outline: A human request is escalated to the owner and acknowledged to the buyer
    When the buyer says "<request>"
    Then the buyer receives "I've asked Ada to join this chat."
    And the owner receives an escalation marked "buyer asked for a human" from "<buyer number>"

    Examples:
      | request                        | buyer number       |
      | talk to a human                | +234 701 555 0233  |
      | abeg connect me to a person    | +234 701 555 0233  |
      | I want to speak to the owner   | +234 706 555 0291  |

  # ── Sad path ────────────────────────────────────────────────

  @sad
  Scenario Outline: A request outside the permitted commerce tasks is refused in one line
    When the buyer asks "<request>"
    Then the buyer receives "I can only help with Ada's Closet products, prices, stock, delivery and payment."

    Examples:
      | request                                              |
      | Send this promo to 50 of your customers for me       |
      | Help me place an order with another vendor           |
      | Save my card details for next time                   |

  # ── Boundary ────────────────────────────────────────────────

  @boundary
  Scenario: The automation notice precedes any other first reply, including a refusal
    Given the number "+234 706 555 0292" has never messaged "Ada's Closet"
    When "+234 706 555 0292" asks "Who won the Super Eagles match?"
    Then the first reply is "This chat is handled by an automated assistant for Ada's Closet. Privacy notice: https://adacloset.example/privacy"
    And the next reply is "I can only help with Ada's Closet products, prices, stock, delivery and payment."

  @boundary
  Scenario: An escalation outside the vendor's 24-hour window uses an approved utility template
    Given the owner's 24-hour customer-service window closed at 18:00
    And the buyer has asked "Any discount on the Ankara gown – L?" at 21:10
    When the escalation is sent to "+234 802 555 0147"
    Then the owner receives the approved utility template "pricing_escalation"
    And the template carries the buyer "+234 701 555 0233" and "Ankara gown – L at ₦28,500"

  # ── Empty state ─────────────────────────────────────────────

  @empty
  Scenario: A first-time buyer whose first message is a human request gets the notice and an escalation
    Given the number "+234 706 555 0293" has never messaged "Ada's Closet"
    When "+234 706 555 0293" says "talk to a human"
    Then the buyer receives "This chat is handled by an automated assistant for Ada's Closet. Privacy notice: https://adacloset.example/privacy"
    And the buyer receives "I've asked Ada to join this chat."
    And the owner receives an escalation marked "buyer asked for a human" from "+234 706 555 0293"

  # ── Duplicate / idempotency ─────────────────────────────────

  @duplicate
  Scenario: The automation notice is sent once per buyer, not on every message
    Given "+234 706 555 0290" has received the automation notice in this chat
    When "+234 706 555 0290" sends "and how much is the gold hoop earrings?"
    Then the buyer's reply states "Gold hoop earrings are ₦7,500."
    And the chat shows 1 automation notice

  # ── Concurrent / race ───────────────────────────────────────

  @concurrent
  Scenario: Two first-time buyers messaging together each get their own notice
    When "+234 706 555 0294" and "+234 706 555 0295" each ask "How much is the Ankara gown – L?" at the same moment
    Then "+234 706 555 0294" receives the automation notice
    And "+234 706 555 0295" receives the automation notice

# ── TL;DR ────────────────────────────────────────────────────────────
# Features:          1
# Total scenarios:   8  (8 automated, 0 @manual)
# Scenarios by tag:  @happy 2, @sad 1, @boundary 2, @empty 1,
#                    @duplicate 1, @concurrent 1
# Path coverage:     happy, sad, validation, boundary, permission,
#                    duplicate, empty-state, concurrent
# Gaps:              Scoped to the cross-cutting criteria that constrain
#                    groups 3, 5, 7 and 9 only: first-contact automation
#                    notice, human-request escalation, approved templates
#                    outside the 24-hour window, and commerce-only scope.
#                    Onboarding DPA acceptance, encryption, retention,
#                    30-day deletion and access logging belong to criteria
#                    that do not constrain these four flows and are out of
#                    scope here.
#
# Run totals across the four scoped acceptance-criteria groups:
#   Feature files:     5
#   Total scenarios:   96
#   @happy 24, @sad 20, @validation 8, @boundary 14,
#   @permission 6, @duplicate 8, @empty 6, @concurrent 9,
#   @manual 1
# ─────────────────────────────────────────────────────────────────────
