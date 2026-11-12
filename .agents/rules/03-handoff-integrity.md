# Rule 03 — Handoff Integrity (auto-loaded)

A handoff is only as good as its accuracy. Compressing, paraphrasing, or editorialising upstream outputs before passing them downstream corrupts the pipeline. This rule governs what gets passed whole and what gets summarised.

---

## Pass WHOLE — never summarise or paraphrase

- **spec files** — Backend Engineer, Frontend Engineer, and QA receive the full file. Every step is a binding contract. Summarising loses scenarios.
- **API contract handoff** — Frontend Engineer receives the complete handoff document from the Backend Engineer. No excerpts, no rewording of field names or types.

## Pass TL;DR + relevant sections — do not pass the full upstream output

- All other handoffs: pass the upstream agent's TL;DR plus only the sections the receiving agent specifically needs.
- The orchestrator (`AGENTS.md` under the selected factory root) is responsible for selecting the right sections — individual agents must not re-summarise on their own initiative.

## A TL;DR must be accurate, not aspirational

- Summarise what was actually decided — not what you hoped to decide.
- If a section was left open, the TL;DR must say so.
- A TL;DR that conceals an open question is a silent deviation (see Rule 10).

---

## Anti-patterns (all process defects)

- **Lossy summary** — paraphrasing a spec case rather than passing the original step text.
- **Aspirational TL;DR** — writing "auth is handled" when the auth approach is still an open question.
- **Field renaming** — passing the API contract but using different field names "for clarity."
- **Selective handoff** — omitting sections of the API contract because they seem unrelated to the current screen.

---

## Agent behaviour

When preparing a handoff:

1. Identify whether this document is on the "pass whole" list above.
2. If yes: copy it verbatim. Add no commentary.
3. If no: write a TL;DR that accurately reflects the actual state of the output, including any open items.
4. If your TL;DR would hide an open question, surface the question explicitly instead.
5. Do NOT reword field names, type definitions, or error message text from any upstream output.
