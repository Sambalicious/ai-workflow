# Worker: [workflow] (v1)

Follows [the policy](../policies/[workflow].md). Uses [MAP.md](../MAP.md) to find sources.

## Inputs

All are required. If any is missing, stop and ask.

- [Primary input, verbatim]
- [Owner, date]
- [Scope: which project, epic, or area]
- `BASE` commit and an isolated `WORKDIR` worktree on a [docs/] branch
- Optional: [context, such as the recommendation offered]

## Reading budget

Read sections, not whole files. Large documents are most of a run's cost.

- Read a whole file only when it is under 15 KB, plus the brain files.
- For a larger file: list its headings, then read only the needed sections by line range.
  To find other mentions, search with a few lines of context instead of opening the file.
- Read contracts and other very large references through search hits only.
- If a section needs more context, read the next section, not the whole file.
- Log every read in packet section 10.

## Steps

1. Read MAP.md and the policy, then only the sections of each source the scope needs.
2. Classify the input.
3. [Assign an ID / locate the record.]
4. Draft the primary record.
5. Build the impact list. For every MAP source, decide changed or unaffected.
6. Apply in-scope edits in `WORKDIR`. Mark everything not in the input with one
   fixed marker per artifact type, for example a `@proposed` scenario tag that the
   project's validator accepts, or "(PROPOSED, pending owner approval)" on a criterion.
   Only the owner's commit removes a marker.
7. Run [validators].
8. Write the packet and stop.

## Output: packet

1. Primary record.
2. Impact table: file, section, change, type.
3. Checked and unaffected, with a reason for each.
4. Items pending owner approval.
5. Out-of-scope impact, routed and not done.
6. Validator commands and results.
7. Open questions and conflicts with higher sources.
8. `git diff --stat`.
9. Stop conditions passed: each condition that applied, whether the worker stopped or
   continued, who told it to continue, and what was marked PROPOSED as a result.
10. Read log: each file read, line ranges, reason, and total characters read.

## Stopping conditions

- Required input missing, or wording unconfirmed by the owner: stop and ask.
- Conflict with a durable rule or a gate: stop and ask.
- Finishing would require inventing a rule or value: record it as PROPOSED and say so.
- ID collision: stop.
- Out-of-scope files: list, do not edit.
- Done when every impacted file is edited or listed as unaffected, validators pass, and
  the packet is written.
- A caller may let the worker continue past a stop condition, but the worker must
  still report it in packet section 9.
- Never commit, push, merge, or flip an approval marker.
