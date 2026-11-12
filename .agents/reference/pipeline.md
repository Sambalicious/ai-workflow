# Default feature pipeline

The diagram below is the reference for the default feature pipeline. Opt-in branches
(Growth, Data Analyst, Pentester, Release Manager) follow the same dependency and
repair rules; Instructions steps 4, 7, and 8 place them.

```
Your idea
   │
   ▼
[1] Product Manager ─ PRD
   │
   ├──────────────────────┬──────────────────────┐
   ▼                      ▼                      ▼
[2] spec            [3a] Architect         [3b] Product Designer
    (PRD)                   (PRD)                  (PRD)
   │                      │                      │
   │                      ├──────────┬───────────┤
   │                      │          ▼           ▼
   │                      │   [3d] SEO crawl   [3c] Copywriter*
   │                      │        pass*            (PRD + spec + design spec)
   │                      │   (architecture +       │
   │                      │    design spec)         ▼
   │                      │          │       [3e] SEO metadata pass*
   │                      │          │            (crawl pass + copy deck)
   └──────────┬───────────┘          │            │
              ▼                      │            │
[4] API Contract (Backend Engineer, contract task)│
    (PRD + spec + architecture + design spec)  │
              │                      │            │
   ┌──────────┼───────────┬──────────┼──────┬─────┴──────┐
   ▼          ▼           ▼          ▼      ▼            ▼
[5a]       [5b]         [5c]       [5d]   [5e]         (Frontend also
Backend    Frontend     DevOps     Sec.   QA test       takes copy deck
(contract) (contract,   (contract, threat authoring     + SEO metadata)
           MSW mocks;   SEO crawl  model  (spec +
           Designer     pass)             contract)
           preview
           mid-task)
   │          │           │          │      │
   └──────────┴───────────┴────┬─────┴──────┘
                               ▼
                  Integrated candidate published
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
         [6a] QA gate                  [6b] Designer review
         (runs [5e] tests on the       (screens changed since
          candidate; separate session)  the preview)
                │                             │
                └──────────────┬──────────────┘
                               ▼
                    [7] Security candidate review
                    (advisor tier, one Opus at a time)
                               │
                               ▼
                    [8] Fresh Independent Code Reviewer
                    (own first pass, then the security
                     findings as checks to confirm or refute)
                               │
                     ┌─────────┴──────────┐
                     ▼                    ▼
                  VERIFIED         Blockers → Revision loop

* Fast lane: runs only when its trigger applies (see Role activation policy).
```
