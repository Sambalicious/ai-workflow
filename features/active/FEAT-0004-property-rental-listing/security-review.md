# Security Review: Property Rental Listing Feature (EPIC-0004)

---

## Threat model

| Actor                | Attack vector                                      | Potential impact                | Likelihood |
|----------------------|----------------------------------------------------|----------------------------------|------------|
| External attacker    | Exploit weak JWT secret or misconfigured auth      | Account takeover, data breach    | Medium     |
| Malicious user       | Abuse property listing (e.g., spam, fake listings) | Platform abuse, reputation loss  | Medium     |
| Compromised insider  | Access secrets in CI/CD or Render dashboard        | Data exfiltration, service loss  | Low        |
| Curious employee     | Access logs or backups with sensitive data         | Privacy violation                | Low        |
| Automated bot        | Enumerate/search endpoints, scrape listings        | Data scraping, DoS               | Medium     |

---

## Vulnerability findings

| ID      | Severity | Component         | Description                                                                 | Recommended fix                                                      |
|---------|----------|------------------|-----------------------------------------------------------------------------|-----------------------------------------------------------------------|
| SEC-001 | High     | Auth (JWT)       | JWT secret is a single env var; weak/guessable secret risks compromise      | Enforce strong, random JWT secrets; rotate regularly                  |
| SEC-002 | Medium   | Input validation | No explicit mention of input sanitization for property fields               | Validate/sanitize all user input (title, description, address, etc.)  |
| SEC-003 | Medium   | Authorization    | Route-level middleware, but risk of logic bugs or missing checks            | Centralize and test all authz logic; add negative tests               |
| SEC-004 | Medium   | Secrets mgmt     | Secrets in GitHub/Render env vars; risk if access is too broad              | Restrict access, audit usage, rotate secrets on role change           |
| SEC-005 | Medium   | Dependency mgmt  | Uses npm/Prisma/Express; supply chain risk                                  | Enable Dependabot/Snyk, pin versions, review transitive deps          |
| SEC-006 | Low      | Infra exposure   | Render exposes app on public URL; no rate limiting or WAF                   | Add rate limiting, consider WAF/CDN for public endpoints              |
| SEC-007 | Low      | Logging          | Logs to console; risk of sensitive data in logs                             | Scrub logs for secrets/tokens; restrict log access                    |
| SEC-008 | Low      | Backups          | Backups managed by Render; risk if restore access is not tightly controlled | Limit backup access, audit restores                                   |

---

## Authentication and authorization review
- **Sessions:** Stateless JWTs, validated in Express middleware. No session store (good for scale, but token revocation is hard).
- **Password/credentials:** Not described in detail; assumed handled by upstream login. JWT secret is critical—must be strong and rotated.
- **Authorization:** Route-level middleware enforces owner/tenant roles. Risk if middleware is omitted or logic is faulty. No mention of admin flows (good—minimize privilege).
- **Bypass risk:** If middleware is not applied to all routes, privilege escalation is possible. Automated tests for negative cases are needed.

---

## Secrets and credentials review
| Secret/env var                | Handling (current)                | Acceptable? | Needs change? |
|-------------------------------|-----------------------------------|-------------|---------------|
| DATABASE_URL                  | GitHub/Render env var             | Yes         | Rotate on role change, restrict access |
| JWT_SECRET                    | GitHub/Render env var             | Yes, if strong | Must be strong/random, rotate regularly |
| RENDER_DEPLOY_HOOK_STAGING    | GitHub secret                     | Yes         | Rotate if leaked, restrict access |
| RENDER_DEPLOY_HOOK_PROD       | GitHub secret                     | Yes         | Rotate if leaked, restrict access |
| DOCKERHUB_TOKEN               | GitHub secret                     | Yes         | Rotate if leaked, restrict access |

- All secrets are in env vars, not code. Acceptable if access is tightly controlled and secrets are rotated on personnel changes.

---

## Dependency and supply chain risks
- Uses npm, Express, Prisma, React, SWR/React Query, etc.
- **Risks:**
  - npm ecosystem is high-risk for supply chain attacks (typosquatting, malicious deps)
  - Prisma and Express are well-maintained, but transitive deps can be risky
- **Mitigations:**
  - Enable Dependabot/Snyk for auto-updates and alerts
  - Pin dependency versions
  - Review and audit new dependencies

---

## Data handling and privacy
- **User data:** Property listings (title, description, address), user IDs, roles, JWTs
- **Storage:** PostgreSQL (managed by Render)
- **Access:** Only via API; backups managed by Render
- **Leak risk:** If DB or backups are compromised, property and user data could leak. No PII beyond address; moderate privacy risk.
- **Logs:** Console logs may contain sensitive info if not scrubbed

---

## Security checklist
- [ ] Enforce HTTPS/TLS for all endpoints
- [ ] Store all secrets in environment variables (never in code)
- [ ] Use strong, random JWT secrets; rotate regularly
- [ ] Restrict and audit access to GitHub/Render secrets
- [ ] Validate and sanitize all user input
- [ ] Enable dependency scanning (Dependabot/Snyk)
- [ ] Add rate limiting to public endpoints
- [ ] Scrub logs for sensitive data; restrict log access
- [ ] Ensure daily DB backups and test restore process
- [ ] Centralize and test all authorization logic
- [ ] Add negative tests for authz bypass

---

## Overall risk rating
**Medium**

The architecture is standard and avoids major pitfalls, but relies on strong secrets, proper input validation, and careful dependency management. Most risks are moderate and can be mitigated with standard controls. No critical flaws, but several areas (JWT secret, input validation, dependency scanning) must be addressed before production.

---

## TL;DR for the engineering manager

The property rental listing feature is built on a solid, modern stack (Express, Prisma, JWT, Render). The main risks are around secrets management (especially JWT secret strength and rotation), input validation (to prevent injection/abuse), and dependency supply chain (npm ecosystem). No critical vulnerabilities, but you must enforce strong secrets, validate all input, and enable dependency scanning before launch. Overall, the system is in good shape for MVP, but don't skip these controls.
