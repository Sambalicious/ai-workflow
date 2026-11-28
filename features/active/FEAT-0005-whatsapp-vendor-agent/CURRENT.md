# CURRENT — EPIC-0005 WhatsApp Vendor Agent

Digest of the latest revision of every artifact. Read this before opening a spec,
then open only the section a task needs. Older `.rN` files are superseded.

**Lane:** full. **Stage:** specs authored, no contract or implementation yet.
**Product:** a WhatsApp-native sales agent for solo and small online vendors in
Lagos, running on the vendor's own WhatsApp Business number via the Cloud API.

## Read order

1. PRD TL;DR (line 234) — the whole product in 20 lines.
2. PRD Acceptance criteria (line 102) — the AC IDs every spec cites.
3. The one spec for your task, from the index below.

## Artifacts

| Artifact | File | Size | Source of |
|---|---|---|---|
| PRD | `prd.md` | 243 lines | Goals, non-goals, AC groups |
| Specs | `specs/S01`–`S11` | 1,145 lines | Criteria, rules, cases, coverage |
| Test plan | **removed from the repo** | — | Regenerable; lives under the run root |

## PRD index (`prd.md`)

| Section | Line |
|---|---|
| Problem statement | 3 |
| Goals | 7 |
| Non-goals | 17 |
| Future backlog | 24 |
| Target users | 67 |
| User stories | 81 |
| Acceptance criteria | 102 |
| Assumptions | 210 |
| Open questions | 226 |
| TL;DR | 234 |

## Spec index (`specs/`)

Each spec uses the same shape: Criteria, Rules, Cases, Examples (some),
Coverage, Manual checks, Gaps (some).

| ID | Objective | Lines | Cases | Gaps |
|---|---|---|---|---|
| S01 | Onboarding within one afternoon | 109 | 34 | — |
| S02 | Inventory management over WhatsApp | 129 | 39 | — |
| S03 | Pricing escalation | 115 | 32 | — |
| S04 | Owner takeover | 92 | 28 | yes |
| S05 | Automatic payment confirmation and manual override | 124 | 38 | — |
| S06 | Paid-order notifications and order list | 95 | 26 | — |
| S07 | Accurate price and availability answers | 116 | 34 | — |
| S08 | Ordering and invoicing | 94 | 31 | yes |
| S09 | Buyer payment confirmation | 78 | 22 | — |
| S10 | Billing and cost tracking | 97 | 27 | — |
| S11 | Cross-cutting compliance | 96 | 31 | yes |

## Invariants the code must not break

These come from the PRD's non-goals and are restated as rules in the specs. A
change that violates one is a blocker, not a trade-off.

- The agent answers only from the live inventory record. Zero invented prices or
  stock, enforced by deterministic lookups plus a check on every outgoing reply
  (S07).
- No autonomous pricing. No discount, negotiation, bundle or custom quote; every
  such request escalates to the owner and pauses the agent on that thread (S03).
- An order is paid only on a verified payment-provider webhook. A screenshot,
  SMS or buyer claim never marks an order paid (S05, S09).
- Webhook handling is idempotent. A replayed event never double-decrements stock
  or re-notifies (S05).
- Only commerce tasks are performed. Anything else is declined, as Meta policy
  requires (S11).
- Onboarding completes in 4 hours or less (S01).
- NDPA data-protection obligations are met (S11).

## Blocking questions (PRD line 226)

Four block implementation, all owned by the founder, not the engineers:

1. Owner-takeover channel: WhatsApp Business app coexistence or our web inbox.
   Changes the architecture and the onboarding flow. (S04, S11)
2. First payment provider: Monnify, Paystack or Flutterwave. Decides the
   per-order virtual account and split settlement. (S05, S10)
3. Price points: monthly fee, per-order fee, trial length, who bears the provider
   fee. (S10)
4. Legal: whether split settlement needs a payments licence, NDPC registration,
   and data-residency requirements. (S11)

## Open gaps

- **S04:** takeover surface undecided (Q1), pause/resume command words unstated,
  owner-reply behaviour outside the 24-hour window unstated.
- **S08:** cart lifetime and concurrent carts unstated, buyer name mandatory or
  profile-derived unstated, address edits after invoice unstated, expiry range
  unstated, re-issue pricing after expiry unstated.
- **S11:** AC11_01 numbering needs PM confirmation, template set not enumerable
  until the messaging partner is chosen, human-request phrase set not listed.

## Evidence

Test output, logs and screenshots belong under `RUN_ROOT/reports/` and
`RUN_ROOT/logs/`, passed by path. The repository holds the spec and the numbered
revisions only.
