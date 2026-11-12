# S01 — Onboarding within one afternoon

Epic: EPIC-0005 · Stories: 1, 2 · Owner role: Spec Writer

## Criteria

| AC | Criterion (quoted from PRD) | Rules |
|---|---|---|
| AC1_01 | “The vendor can complete sign-up, WhatsApp number connection through Meta Embedded Signup, payout bank account verification, and the first inventory upload in one guided mobile-first flow.” | R1_01, R1_04 |
| AC1_02 | “The flow shows progress and resumes where the vendor left off after interruption.” | R1_02, R1_03 |
| AC1_03 | “The vendor can upload inventory in one of two ways: Paste a plain-text list in chat, one item per line with name, price, and quantity. The system parses it and shows the parsed table back for confirmation. Upload a CSV with the template we provide.” | R1_04, R1_05 |
| AC1_04 | “No inventory item goes live until the owner has confirmed the parsed result.” | R1_06 |
| AC1_05 | “Payout setup verifies that the bank account name matches the business or owner. It creates the provider sub-account or split configuration so that settlements go straight to the vendor's bank account and the platform never holds vendor funds.” | R1_07, R1_08 |
| AC1_06 | “The vendor sets these before going live: Business display name. Delivery options: named zones with fixed fees, for example "Lagos Mainland ₦3,000" and "Lekki/Ajah ₦4,500", and an optional "Pickup" with no fee. Business hours note. Owner WhatsApp number(s) for admin commands.” | R1_09 |
| AC1_07 | “Before going live, the system sends a test conversation that runs one price check and one mock order end to end. The vendor sees the result and must approve it.” | R1_10 |
| AC1_08 | “Each step's duration is instrumented, so the "live in 4 hours or less" goal can be measured from sign-up start to first real customer conversation.” | R1_11 |

## Rules

| ID | Rule | AC | Cases |
|---|---|---|---|
| R1_01 | Onboarding is one guided mobile-first flow whose steps are sign-up, WhatsApp number connection through Meta Embedded Signup, payout account verification and first inventory upload. | AC1_01 | S01_001, S01_002, S01_010, S01_M1 |
| R1_02 | The flow shows which steps are complete and which step is the current one at every point of onboarding. | AC1_02 | S01_003, S01_004 |
| R1_03 | An interrupted onboarding resumes at the step the vendor left off, with the values already saved prefilled. | AC1_02 | S01_005, S01_006, S01_026 |
| R1_04 | The vendor uploads the first inventory either as a pasted plain-text list of one item per line with name, price and quantity, or as a CSV built from the provided template. | AC1_03, AC1_01 | S01_007, happy-only: the two upload methods differ only in input, and the failure behaviour of the parser is left open by the PRD (see Gaps, AC1_03) |
| R1_05 | A parsed upload is shown back to the owner as a table of name, naira price and quantity for confirmation. | AC1_03 | S01_008, S01_009 |
| R1_06 | No inventory item is answerable to buyers until the owner confirms the parsed table. | AC1_04 | S01_011, S01_012, S01_013, S01_014 |
| R1_07 | Payout setup accepts a bank account only when the account name matches the business display name or the owner name. | AC1_05 | S01_015, S01_016 |
| R1_08 | Payout setup creates the provider sub-account or split configuration that settles payments to the vendor's own bank account. | AC1_05 | S01_017, S01_018, S01_M2 |
| R1_09 | At least one named delivery zone with a fixed naira fee is saved before go-live, and pickup is saved as an optional no-fee option. | AC1_06 | S01_019, S01_020 |
| R1_10 | Before go-live the vendor receives and approves a test conversation containing one price check and one mock order end to end. | AC1_07 | S01_021, S01_022, S01_023 |
| R1_11 | Every onboarding step records its start and completion time, and the time from sign-up start to the first real buyer message is measurable per vendor. | AC1_08 | S01_024, S01_025, S01_M3 |

## Cases

