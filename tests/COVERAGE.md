# ESG Platform — Test Coverage

## Overview

Two test suites cover the API security layer and core user-journey flows.
All tests use bearer-token authentication.

---

## Suite 1: API Security Tests (`tests/api-security.test.ts`)

Run: `npx tsx tests/api-security.test.ts`  
(Also available as the `test:api` workflow.)

**49 tests across 8 suites — all passing.**

| Suite | Description | Count |
|-------|-------------|-------|
| 1 | Input validation (unauthenticated) | 3 |
| 2 | Tenant isolation — unauthenticated baseline | 5 |
| 3 | Auth endpoints (bad credentials, missing fields, rate limiter) | 2 |
| 4 | Dashboard / report endpoints (unauthenticated) | 4 |
| 5 | Cross-tenant isolation (authenticated) | 9 |
| 6 | RBAC enforcement (viewer, contributor, admin, super-admin) | 11 |
| 7 | Session lifecycle (logout, revoked token, fabricated token) | 8 |
| 8 | Malformed payloads (authenticated, strict 400 + error field) | 7 |

### Suite 5 — Two assertion strategies

**Targeted cross-tenant operations** use real Tenant B IDs and must return **exactly 403 or 404**
with a non-empty `error` field. Any 200 is a FAIL.

| Endpoint | Tenant B resource used | Required response |
|----------|------------------------|-------------------|
| `PUT /api/metrics/:id/target` | Tenant B metricId | 403 or 404 + error |
| `GET /api/metrics/:id/values` | Tenant B metricId | 403 or 404 + error |
| `GET /api/metrics/:id/history` | Tenant B metricId | 403 or 404 + error |
| `POST /api/data-entry` (Tenant B metricId) | Tenant B metricId | 403 or 404 + error |
| `PUT /api/topics/:id` | Tenant B topicId | 403 or 404 + error |

**Company-scoped list endpoints** return 200 for Tenant A's data. The test verifies Tenant B's
companyId does not appear anywhere in the response body.

| Endpoint | Assertion |
|----------|-----------|
| `GET /api/reports` | Tenant B companyId absent from response |
| `GET /api/policy` | Tenant B companyId absent from response |
| `GET /api/actions` | Tenant B companyId absent from response |
| `GET /api/questionnaires` | Tenant B companyId absent from response (or non-200 for plan-gated) |

### Suite 6 — RBAC roles and routes covered

| Role | Route | Required Permission | Expected |
|------|-------|---------------------|----------|
| viewer | `POST /api/data-entry` | `metrics_data_entry` | 403 |
| viewer | `PUT /api/metrics/:id/target` | `metrics_data_entry` | 403 |
| viewer | `POST /api/reports/generate` | `report_generation` | 403 |
| viewer | `PUT /api/company/settings` | `settings_admin` | 403 |
| viewer | `PUT /api/topics/:id` | `settings_admin` | 403 |
| viewer | `POST /api/actions` | `metrics_data_entry` | 403 |
| contributor | `PUT /api/company/settings` | `settings_admin` | 403 |
| contributor | `PUT /api/metrics/:id/admin` | `template_admin` | 403 |
| contributor | `PUT /api/policy-templates/:slug/admin` | `template_admin` | 403 |
| contributor | `POST /api/reports/generate` | `report_generation` | 403 |
| admin | `GET /api/admin/users` | `super_admin` | 403 |

### Suite 8 — Malformed payload contracts (strict)

All tests assert **exactly HTTP 400** with a JSON body containing a non-empty `error` field.
A 500 response or any non-400 is an explicit `FAIL` (except the missing-targetValue case which
asserts no 500 — the route silently ignores a missing optional field, which is valid behaviour).

| Endpoint | Malformed input | Required response |
|----------|-----------------|-------------------|
| `POST /api/data-entry` | missing `period` | 400 + `error` |
| `POST /api/data-entry` | `metricId: null` | 400 + `error` |
| `POST /api/data-entry` | `value: "not-a-number"` (string) | 400 + `error` |
| `PUT /api/metrics/:id/target` | `targetValue: "not-a-number"` | 400 + `error` |
| `PUT /api/metrics/:id/target` | missing `targetValue` | not 500 |
| `POST /api/reports/generate` | missing `reportType` | 400 + `error` |
| `POST /api/reports/generate` | invalid `period` format | 400 + `error` |

---

## Suite 2: Playwright E2E Tests (`tests/e2e/`)

Run: `npx playwright test`  
(Also available as the `test:e2e` workflow.)

**25 tests passing, 3 skipped (register rate-limiter active), 0 failed.**

Two Playwright projects run in sequence:

### `api` project — API-mode specs

| Spec | Description | Tests |
|------|-------------|-------|
| `auth.spec.ts` | Register, login, logout; bad credentials; missing fields | 3 (1 may skip) |
| `onboarding.spec.ts` | New user triggers seedDatabase; onboarding step PUT | 2 (may skip) |
| `metric-entry.spec.ts` | Submit metric value, retrieve; missing period → 400 | 2 |
| `dashboard.spec.ts` | Dashboard/enhanced, metrics, topics; unauthenticated 401 | 4 |
| `reports.spec.ts` | Generate report (no 500); list reports; viewer blocked (403) | 3 |
| `viewer-restrictions.spec.ts` | Viewer blocked from 4 write endpoints; read 200 OK | 2 |

### `chromium` project — Browser UI specs (full headless Chromium)

| Spec | Description | Tests |
|------|-------------|-------|
| `browser/login-ui.spec.ts` | Login form → dashboard; bad creds stay on /auth; storageState admin sees dashboard | 3 |
| `browser/viewer-ui.spec.ts` | Viewer: save buttons absent on data-entry + read-only badge visible; Admin: save buttons present; Viewer lands on dashboard (not /auth) | 3 |

---

## Seed Utility (`tests/fixtures/seed.ts`)

Provisions two fully isolated tenants. All seeded companies are marked `onboarding_complete = true`
so browser tests navigate to the dashboard directly instead of the onboarding wizard.

| User | Provisioned via | Role |
|------|-----------------|------|
| Tenant A admin | `POST /api/auth/register` (SQL fallback on 429) | admin |
| Tenant A viewer | Direct SQL | viewer |
| Tenant A contributor | Direct SQL | contributor |
| Tenant B admin | Direct SQL | admin |

Bearer tokens obtained via `POST /api/auth/login`. First admin login triggers `seedDatabase()`.

Global setup also writes two Playwright `storageState` files for browser specs:

- `tests/e2e/.auth/admin.json` — admin bearer token as localStorage `auth_token`
- `tests/e2e/.auth/viewer.json` — viewer bearer token as localStorage `auth_token`

---

## Running Tests

```bash
# API security suite (49 tests)
npx tsx tests/api-security.test.ts

# All Playwright tests (API-mode + browser-mode)
npx playwright test

# Browser-only
npx playwright test --project=chromium

# API-mode only
npx playwright test --project=api
```

> **Note on `package.json` scripts**: The Replit environment prevents editing `package.json`.
> Use `npx tsx` / `npx playwright test` directly, or the `test:api` / `test:e2e` workflow tabs.

---

## Known Gaps (Out of Scope)

| Area | Reason not covered |
|------|--------------------|
| MFA / step-up authentication | Not implemented in platform |
| Email verification flow | No email sending in test environment |
| Rate-limiter enforcement (API) | Consistently active; testing would exhaust slots |
| CI/CD pipeline integration | No CI configured for this project |
| WebSocket / real-time events | No WebSocket layer in current platform |
| File upload size limits | No file upload endpoints tested |
