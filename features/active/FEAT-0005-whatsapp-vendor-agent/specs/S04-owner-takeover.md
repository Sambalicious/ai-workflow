# S04 — Owner takeover

Epic: EPIC-0005 · Stories: 4 · Owner role: Spec Writer

## Criteria

| AC | Criterion (quoted from PRD) | Rules |
|---|---|---|
| AC4_01 | “The owner can pause the agent for a specific chat with a command or a one-tap action. While paused, the agent sends nothing in that chat.” | R4_01, R4_02, R4_03, R4_04 |
| AC4_02 | “Messages the owner sends to the buyer while the agent is paused are delivered from the vendor's business number.” | R4_05 |
| AC4_03 | “The owner can resume the agent with a command. The agent then continues with the chat history, including any order state the owner created.” | R4_06, R4_07 |
| AC4_04 | “A paused chat with no owner reply for 12 hours (configurable) produces a reminder to the owner. It is never auto-resumed silently.” | R4_08, R4_09 |

## Rules

| ID | Rule | AC | Cases |
|---|---|---|---|
| R4_01 | The owner pauses the agent for one named chat with a command from a registered owner number. | AC4_01 | S04_001, S04_002, S04_003 |
| R4_02 | The owner pauses the agent for one chat with a one-tap action. | AC4_01 | S04_004, S04_005 |
| R4_03 | While a chat is paused the agent sends nothing in that chat except the payment confirmation for a verified payment webhook. | AC4_01 | S04_006, S04_007, S04_023, S04_024, S04_025 |
| R4_04 | A pause applies to the named chat only. | AC4_01 | S04_008, S04_009 |
| R4_05 | A message the owner sends to the buyer while the chat is paused is delivered from the vendor's business number. | AC4_02 | S04_010, S04_011, S04_M1 |
| R4_06 | The owner resumes the agent with a command and the agent continues from the existing chat history. | AC4_03 | S04_012, S04_013, S04_014, S04_015 |
| R4_07 | After a resume the agent keeps any order state the owner created in that chat. | AC4_03 | S04_016, S04_017 |
| R4_08 | A paused chat with no owner reply produces a reminder to the owner once the configured interval, default 12 hours, has passed. | AC4_04 | S04_018, S04_019, S04_020 |
| R4_09 | A paused chat is never resumed without an owner resume command. | AC4_04 | S04_021, S04_022 |

## Cases

Fixture note: #1043 in this file is the order the owner created during a pause, 1 × Ankara gown – XL at ₦20,000. Order numbers are local to each spec.

