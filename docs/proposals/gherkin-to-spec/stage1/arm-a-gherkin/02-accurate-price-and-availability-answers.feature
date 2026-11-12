@price-and-availability
Feature: Accurate price and availability answers
  As a buyer
  I want to ask about price and availability in normal chat language, English or Pidgin, and get an answer that matches the vendor's live records
  So that I can decide quickly and trust what I am told

  Background:
    Given the vendor "Ada's Closet" is live on business number "+234 803 555 0100"
    And the buyer "Tunde Bakare" chats from "+234 701 555 0233"
    And "Ankara gown – L" is listed at "₦28,500" with "4" units in stock
    And "Ankara gown – XL" is listed at "₦31,000" with "0" units in stock
    And "Gold hoop earrings" is listed at "₦7,500" with "12" units in stock
    And "Pearl drop earrings" is listed at "₦9,000" with "0" units in stock
    And the delivery zones are "Lagos Mainland ₦3,000", "Lekki/Ajah ₦4,500" and "Pickup ₦0"

  # ── Happy path ──────────────────────────────────────────────

  @happy
  Scenario: A price question in English is answered from the inventory record
    When the buyer asks "How much is the Ankara gown – L?"
    Then the buyer receives "Ankara gown – L is ₦28,500."
    And the reply is in clear English

  @happy
  Scenario: A Pidgin price question gets the same recorded price in clear English
    When the buyer asks "how much be this ankara gown L?"
    Then the buyer receives "Ankara gown – L is ₦28,500."
    And the reply is in clear English

  @happy
  Scenario: A Pidgin availability question is answered from the stock record
    When the buyer asks "ankara gown – L e dey?"
    Then the buyer receives "Yes, Ankara gown – L is available at ₦28,500."

  @happy
  Scenario Outline: A delivery-fee question is answered from the vendor's named zone
    When the buyer asks "<question>"
    Then the buyer receives "<answer>"

    Examples:
      | question                            | answer                                    |
      | How much to deliver to Lekki/Ajah?  | Delivery to Lekki/Ajah is ₦4,500.         |
      | Wetin be delivery to Lagos Mainland? | Delivery to Lagos Mainland is ₦3,000.    |
      | Can I pick it up instead?           | Yes, pickup is free.                      |

  @happy
  Scenario: An ambiguous item question lists the matching items with their prices
    When the buyer asks "How much is the ankara gown?"
    Then the buyer receives "Which one? Ankara gown – L is ₦28,500. Ankara gown – XL is ₦31,000."

  @happy
  Scenario: Several items in one question are each priced from their own record
    When the buyer asks "How much for the Ankara gown – L and the gold hoop earrings?"
    Then the buyer receives "Ankara gown – L is ₦28,500. Gold hoop earrings are ₦7,500."

  @happy
  Scenario: An out-of-stock item is reported as unavailable with a listed alternative
    When the buyer asks "Ankara gown – XL e dey?"
    Then the buyer receives "Ankara gown – XL is out of stock. Ankara gown – L is available at ₦28,500."

  @happy
  Scenario Outline: An out-of-scope request gets a one-line refusal that restates what the agent does
    When the buyer asks "<request>"
    Then the buyer receives "I can only help with Ada's Closet products, prices, stock, delivery and payment."

    Examples:
      | request                                      |
      | Who won the Super Eagles match last night?   |
      | Write me a Python script to sort a list      |
      | What is the latest naira to dollar rate?     |
      | Give me a jollof rice recipe                 |

  # ── Sad path ────────────────────────────────────────────────

  @sad
  Scenario: An item that is not listed is reported as unlisted with an offer to check
    When the buyer asks "Do you have silk scarves?"
    Then the buyer receives "Silk scarves aren't on Ada's Closet's list. Should I ask the owner to check?"
    And the agent's reply contains no currency amount

  @sad
  Scenario: An out-of-stock item with no listed alternative is simply unavailable
    When the buyer asks "You still get pearl drop earrings?"
    Then the buyer receives "Pearl drop earrings are out of stock."
    And the agent's reply contains no currency amount

  @sad
  Scenario: A reply whose amount disagrees with the looked-up value is blocked before sending
    Given the inventory record returns "₦28,500" for "Ankara gown – L"
    And the outgoing draft for "+234 701 555 0233" states "₦26,500"
    When the outgoing draft is checked against the looked-up values
    Then the buyer receives "Let me confirm that price with the owner and get back to you."
    And the blocked draft is recorded with the amount "₦26,500"

  @sad
  Scenario: A failed inventory lookup produces the safe fallback instead of a number
    Given the inventory record for "Ankara gown – L" cannot be read
    When the buyer asks "How much is the Ankara gown – L?"
    Then the buyer receives "Let me confirm that price with the owner and get back to you."
    And the agent's reply contains no currency amount

  @sad
  Scenario: A message the agent cannot understand is escalated instead of guessed
    When the buyer asks "Èló ni àwọ̀n Ankara yẹn?"
    Then the buyer receives "I couldn't understand that. Let me ask the owner to help."
    And the owner receives an escalation naming buyer "+234 701 555 0233"

  # ── Validation ──────────────────────────────────────────────

  @validation
  Scenario: An item with no price set is never given a number
    Given "Ankara gown – L" is listed with no price
    When the buyer asks "How much is the Ankara gown – L?"
    Then the buyer receives "I don't have a price for that yet. Let me ask the owner."
    And the agent's reply contains no currency amount

  @validation
  Scenario: A voice note that cannot be read is met with a typed-answer request
    Given the buyer sends a voice note that cannot be transcribed
    When the agent processes the voice note
    Then the buyer receives "Sorry, I couldn't read that. Please type your question."

  # ── Boundary ────────────────────────────────────────────────

  @boundary
  Scenario: A price asked for in another currency is answered in naira only
    When the buyer asks "How much is the Ankara gown – L in dollars?"
    Then the buyer receives "All prices are in naira. Ankara gown – L is ₦28,500."

  @boundary
  Scenario Outline: A stock question at the exact available quantity is answered precisely
    When the buyer asks "<question>"
    Then the buyer receives "<answer>"

    Examples:
      | question                          | answer                                            |
      | Do you have 4 of the Ankara gown – L? | Yes, 4 of the Ankara gown – L are available at ₦28,500. |
      | Do you have 5 of the Ankara gown – L? | Only 4 of the Ankara gown – L are available.      |

  @boundary
  Scenario: A price confirmed 10 seconds ago is the price quoted
    Given the owner confirmed "Ankara gown – L" at "₦30,000" 10 seconds ago
    When the buyer asks "How much is the Ankara gown – L?"
    Then the buyer receives "Ankara gown – L is ₦30,000."

  @boundary
  Scenario: A single price reply arrives within 20 seconds
    When the buyer asks "How much is the gold hoop earrings?"
    Then the buyer receives "Gold hoop earrings are ₦7,500." within 20 seconds

  @manual
  @boundary
  Scenario: Median reply time stays at 10 seconds and the 95th percentile at 20 seconds
    Given 500 buyer messages were received over one 24-hour period
    When reply timings are measured from message received to reply sent
    Then the median reply time is 10 seconds or less
    And the 95th percentile reply time is 20 seconds or less

  # ── Permission ──────────────────────────────────────────────

  @permission
  Scenario: A price question from a registered owner number gets an admin answer
    When the owner number "+234 802 555 0147" asks "how much is ankara gown – L?"
    Then the owner receives "Ankara gown – L — ₦28,500 — 4 in stock"
    And the reply is in the owner admin format

  # ── Duplicate / idempotency ─────────────────────────────────

  @duplicate
  Scenario: The same price question asked twice returns the same recorded price both times
    When the buyer asks "How much is the Ankara gown – L?" twice within one minute
    Then both replies state "Ankara gown – L is ₦28,500."
    And no order is created for the buyer

  # ── Empty state ─────────────────────────────────────────────

  @empty
  Scenario: A vendor with no listed items answers without inventing a catalogue
    Given the vendor "Ada's Closet" has no items listed
    When the buyer asks "What do you have in stock?"
    Then the buyer receives "The product list is empty right now. Let me ask the owner."
    And the agent's reply contains no currency amount

  # ── Concurrent / race ───────────────────────────────────────

  @concurrent
  Scenario: A price change during a conversation never produces a mixed amount in one reply
    Given the buyer has asked "How much is the Ankara gown – L?"
    And the owner confirms "Ankara gown – L" at "₦30,000" before the reply is sent
    When the agent's reply is checked against the looked-up values
    Then the buyer receives "Ankara gown – L is ₦30,000."
    And the reply contains exactly 1 currency amount

# ── TL;DR ────────────────────────────────────────────────────────────
# Features:          1
# Total scenarios:   24  (23 automated, 1 @manual)
# Scenarios by tag:  @happy 8, @sad 5, @validation 2, @boundary 4,
#                    @permission 1, @duplicate 1, @empty 1, @concurrent 1,
#                    @manual 1
# Path coverage:     happy, sad, validation, boundary, permission,
#                    duplicate, empty-state, concurrent
# Gaps:              None for acceptance-criteria group 7. Off-topic refusal is
#                    covered here because the PRD states it in this group;
#                    permitted-scope limits are in
#                    05-chat-compliance-constraints.feature.
# ─────────────────────────────────────────────────────────────────────
