# Test Coverage Documentation

This document describes what is covered by the ESG Platform's automated test suite,
and what is explicitly out of scope.

---

## Test Suites

### API Security Tests (`tests/api-security.test.ts`)

Run with: `npx tsx tests/api-security.test.ts`

| Suite | Routes / Scenarios Covered |
|-------|---------------------------|
| **Suite 1 – Input Validation** | `POST /api/data-entry` (missing metricId), `PUT /api/topics/:id` (missing `selected`), `GET /api/auth/sessions` (no 500) |
| **Suite 2 – Tenant Isolation (unauthenticated baseline)** | `GET /api/metrics/1`, `PUT /api/metrics/1/target`, `GET /api/metrics/1/values`, `GET /api/metrics/1/history`, `PUT /api/topics/1` — all unauthenticated; must return 401/404 or SPA HTML, never raw JSON |
| **Suite 3 – Auth Endpoints** | `POST /api/auth/login` (bad credentials → 401), `POST /api/auth/register` (missing fields → 400) |
| **Suite 4 – Dashboard/Reports (unauthenticated)** | `GET /api/dashboard`, `GET /api/reports`, `GET /api/data-entry`, `GET /api/topics` — unauthenticated; must not leak JSON |
| **Suite 5 – Cross-Tenant Isolation (authenticated)** | Tenant A admin vs Tenant B metric: `GET`, `PUT /target`, `GET /values`, `POST /api/data-entry` — all must return 403/404, no Tenant B data returned; error body must have safe `error` field |
| **Suite 6 – RBAC Enforcement** | Viewer blocked from `POST /api/data-entry`, `PUT /api/metrics/:id/target`, `POST /api/reports/generate`, `PUT /api/company/settings`, `PUT /api/topics/:id`, `POST /api/actions` (all 403). Admin blocked from `GET /api/admin/users` (super-admin-only, returns 403) |
| **Suite 7 – Session Lifecycle** | Login → logout → replay revoked bearer token on `GET /api/metrics`, `/api/topics`, `/api/company`, `/api/reports`, `/api/auth/sessions` (all 401). Fabricated token → 401, never 500. Missing auth header → 401 |
| **Suite 8 – Malformed Payloads (authenticated)** | `POST /api/data-entry` (missing period → 400, null metricId → 400). `PUT /api/metrics/:id/target` (missing targetValue, string targetValue — no 500). `POST /api/reports/generate` (missing reportType → 400, invalid period — no 500) |

---

### Playwright E2E Tests (`tests/e2e/`)

Run with: `npx playwright test`

| Spec File | Flows / Scenarios Covered |
|-----------|--------------------------|
| **auth.spec.ts** | Register (full payload) → login → logout cycle; bad credentials returns 401 with safe error; missing fields returns 400 |
| **onboarding.spec.ts** | New user register + login triggers `seedDatabase`; `GET /api/metrics` returns seeded data; `PUT /api/onboarding/step` does not return 500 |
| **metric-entry.spec.ts** | Admin registers, logs in, fetches seeded metric, submits `POST /api/data-entry`, asserts `GET /api/metrics/:id/values` shows the new entry |
| **dashboard.spec.ts** | `GET /api/dashboard/enhanced` returns valid structure (no 500); `GET /api/metrics` returns non-empty array; `GET /api/topics` returns array; unauthenticated access returns 401 |
| **reports.spec.ts** | `POST /api/reports/generate` (management template) does not return 500; `GET /api/reports` returns without 500; viewer role blocked from report generation (403) |
| **viewer-restrictions.spec.ts** | Viewer blocked from `POST /api/data-entry`, `PUT /api/metrics/:id/target`, `POST /api/reports/generate`, `PUT /api/company/settings` (all 403); viewer can read metrics (200) |

---

### Shared Fixtures

| File | Purpose |
|------|---------|
| `tests/fixtures/seed.ts` | Provisions two isolated tenants (Tenant A, Tenant B) with admin users via API and a viewer user via direct SQL insert. Returns bearer tokens and a real Tenant B metric ID for cross-tenant tests. Uses timestamp-based suffix to avoid collisions across runs. |

---

## Gaps — Explicitly Out of Scope

| Area | Reason |
|------|--------|
| **MFA flow** | Requires TOTP device or backup code automation; not feasible without more infrastructure |
| **Step-up auth (`requireStepUp`)** | Re-authentication flow that requires MFA-level confirmation; excluded by task scope |
| **Email delivery** | No live email server in test environment; Resend calls are no-op |
| **Rate limiter enforcement** | Testing rate limits requires either timing manipulation or many test requests (could exhaust prod limits); marked out-of-scope |
| **CI pipeline configuration** | No CI environment configured; tests are run manually against local dev server |
| **Production database** | All tests run against the local dev server with ephemeral test accounts only |
| **Load / performance testing** | Outside the scope of regression testing |
| **Agent API key flows** | `POST /api/company/api-keys` requires `requireStepUp`; excluded with step-up auth |
| **Browser-based UI flows (clicking buttons)** | E2E specs use `page.request.*` API calls rather than UI navigation; UI-click flows are tested separately via the app's built-in e2e tooling |

---

## Running Tests

```bash
# API security suite only
npx tsx tests/api-security.test.ts

# Playwright E2E suite only
npx playwright test

# Both in sequence (via workflows)
# Use the "test:api" and "test:e2e" workflows in the Replit UI
```

**Prerequisites:**
- Local dev server running on port 5000 (`npm run dev`)
- `DATABASE_URL` environment variable set
- Playwright Chromium installed (`npx playwright install chromium`)
