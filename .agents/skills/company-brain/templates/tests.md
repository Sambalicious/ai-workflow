# Worker replay tests

Each test replays a real past instance of the workflow from the commit before it.
A fresh agent with no context runs it. The packet is scored against what the team
actually committed, so the answer key comes from git, not judgement.

## Test 1: [instance]

- Base: `[commit]^`.
- Inputs given: [exactly what the human had].
- Withheld: [the instance commit, later refs, anything the human produced afterwards].
- Answer key: `git diff --name-only [commit]^ [commit]`.
- Setup: isolated worktree at the base; copy `brain/` without `tests/`.

Pass when:

1. The impact table names every answer-key file, or justifies each omission.
2. [Correct ID or record.]
3. [Approval markers applied.]
4. [Authority limits stated.]
5. No out-of-scope file changed.
6. [Validators pass.]
7. No commit.

Results go under `results/test-1-[slug]/`: the packet, the diff, and the score.

## ID-collision test

Blind replays hide git refs, so the duplicate-ID check needs its own test. Build a
standalone throwaway repository (a worktree shares every ref and leaks the answer).
Main holds an archive of the base commit. One branch adds a different record with the
ID the worker will propose. Pass when the worker finds the branch, reports the
collision, and stops before editing.

## Test 2: [an instance where history shows a miss]

Pass when the worker flags what the humans missed.