| ID | Path | Title | Setup | Action | Expected |
|---|---|---|---|---|---|
| S01_001 | happy | Onboarding completes in one session | No vendor account exists for +2348030000001 and a 12-item paste is prepared | The vendor completes the guided flow from sign-up to the confirmed inventory table | All four steps show complete; the test conversation is offered as the next step |
| S01_002 | sad | Embedded Signup fails at the WhatsApp step | Vendor +2348030000001 finished sign-up and is on the WhatsApp connection step | Meta Embedded Signup returns a provider error before the number connects | The WhatsApp step stays incomplete; the flow offers a retry on the same step |
| S01_003 | happy | Progress shows completed and current steps | Vendor +2348030000001 finished sign-up and WhatsApp connection | The vendor opens the payout verification step | Progress shows two of four steps complete; payout verification is the current step |
| S01_004 | duplicate | Continue tapped twice on one step | Vendor is on the business display name step with "Ada Styles" entered | The vendor activates Continue twice within one second | The display name is saved once; progress advances by one step only |
| S01_005 | happy | Onboarding resumes at the delivery step | Vendor +2348030000001 stopped at delivery zones with "Lagos Mainland ₦3,000" saved | The vendor reopens onboarding 20 hours later with the same number | Onboarding opens at the delivery zones step; Lagos Mainland ₦3,000 is prefilled |
| S01_006 | concurrent | Same onboarding open on two phones | Vendor +2348030000001 has the payout step open on two phones | The vendor verifies GTBank 0123456789 on the first phone while the payout step is still open on the second | One verified payout account exists; both phones show payout verification complete |
| S01_007 | happy | First inventory upload by method | Onboarding is at the inventory upload step with <input> prepared | The vendor loads the first inventory of 3 items as <input> | The parsed table shows 3 rows; each row shows the name, the naira price and the quantity from its source line |
| S01_008 | happy | Pasted list parsed into a table | Vendor has 10 pasted lines of name, price and quantity ready | The vendor pastes the 10 lines into the onboarding chat | The parsed table shows 10 rows; row 1 reads Ankara gown – L, ₦18,500, quantity 3 |
| S01_009 | boundary | Paste at the 300-SKU ceiling | Vendor has a 300-line paste ready and 300 is the stated vendor maximum | The vendor pastes all 300 lines at once | The parsed table shows 300 rows; every row is available for confirmation |
| S01_010 | empty | Zero inventory cannot finish onboarding | Vendor completed sign-up, WhatsApp connection and payout verification with no items listed | The vendor confirms an empty parsed table | The vendor is not taken live; the flow returns to inventory upload |
| S01_011 | happy | Confirmed inventory becomes answerable | A parsed table of 12 rows waits for confirmation | The vendor confirms the 12-row table | 12 SKUs become answerable; a buyer asking for Ankara gown – L is quoted ₦18,500 |
| S01_012 | sad | Unconfirmed table stays off the live inventory | A parsed table of 12 rows waits for confirmation | The vendor closes onboarding without confirming | 0 items are answerable; a buyer asking for Ankara gown – L is told it is not listed |
| S01_013 | duplicate | Confirm tapped twice on the parsed table | A parsed table of 12 rows waits for confirmation | The vendor activates Confirm twice in a row | 12 SKUs exist exactly once; one inventory-change record exists per row |
| S01_014 | concurrent | Confirm races a second upload | A parsed table of 12 rows waits for confirmation while a second CSV of 5 rows is still parsing | The vendor confirms the 12-row table during the second parse | Only the 12 confirmed rows become answerable; the 5 rows of the second upload stay unconfirmed |
| S01_015 | happy | Payout account name matches the owner | Display name "Ada Styles" is saved and GTBank 0123456789 is held by ADA OKAFOR | The vendor submits GTBank 0123456789 for verification | The account name resolves to ADA OKAFOR; the payout account is accepted |
| S01_016 | validation | Payout account name does not match | Display name "Ada Styles" is saved and GTBank 0987654321 is held by CHIEF BOLA ENTERPRISES | The vendor submits GTBank 0987654321 for verification | The account is rejected as not matching the business or owner; the vendor stays on the payout step |
| S01_017 | happy | Provider sub-account is created | Payout account GTBank 0123456789 is verified for Ada Styles | The vendor completes payout setup | A provider sub-account named Ada Styles exists; its settlement destination is GTBank 0123456789 |
| S01_018 | sad | Provider rejects sub-account creation | Payout account is verified and the payment provider returns an error on sub-account creation | The vendor completes payout setup | Payout setup stays incomplete; onboarding does not advance to the test conversation |
| S01_019 | happy | All go-live settings are saved | Vendor has the display name, two zones, an hours note and one admin number ready | The vendor saves Ada Styles, Lagos Mainland ₦3,000, Lekki/Ajah ₦4,500, Pickup at ₦0, Mon-Sat 9am-7pm and +2348030000001 | All four settings are saved; the test conversation becomes the next step |
| S01_020 | boundary | No delivery zone and no pickup | Display name, hours note and admin number are saved with zero zones and pickup off | The vendor leaves the delivery step with no delivery option | Go-live is blocked; the delivery step asks for at least one named zone with a fee |
| S01_021 | happy | Test conversation approved | One zone Lagos Mainland ₦3,000 and 12 confirmed items are saved | The vendor approves the test conversation result | The price check shows ₦18,500 for Ankara gown – L; the mock order total shows ₦21,500 and the vendor goes live |
| S01_022 | sad | Test conversation rejected | The test conversation result is on screen with the price check and mock order | The vendor rejects the test conversation result | The vendor is not taken live; onboarding returns to the inventory table for correction |
| S01_023 | duplicate | Vendor approves the test twice | The test conversation result is on screen | The vendor approves the test conversation twice | The vendor goes live once; one go-live timestamp is recorded |
| S01_024 | happy | Step durations are recorded | Vendor +2348030000001 started sign-up at 10:00 and received the first real buyer message at 13:20 | The operator opens this vendor's onboarding timing report | Every step shows a start and a completion time; the total from sign-up start to first buyer message is 3 hours 20 minutes |
| S01_025 | sad | Abandoned onboarding marks duration incomplete | Vendor +2348030000001 stopped at payout verification and never went live | The operator opens this vendor's onboarding timing report | Completed steps show durations; time to first live conversation is marked incomplete rather than 0 |
| S01_026 | permission | Resume link opened without a session | Vendor +2348030000001 left onboarding at the payout step | An unauthenticated phone opens the same resume link | The flow asks for sign-in with the registered number; no onboarding data is displayed |

