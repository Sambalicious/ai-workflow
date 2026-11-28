# The team

Read this when: deciding which role produces an artifact. Referenced from [AGENTS.md](../../AGENTS.md).

| Agent | File | Role |
|---|---|---|
| Product Manager | `.agents/product-manager.md` | Turns raw idea into a PRD |
| Spec Writer | `.agents/spec-writer.md` | Turns PRD into exhaustive spec cases |
| Architect | `.agents/architect.md` | Turns PRD into system design and key decisions |
| Product Designer | `.agents/designer.md` | Turns PRD into a design spec with blueprints, feedback matrix, and copy slots; reviews rendered screens |
| Backend Engineer | `.agents/backend-engineer.md` | Publishes the API contract first, then delivers backend implementation and tests |
| Frontend Engineer | `.agents/frontend-engineer.md` | Builds the UI against the contract in parallel with Backend, then integrates |
| QA Engineer | `.agents/qa.md` | Writes tests from spec + contract during the build; a separate QA session runs them as the gate |
| DevOps Engineer | `.agents/devops.md` | Turns architecture + API contract into infra and CI/CD config |
| Security Reviewer | `.agents/security.md` | Writes the design-time threat model on the lead tier from the architecture and contract, then reviews the actual candidate on the advisor tier against it |
| Independent Code Reviewer | `.agents/skills/code-review/SKILL.md` | Reviews the actual candidate, current QA evidence, and the security findings, after Security |
| Copywriter | `.agents/copywriter.md` | Fills the Designer's copy slots with a keyed copy deck and voice guide |
| SEO Specialist | `.agents/seo.md` | Crawl pass from architecture + design spec; metadata pass from the copy deck |
| Pentester (opt-in, advisor tier) | `.agents/pentester.md` | Attacks an authorized running candidate and reports reproduced findings |
| Growth (opt-in, lead tier) | `.agents/growth.md` | Turns PRD + architecture + design spec + backend spec into a go-to-market plan |
| Data Analyst (opt-in, lead tier) | `.agents/data-analyst.md` | Turns PRD + backend spec into a measurement and instrumentation plan |
| Release Manager (opt-in, advisor tier) | `.agents/release-manager.md` | Aggregates enabled outputs and required evidence into a go/no-go decision |
