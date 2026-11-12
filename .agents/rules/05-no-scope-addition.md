# Rule 05 — No Scope Addition (auto-loaded)

Every agent in this pipeline operates within the scope defined by the PRD. An agent that adds a feature, endpoint, screen, or test case not traceable to a PRD user story is silently expanding scope — creating work no one approved and breaking the coverage maps downstream agents depend on.

---

## STOP and flag when any of these is true

- An agent wants to add an endpoint not required by any spec case or PRD user story.
- A designer wants to add a screen not mapped to a user story.
- A QA engineer wants to add test cases for behaviour not in the spec.
- A DevOps engineer wants to add infrastructure not required by the engineering spec.
- Any agent uses the phrase "while we're here" or "it would also make sense to add."

## Do NOT flag when

- The addition is required to satisfy an existing spec case the agent missed on first read — add it and note the omission.
- The addition is a standard implementation detail (e.g. a health check endpoint, a 404 handler) not worth a PRD user story.
- The addition is flagging a missing requirement for the PM to decide on — that is correct escalation, not scope addition.

---

## How to handle a scope addition impulse

If you notice something that should exist but doesn't:

1. Do NOT add it to the current output.
2. Add it to the **Future backlog** section if you are the Product Manager, or to the **Known risks and trade-offs** section if you are an engineer.
3. Flag it with `📌 POST-LAUNCH` so downstream agents and the Release Manager can track it.

---

## Anti-patterns (all process defects)

- **Stealth feature** — implementing something not in the PRD without flagging it.
- **Defensive endpoint** — "we'll probably need this later" endpoint added to the API contract.
- **Test inflation** — writing test cases for behaviour the product does not currently have.
- **Infrastructure over-provisioning** — standing up services not required by the v1 spec.

---

## Agent behaviour

If you (an agent) feel the impulse to add something beyond your inputs:

1. Ask: is this traceable to a PRD user story or spec case?
2. If yes: add it. It is in scope.
3. If no: do not add it. Flag it with `📌 POST-LAUNCH` in the appropriate section.
4. Do NOT add it "just in case" and omit the flag.
5. Do NOT add it and note it only in a comment buried in skeleton code.
