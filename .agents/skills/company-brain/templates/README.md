# [Company] company brain (v1)

Version 1 serves one recurring workflow: [workflow]. Add a file only when a tested
workflow needs it.

| File | Why it exists |
|---|---|
| [MAP.md](MAP.md) | Where each kind of truth lives. Pointers only, so it cannot drift into a second source of truth. |
| [policies/[workflow].md](policies/) | The rules the worker obeys, owned by [decision owner]. |
| [workers/[workflow].md](workers/) | The repeatable procedure: inputs, steps, output, stopping conditions. |
| [corrections.md](corrections.md) | Routes each correction to the file that owns it and logs who approved it. |
| [tests/](tests/) | Replay tests with git-history answer keys. A worker change is accepted only after they pass. |

## Source hierarchy

When sources conflict, the higher one wins. Record the conflict. Never reconcile it silently.

1. The decision owner's explicit, dated statement, verbatim. Calls and messages count
   only after the owner confirms the written wording.
2. The formal decision record: [where decisions are recorded].
3. Durable product or company context: [file].
4. Approved specifications and contracts: [files].
5. Technical decision records: [folder].
6. Derived summaries: [files].
7. Code and tests. Authoritative for what is built, never for what was decided.
8. Reviews, reports, commit messages.
9. Agent output, chat summaries, memory. Never authoritative until confirmed at level 1 or 2.

## Approval

[Decision owner] approves every file in `brain/`, every fact, and every decision.
Agents draft. Humans commit.
