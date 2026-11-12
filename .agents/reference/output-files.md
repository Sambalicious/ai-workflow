# Output files

Each idea gets its own numbered folder under `epics/active/`. When deployed to production, the folder moves to `epics/completed/` via the `/complete-epic` skill.

```
epics/
├── active/
│   ├── EPIC-0002-ai-git-diff-cli/
│   │   ├── prd.md
│   │   └── ...
│   └── EPIC-0003-habit-streak-app/
│       ├── prd.md
│       ├── gherkin/
│       │   ├── user-registration.feature
│       │   └── water-logging.feature
│       ├── specs/                      # optional in stage 1; replaces gherkin/ at stage 3
│       │   ├── S07-accurate-answers.md
│       │   └── S08-ordering.md
│       ├── architecture.md
│       ├── design-spec.md
│       ├── backend-spec.md
│       ├── api-contract.md            # step [4], written before implementation
│       ├── frontend-spec.md
│       ├── test-plan.md               # QA gate; tests authored in step [5e]
│       ├── devops-config.md
│       ├── threat-model.md            # step [5d]
│       ├── security-review.md         # step [7]
│       ├── design-preview.md          # step [5b] mid-task
│       ├── design-review.md
│       ├── code-review.md
│       ├── retro.md                    # /retro proposals, written at epic close
│       ├── copy-deck.md
│       ├── seo-plan.md                # crawl pass, then metadata pass
│       ├── growth-plan.md             # only with Growth opt-in
│       ├── data-plan.md               # only with Data Analyst opt-in
│       ├── pentest-report.md          # only with Pentester opt-in
│       ├── release-report.md          # only with Release Manager opt-in
│       ├── backend-spec.r1.md         ← revised after blocker
│       ├── frontend-spec.r1.md
│       ├── test-plan.r1.md
│       ├── devops-config.r1.md
│       ├── security-review.r1.md
│       ├── code-review.r1.md
│       └── release-report.r1.md       # only with Release Manager opt-in
│
└── completed/
    └── EPIC-0001-water-intake-tracker/
        └── ...                        ← deployed to production
```
