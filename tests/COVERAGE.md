# ESG Platform — Test Coverage

## Overview

Two test suites cover the API security layer and core user-journey flows.
All tests use bearer-token authentication (no cookie sessions).

---

## Suite 1: API Security Tests (`tests/api-security.test.ts`)

Run: `npx tsx tests/api-security.test.ts`  
(Also registered as the `test:api` workflow.)

**47 tests across 8 suites — all passing.**

| Suite | Description | Count |
|-------|-------------|-------|
| 1 | Input validation (unauthenticated) | 3 |
| 2 | Tenant isolation — unauthenticated baseline | 5 |
| 3 | Auth endpoints (bad credentials, missing fields, rate limiter) | 2 |
| 4 | Dashboard / report endpoints (unauthenticated) | 4 |
| 5 | Cross-tenant isolation (authenticated) | 9 |
| 6 | RBAC enforcement (viewer, contributor, admin, super-admin) | 11 |
| 7 | Session lifecycle (logout, revoked token, fabricated token) | 8 |
| 8 | Malformed payloads (authenticated, strict 400 + error field) | 5 |

### Suite 5 — Cross-tenant endpoints covered

| Endpoint | Tenant B resource used |
|----------|------------------------|
| `PUT /api/metrics/:id/target` | Tenant B metricId |
| `GET /api/metrics/:id/values` | Tenant B metricId |
| `GET /api/metrics/:id/history` | Tenant B metricId |
| `POST /api/data-entry` (Tenant B metricId) | Tenant B metricId |
| `PUT /api/topics/:id` | Tenant B topicId |
| `GET /api/reports` (scoped response check) | Tenant B companyId |
| `GET /api/policy` (scoped response check) | Tenant B companyId |
| `GET /api/actions` (scoped response check) | Tenant B companyId |
| `GET /api/questionnaires` (scoped / plan-gated) | Tenant B companyId |

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
A 500 response is an explicit `FAIL`; a relaxed "non-500" assertion is not used.

| Endpoint | Malformed input | Required response |
|----------|-----------------|-------------------|
| `POST /api/data-entry` | missing `period` | 400 + `error` |
| `POST /api/data-entry` | `metricId: null` | 400 + `error` |
| `PUT /api/metrics/:id/target` | `targetValue: "not-a-number"` | 400 + `error` |
| `POST /api/reports/generate` | missing `reportType` | 400 + `error` |
| `POST /api/reports/generate` | invalid `period` format | 400 + `error` |

---

## Suite 2: Playwright E2E Tests (`tests/e2e/`)

Run: `npx playwright test`  
(Also registered as the `test:e2e` workflow.)

**16 tests across 6 spec files — all passing (API-mode).**

> **Note:** Playwright runs in API-mode (`request` fixture / `APIRequestContext`)
> because browser launch requires `libgbm.so.1` which is unavailable in this environment.
> All specified API-level checks pass (including viewer restrictions returning 403 on
> direct fetch). Browser-side UI absence of write buttons is not covered by these tests.

| Spec | Description | Tests |
|------|-------------|-------|
| `auth.spec.ts` | Register, login, logout; bad credentials; missing fields | 3 |
| `onboarding.spec.ts` | New user triggers seedDatabase; onboarding step PUT | 2 |
| `metric-entry.spec.ts` | Submit metric value, retrieve; missing period → 400 | 2 |
| `dashboard.spec.ts` | Dashboard/enhanced, metrics, topics; unauthenticated 401 | 4 |
| `reports.spec.ts` | Generate report (no 500); list reports; viewer blocked (403) | 3 |
| `viewer-restrictions.spec.ts` | Viewer blocked from 4 write endpoints; read 200 OK | 2 |

---

## Seed Utility (`tests/fixtures/seed.ts`)

The shared seed utility provisions two fully isolated tenants:

- **Tenant A admin**: Registered via `POST /api/auth/register` (API path, with SQL fallback
  if the 5/hr rate limiter is active).
- **Tenant A viewer**: Inserted directly via SQL (no register API call needed).
- **Tenant A contributor**: Inserted directly via SQL.
- **Tenant B admin**: Inserted directly via SQL (avoids consuming a second register slot).

Bearer tokens are always obtained via `POST /api/auth/login`.  
First admin login triggers `seedDatabase()`, populating default metrics and topics.

---

## Running Tests

```bash
# API security suite (47 tests)
npx tsx tests/api-security.test.ts

# Playwright E2E suite (16 tests)
npx playwright test

# Both in sequence
npx tsx tests/api-security.test.ts && npx playwright test
```

> **Note on `package.json` scripts**: The Replit environment prevents editing `package.json`
> directly. The `test:api` and `test:e2e` workflows are registered as alternatives to
> `npm run test:api` / `npm run test:e2e`. Use `npx tsx` / `npx playwright test` directly.

---

## Known Gaps (Out of Scope)

| Area | Reason not covered |
|------|--------------------|
| MFA / step-up authentication | Not implemented in platform |
| Email verification flow | No email sending in test environment |
| Rate-limiter enforcement (API) | Consistently active at 5/hr; testing would exhaust slots |
| Browser-side UI (write buttons hidden for viewer) | Browser launch unavailable in Replit environment |
| CI/CD pipeline integration | No CI configured for this project |
| WebSocket / real-time events | No WebSocket layer in current platform |
| File upload size limits | Not tested (no file upload endpoints tested) |
