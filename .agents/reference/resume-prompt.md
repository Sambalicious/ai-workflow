# Resume prompt

Use this to start a fresh orchestrator session after a repair wave closes or a session
limit resets.

```
Continue EPIC-XXXX-slug from epics/active/EPIC-XXXX-slug/CURRENT.md. Read only that
file first. It lists the gate status, open blockers, and the next step.

Do not re-run gates that already passed on the current candidate. Dispatch only the
pending gates and the open repairs. Keep at most two Opus sessions running at once.
Report verification results and unresolved blockers when the run ends.
```
