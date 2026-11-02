# Policy: [workflow] (v1)

Owner: [decision owner]. Changing this policy needs their approval.

1. Only [decision owner] makes [decision type]. Agent, reviewer, or orchestrator
   proposals are recorded as PROPOSED, never as decided.
2. Every record has an ID, the owner's verbatim words or exact chosen option, the date,
   the decider, what it affects, and what it does not authorise.
3. Record when the owner chose against a recommendation.
4. A decision never clears an evidence, legal, or compliance gate.
5. New customer-facing text stays PENDING until [approver] approves it. Only they flip it.
6. A change to durable direction adds a dated amendment line. History is not rewritten.
7. A correction to a company statement is recorded as a decision, then propagated in
   source-hierarchy order. Test fixtures are excluded unless they make a claim about the company.
8. Mirror tables stay in sync, or the gap is listed as a follow-up.
9. IDs on a branch are provisional. Check against the main branch before merge. No two
   records share an ID.
10. Work that changes code, tests, or contracts goes to [implementation process].
11. Decisions from calls or messages are recorded only after the owner confirms the wording.
12. A direct contradiction with a durable rule stops for the owner. An unresolved
    interaction is recorded as an open question with dependent text marked PROPOSED.
