### Test strategy

- **Split:** Unit tests for backend validation and service logic (Jest), integration tests for API endpoints (Jest + Supertest), end-to-end (e2e) tests for owner and tenant flows (Playwright or Cypress), and manual exploratory testing for UI/UX, error, and permission edge cases.
- **Tools:** Backend: Jest, Supertest. Frontend: Jest, React Testing Library, Playwright/Cypress for e2e. Manual QA for UI/UX and error/empty state validation.
- **Workflow:** Tests run in CI on every PR. E2E suite runs nightly and pre-release. Manual QA required for tagged scenarios and visual/UX checks.

---

### Gherkin coverage check

| Tag         | Scenario Name                                             | Status                |
|-------------|----------------------------------------------------------|-----------------------|
| @happy      | Owner lists a property for multiple rental durations      | Covered by implementation |
| @happy      | Tenant searches for properties by rental duration         | Covered by implementation |
| @validation | Owner lists a property for only shortlet                  | Covered by implementation |
| @sad        | Tenant cannot find properties for unavailable durations   | Covered by implementation |

**PRD acceptance criteria not covered by Gherkin:**
- Listings display the available rental durations (covered)
- Tenants can filter/search by rental duration (covered)
- Owners can select one or more rental durations (covered)

**No gaps found.**

---

### Test cases

| ID      | Gherkin scenario                                   | Steps | Expected result | Type | Automated? |
|---------|----------------------------------------------------|-------|----------------|------|------------|
| TC-001  | Owner lists a property for multiple rental durations | 1. Login as owner<br>2. Open listing form<br>3. Fill property details<br>4. Select shortlet, weekly, monthly, annual<br>5. Submit<br>6. View listing | Listing displays all selected durations | e2e | Yes |
| TC-002  | Tenant searches for properties by rental duration    | 1. Ensure properties with various durations exist<br>2. Go to search<br>3. Filter by "monthly"<br>4. View results | Only properties with "monthly" duration are shown | e2e | Yes |
| TC-003  | Owner lists a property for only shortlet            | 1. Login as owner<br>2. Open listing form<br>3. Fill property details<br>4. Select only "shortlet"<br>5. Submit<br>6. View listing | Listing displays only "shortlet" as duration | e2e | Yes |
| TC-004  | Tenant cannot find properties for unavailable durations | 1. Ensure no properties with "annual" duration<br>2. Go to search<br>3. Filter by "annual"<br>4. View results | No results are shown | e2e | Yes |

---

### Edge cases and adversarial scenarios

- Submitting a listing with no rental duration selected (should fail validation)
- Selecting all durations, then removing all before submit
- Submitting with max-length/empty/invalid property fields
- Unicode, emoji, or injection-like strings in title/description
- Searching with no filters (should show all)
- Searching with multiple durations selected
- Stale session/token expiry during listing or search
- Owner tries to list property as tenant (permission)
- Concurrent edits to the same property
- Database returns unexpected types or missing fields
- Large number of listings (pagination, performance)
- Network failure during submit/search

---

### Risk areas

- Rental duration selection logic (multi-select, validation)
- Filtering logic in backend and frontend (correct results, no leaks)
- Permissions (only owners can list, tenants cannot)
- Form validation and error messaging (especially for durations)
- Data consistency between backend and frontend (enum mapping)
- Handling of empty states (no results, no durations)
- API error handling and propagation to UI
- Session/auth expiry handling
- UI display of multiple durations (badges, layout)
- Search performance with large datasets

---

### Coverage gaps

- Visual/UX validation of duration badges and listing cards (manual)
- Accessibility of form and search filters (manual)
- Error message clarity and localization (manual)
- Real-world concurrency (multiple owners editing)
- Full cross-browser/device testing
- Backend DB enum drift or migration issues

---

### Regression safety net

- Owner can create a listing with all durations
- Tenant can search and see correct results for each duration
- Owner cannot submit listing with no duration
- Tenant sees empty state when no results
- Permissions enforced (owners only for listing)

---

### Definition of done

- 100% Gherkin scenario coverage with passing tests
- 90%+ unit/integration test coverage on backend
- All e2e tests pass in CI
- Manual QA signoff for UI/UX, accessibility, and error states
- No critical/high bugs open
- Regression suite green on main branch

---

### TL;DR for downstream agents

All core flows for property rental listing and search by duration are covered by automated tests, with edge cases and permissions validated. Manual QA is required for UI/UX, accessibility, and error messaging. Top risks are in duration selection/filtering, permissions, and data consistency. Regression suite ensures main flows are always working; manual signoff required for visual and accessibility checks.