| ID | Path | Title | Setup | Action | Expected |
|---|---|---|---|---|---|
| S04_001 | happy | Pause by command | Chat with +2348030000002 is active and the agent is answering, and +2348030000001 is a registered owner number | The owner sends "pause" | The chat is paused; the owner sees the chat marked as paused |
| S04_002 | permission | Buyer tries to pause the agent | Chat with +2348030000002 is active and the agent is answering | +2348030000002 sends "pause" | The chat stays active; the reply contains no confirmation that the agent was paused |
| S04_003 | duplicate | Pause command sent twice | Chat with +2348030000002 is active and the owner is about to pause it | The owner sends "pause" twice | The chat is paused once; one pause record exists for it |
| S04_004 | happy | Pause by one-tap action | Chat with +2348030000003 is active in the owner's chat list | The owner presses Pause on that chat | The chat is paused; the owner sees the chat marked as paused |
| S04_005 | concurrent | Pause pressed while a reply is being sent | Chat with +2348030000003 is active and the agent is composing a reply at 10:00:00 | The owner presses Pause at 10:00:00 | The chat is paused; no agent reply is sent after the pause is recorded |
| S04_006 | happy | Agent silent during a pause | Chat with +2348030000002 is paused | The buyer sends three messages in that chat | The agent sends nothing in that chat across all three messages |
| S04_007 | concurrent | Buyer message arrives as the pause lands | Chat with +2348030000002 is active and the buyer sends "is it still available?" at 10:00:00 | The owner's pause is recorded at 10:00:00 | No agent reply is sent after the pause is recorded; the chat shows the buyer message as unanswered by the agent |
| S04_008 | boundary | Other chats keep the agent | Chat with +2348030000002 is paused and a chat with +2348030000003 is active | The buyer +2348030000003 asks the price of Silk scarf | The agent answers +2348030000003 with the listed ₦4,500; the paused chat stays silent |
| S04_009 | validation | Pause naming a chat that does not exist | The vendor's chats are only with +2348030000002 and +2348030000003 | The owner sends "pause +2348099999999" | No pause is created; the owner is told that number has no chat |
| S04_010 | happy | Owner reply comes from the business number | Chat with +2348030000002 is paused | The owner sends "yes, we have it in blue" from +2348030000001 | The buyer receives the message from the vendor's business number |
| S04_011 | permission | Message from an unregistered number while paused | Chat with +2348030000002 is paused and +2348030000004 is not a registered owner number | +2348030000004 sends "yes, we have it in blue" to the buyer | The buyer receives nothing from the vendor's business number; the chat stays paused |
| S04_012 | happy | Resume continues the same chat | Chat with +2348030000002 is paused after the buyer asked for Ankara gown – L | The owner sends "resume" and the buyer asks "so do you have size L?" | The agent replies in the same chat with the listed ₦18,500 and quantity 5; no new chat is created |
| S04_013 | permission | Buyer tries to resume the agent | Chat with +2348030000002 is paused | +2348030000002 sends "resume" | The chat stays paused; the sender receives no agent reply |
| S04_014 | sad | Resume sent to a chat that is not paused | Chat with +2348030000002 is active and the agent is answering | The owner sends "resume" | The chat stays active; the owner is told the agent was never paused there |
| S04_015 | duplicate | Resume command sent twice | Chat with +2348030000002 is paused | The owner sends "resume" twice | The chat is resumed once; one resume record exists |
| S04_016 | happy | Owner-created order survives the resume | Chat with +2348030000003 is paused and the owner created order #1043 for 1 Ankara gown – XL at ₦20,000 during the pause | The owner sends "resume" and the buyer asks "how much do I owe?" | The agent answers ₦20,000 for order #1043; no second order is created |
| S04_017 | sad | Buyer pays while the agent is paused | Chat with +2348030000003 is paused with owner-created order #1043 at ₦20,000 | The buyer sends "I've paid, check" | The agent sends nothing in the paused chat; the owner is the only sender in that chat |
| S04_018 | boundary | Reminder not yet due | Chat with +2348030000002 was paused at 09:00 with no owner reply since | The clock reaches 20:59 | No reminder has been sent; the chat stays paused |
| S04_019 | boundary | Reminder due at 12 hours | Chat with +2348030000002 was paused at 09:00 with no owner reply since | The clock reaches 21:00 | A reminder naming +2348030000002 reaches the owner; the chat stays paused |
| S04_020 | boundary | Reminder follows the configured interval | Chat with +2348030000002 was paused and the vendor's reminder interval is set to 6 hours | The clock reaches 6 hours with no owner reply | A reminder reaches the owner; no reminder was sent at 5 hours 59 minutes |
| S04_021 | sad | Chat stays paused without a resume | Chat with +2348030000002 is paused and the buyer has sent 20 messages over 24 hours | The buyer sends a 21st message | The agent sends nothing; the chat is still paused |
| S04_022 | concurrent | Reminder crosses the owner's own reply | Chat with +2348030000002 is paused at 12 hours with the reminder being composed | The owner sends a reply to the buyer at that moment | The chat stays paused until a resume command; the reminder does not resume the agent |
| S04_023 | happy | Paused chat still gets the confirmation, window open | Chat with +2348030000003 is paused with owner-created order #1043 at ₦20,000 and the buyer's last message was at 09:30 today | The verified payment webhook for #1043 for ₦20,000 arrives at 10:00:00 | The buyer has the payment confirmation in chat by 10:00:59, stating ₦20,000 and order #1043; the chat stays paused |
| S04_024 | boundary | Paused chat still gets the confirmation, window closed | Chat with +2348030000003 is paused with owner-created order #1043 at ₦20,000 and the buyer's last message was at 09:00 yesterday | The verified payment webhook for #1043 for ₦20,000 arrives at 09:01 today | The buyer receives an approved utility template naming ₦20,000 and order #1043; no free-form message is sent; the chat stays paused |
| S04_025 | permission | Paused chat gets no price answer | Chat with +2348030000002 is paused and Silk scarf is listed at ₦4,500 | The buyer sends "how much is the Silk scarf?" | The agent sends nothing in that chat; the chat is still paused |

## Coverage

| Path | Cases | Not applicable because |
|---|---|---|
| happy | S04_001, S04_004, S04_006, S04_010, S04_012, S04_016, S04_023 | |
| sad | S04_014, S04_017, S04_021 | |
| validation | S04_009 | |
| boundary | S04_008, S04_018, S04_019, S04_020, S04_024 | |
| permission | S04_002, S04_011, S04_013, S04_025 | |
| duplicate | S04_003, S04_015 | |
| empty | | a chat holds at least one buyer message before any pause can be requested, so there is no empty-chat pause |
| concurrent | S04_005, S04_007, S04_022 | |

## Manual checks

| ID | Rule | How it is run | Required result |
|---|---|---|---|
| S04_M1 | R4_05 | Pause a test chat, send two replies from the registered owner phone, and read both on a buyer phone | Both messages show the vendor's business number as the sender and show no personal number |

## Gaps

- AC4_01: Q1 (blocking) — whether takeover happens in the WhatsApp Business app through coexistence or in the web inbox is undecided, so the case set is written against the observable behaviour and not against a surface.
- AC4_01: the exact pause and resume command words are unstated, and whether natural phrasing is accepted is unstated.
- AC4_01 with AC5_07: resolved by the product owner's decision that a verified payment webhook's confirmation is sent even while paused (R4_03, R5_15, R5_16); S04_023, S04_024 and S04_025 prove the exception is narrow.
- AC4_02: whether owner replies are possible at all when the 24-hour customer-service window is closed is unstated.
- AC4_03: whether the owner can resume on a schedule, and whether an owner reply alone ever resumes the agent, is unstated.
- AC4_04: the allowed range for the configurable reminder interval is unstated, and whether the reminder repeats is unstated.
- AC4_01: what a buyer who sends a pause command is told is unstated, so S04_002 asserts the unchanged chat state and the absence of a pause confirmation, not the reply's shape. Owner: PM, with wording from the Copywriter.

## TL;DR

- Criteria: 4 (4 with rules) · Rules: 9 · Cases: 25, all automated · Manual checks: 1
- Gaps: Q1 takeover channel (AC4_01), pause and resume command wording (AC4_01), pause versus payment confirmation conflict resolved by decision (AC4_01 with AC5_07), owner replies outside the 24-hour window (AC4_02), resume triggers (AC4_03), reminder interval range and repetition (AC4_04), reply shape for a buyer pause command (AC4_01)
