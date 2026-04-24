### North star metric
**Unique properties listed with at least one rental duration selected**

This metric measures the number of distinct properties successfully listed by owners, each with at least one rental duration (shortlet, weekly, monthly, annual). It represents real value because it reflects supply growth and owner engagement, not just activity. A good value would be 50+ unique listings at 30 days, 150+ at 90 days post-launch, indicating traction and platform utility.

### Supporting metrics
| Metric | Definition | Why it matters | Target (30 days) | Red flag threshold |
|--------|------------|---------------|------------------|--------------------|
| Owner signups | Count of new users with role=owner | Measures acquisition of supply-side users | 30 | <10 |
| Tenant searches | Count of GET /v1/properties requests with filters | Indicates demand and search engagement | 100 | <30 |
| Properties with multiple durations | % of listings with >1 rental_duration | Shows if flexibility is being used | 40% | <15% |
| Search-to-contact rate | % of tenant searches resulting in contact/initiation | Measures activation, intent | 20% | <5% |
| 7-day owner retention | % of owners listing again or updating in 7 days | Early retention signal | 30% | <10% |
| Listings with zero views | % of listings never returned in search | Leading churn indicator | <20% | >40% |

### Guardrail metrics
- **Tenant search latency (p95):** Must not exceed 1s at 30 days (user experience risk)
- **Listing creation error rate:** Should remain <2% (avoid failed attempts)
- **Inactive/abandoned listings:** % of listings not updated/viewed in 30 days should not rise as north star improves

### Event taxonomy
| Event name | Trigger | Key properties | Priority |
|------------|--------|---------------|----------|
| owner_signup | Owner completes registration | user_id | P0 |
| property_listed | Owner creates property | property_id, owner_id, rental_durations | P0 |
| property_listing_failed | Owner attempts but fails to list | error_code, owner_id | P0 |
| property_searched | Tenant searches properties | tenant_id, rental_duration_filter, result_count | P0 |
| property_viewed | Tenant views property detail | property_id, tenant_id | P1 |
| property_contact_initiated | Tenant initiates contact | property_id, tenant_id, owner_id | P1 |
| property_listing_updated | Owner edits listing | property_id, fields_changed | P2 |
| property_listing_deleted | Owner deletes listing | property_id | P2 |

### Funnel definition
1. **Owner signup** → 2. **Property listed** → 3. **Property searched** → 4. **Property viewed** → 5. **Contact initiated**

- Expected drop-off: 30% at signup, 40% at listing, 50% at search, 60% at view, 80% at contact.
- Suspicious drop-off: >60% at listing (onboarding friction), >80% at search (no demand), >90% at view (bad search UX).

### Experiment framework
- A/B test: Listing form variants (single vs. multi-step), search filter UI, or onboarding flows.
- Minimum sample: 100 owners or 300 tenants per variant before calling a winner.
- Random assignment, track event exposure, analyze conversion to property_listed and property_contact_initiated.

### Reporting cadence
- **Daily:** North star, owner signups, search volume (owned by PM/analyst)
- **Weekly:** Funnel drop-offs, error rates, guardrails (owned by eng/PM)
- **Monthly:** Retention, churn, experiment results (owned by PM/leadership)
- Each review should answer: Are we growing supply? Is search working? Are users getting value?

### Data quality risks
- Double-counting: property_listed on retries/failures
- Attribution: property_viewed may be triggered by bots/crawlers
- Cold start: Early data sparse, especially for contact events
- Privacy: Do not log property addresses or PII in event payloads

### TL;DR for downstream agents
Instrument P0 events: owner_signup, property_listed, property_listing_failed, property_searched. North star is unique properties listed with at least one rental duration. In the first month, answer: Are owners listing properties and are tenants searching for them?