## Examples

### S01_007

| input | expected |
|---|---|
| pasted plain-text list of 3 lines (Ankara gown – L 18500 3, Ankara gown – XL 20000 1, Silk scarf 4500 10) | parsed table shows those 3 names with ₦18,500, ₦20,000 and ₦4,500 and quantities 3, 1 and 10 |
| CSV from the provided template holding the same 3 items | parsed table shows those 3 names with ₦18,500, ₦20,000 and ₦4,500 and quantities 3, 1 and 10 |

## Coverage

| Path | Cases | Not applicable because |
|---|---|---|
| happy | S01_001, S01_003, S01_005, S01_007, S01_008, S01_011, S01_015, S01_017, S01_019, S01_021, S01_024 | |
| sad | S01_002, S01_012, S01_018, S01_022, S01_025 | |
| validation | S01_016 | |
| boundary | S01_009, S01_020 | |
| permission | S01_026 | |
| duplicate | S01_004, S01_013, S01_023 | |
| empty | S01_010 | |
| concurrent | S01_006, S01_014 | |

## Manual checks

| ID | Rule | How it is run | Required result |
|---|---|---|---|
| S01_M1 | R1_01 | Run the whole flow on a 375px Android Chrome window with the 12-item paste | Every step completes with no horizontal scrolling and no desktop-only control |
| S01_M2 | R1_08 | Make one real ₦100 test payment to the created sub-account and read the provider settlement report | The ₦100 settles to the vendor's GTBank 0123456789; the platform's own provider balance shows no vendor funds |
| S01_M3 | R1_11 | For the 5 vendors that went live in the pilot week, read step timings and compare with the first real buyer message timestamp | Each vendor shows four step durations and a total from sign-up start to first buyer message |

## Gaps

- AC1_01: Q2 (blocking) — the payment provider is not chosen, so the Embedded Signup partner and the provider's KYC steps inside the flow are unstated.
- AC1_03: the PRD does not state what happens to a pasted line or CSV row the parser cannot read (skip, flag on the row, or abort the upload).
- AC1_05: the remedy when the bank account name does not match is unstated (another account, manual review, or support).
- AC1_05: Q2 (blocking) — the provider's sub-account or split API, its KYC requirements and its settlement timing are unstated, so S01_017 and S01_M2 use placeholder provider behaviour.
- AC1_02: the PRD does not state whether a paused onboarding ever expires, so S01_005 resumes after 20 hours without a defined limit.
- AC1_06: whether delivery zones, hours note and admin numbers can be edited after go-live is unstated.
- AC1_06: the PRD gives no format for the business hours note, so S01_019 uses free text.
- AC1_07: the PRD does not state which item the price check uses or what the mock order contains beyond "end to end", so S01_021 fixes them from the confirmed table.

## TL;DR

- Criteria: 8 (8 with rules) · Rules: 11 · Cases: 26, all automated · Manual checks: 3
- Gaps: Q2 provider and KYC (AC1_01, AC1_05), parser failure behaviour (AC1_03), payout mismatch remedy (AC1_05), onboarding expiry (AC1_02), post-launch editing of go-live settings (AC1_06), hours note format (AC1_06), test conversation content (AC1_07)
