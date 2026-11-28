# Invoking the full pipeline

Read this when: the user asks for the full pipeline without naming steps. Referenced from [AGENTS.md](../../AGENTS.md).

Prompt to run the complete pipeline with enabled defaults:

```
I have a product idea. Run the full startup team pipeline on it.

Idea: [your idea here]

Steps:
1. Derive the next FEAT-XXXX ID from features/active/ and features/completed/, plus a 2–4 word slug. Create features/active/FEAT-XXXX-slug/.
2. Follow AGENTS.md Instructions steps 1–8 in order, using the enabled defaults. The pipeline diagram is in .agents/reference/pipeline.md.
3. Invoke the Copywriter and the SEO Specialist only when their fast-lane triggers apply.
4. Route blockers through bounded repairs and report verification results and remaining blockers, not release approval.

Use AGENTS.md role defaults. Save enabled agents' outputs under features/active/FEAT-XXXX-slug/ and give me the verification summary.
```

To enable one role, add an explicit request such as: "Also run Growth to produce
a go-to-market plan. Keep Data Analyst and Release Manager disabled." For a
pentest, include the authorization and target: "Also run Pentester against
https://staging.example.com, authorized techniques: [...], window: [...]."
