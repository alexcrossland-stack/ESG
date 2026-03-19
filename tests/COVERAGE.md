# ESG Platform — Test Coverage

## Overview

Two test suites cover the API security layer and core user-journey flows.
All tests use bearer-token authentication where required.

### One-command run

```bash
# API security suite (53 tests)
npm run test:api

# All Playwright E2E tests (API-mode + browser-mode)
npm run test:e2e

# Run both suites sequentially
npm run test:all
```

Equivalent `npx` invocations: `npx tsx tests/api-security.test.ts` and `npx playwright test`.

---

## Suite 1: API Security Tests (`tests/api-security.test.ts`)

**53 tests across 8 suites — all passing.**

| Suite | Description | Count |
|-------|-------------|-------|
| 1 | Input validation (unauthenticated) | 3 |
| 2 | Tenant isolation — unauthenticated baseline | 5 |
| 3 | Auth endpoints (bad credentials, missing fields, rate limiter) | 2 |
| 4 | Dashboard / report endpoints (unauthenticated) | 4 |
| 5 | Cross-tenant isolation (authenticated, targeted ID-based + list-scoped) | 13 |
| 6 | RBAC enforcement (viewer, contributor, admin, super-admin) | 11 |
| 7 | Session lifecycle (logout, revoked token, fabricated token) | 8 |
| 8 | Malformed payloads (authenticated, strict 400 + error field) | 7 |

### Suite 5 — Cross-tenant isolation

**Targeted cross-tenant operations** use real Tenant B resource IDs seeded before each run.
The only acceptable responses are **403 or 404** with a non-empty JSON `error` field.
Any 200 response is an explicit FAIL.

| Endpoint | Tenant B resource used | Required response |
|----------|------------------------|-------------------|
| `PUT /api/metrics/:id/target` | Tenant B metricId | 403 or 404 + error |
| `GET /api/metrics/:id/values` | Tenant B metricId | 403 or 404 + error |
| `GET /api/metrics/:id/history` | Tenant B metricId | 403 or 404 + error |
| `POST /api/data-entry` (Tenant B metricId) | Tenant B metricId | 403 or 404 + error |
| `PUT /api/topics/:id` | Tenant B topicId | 403 or 404 + error |
| `GET /api/reports/:id/files` | Tenant B reportId | 403 or 404 + error |
| `PUT /api/actions/:id` | Tenant B actionId | 403 or 404 + error |
| `DELETE /api/actions/:id` | Tenant B actionId | 403 or 404 + error |
| `GET /api/questionnaires/:id` | Tenant B questionnaireId | 403 or 404 + error |

> Routes patched for tenant isolation: `PUT/DELETE /api/actions/:id` (added companyId ownership check);
> `GET /api/reports/:id/files` (now checks `report_runs.company_id` before returning files — previously
> returned 200 with empty array, now returns 404 for cross-tenant access).

**Company-scoped list endpoints** — Tenant A fetches its own list; test verifies Tenant B's
`companyId` does not appear anywhere in the response body.

| Endpoint | Assertion |
|----------|-----------|
| `GET /api/reports` | Tenant B companyId absent |
| `GET /api/policy` | Tenant B companyId absent |
| `GET /api/actions` | Tenant B companyId absent |
| `GET /api/questionnaires` | Tenant B companyId absent (or non-200 for plan-gated) |

### Suite 6 — RBAC roles and routes

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
A 500 response or unexpected non-400 status is an explicit FAIL.

| Endpoint | Malformed input | Required response |
|----------|-----------------|-------------------|
| `POST /api/data-entry` | missing `period` | 400 + `error` |
| `POST /api/data-entry` | `metricId: null` | 400 + `error` |
| `POST /api/data-entry` | `value: "not-a-number"` | 400 + `error` |
| `PUT /api/metrics/:id/target` | `targetValue: "not-a-number"` | 400 + `error` |
| `PUT /api/metrics/:id/target` | missing `targetValue` | 400 + `error` (`targetValue is required`) |
| `POST /api/reports/generate` | missing `reportType` | 400 + `error` |
| `POST /api/reports/generate` | invalid `period` format | 400 + `error` |

> `PUT /api/metrics/:id/target` now requires `targetValue` to be a number. Omitting it returns 400.

---

## Suite 2: Playwright E2E Tests (`tests/e2e/`)

**29 tests total: 26 passed, 3 skipped.**

### `api` project — API-mode specs (16 tests)

Specs at `tests/e2e/*.spec.ts` (excluding `*.browser.spec.ts`). All use pre-seeded tokens from
`tests/e2e/.auth/seed-info.json` written by `global-setup.ts` — no ad-hoc SQL or registration.

| Spec | Description | Tests |
|------|-------------|-------|
| `auth.spec.ts` | Register → login → logout; bad credentials; missing fields (1 may skip on rate-limit) | 3 |
| `onboarding.spec.ts` | New user triggers seedDatabase; onboarding step PUT (may skip) | 2 |
| `metric-entry.spec.ts` | Submit metric value + retrieve; missing period → 400 | 2 |
| `dashboard.spec.ts` | Dashboard/enhanced, metrics, topics list; unauthenticated → 401 | 4 |
| `reports.spec.ts` | Generate report (no 500); list reports; viewer blocked (403) | 3 |
| `viewer-restrictions.spec.ts` | Viewer blocked from 4 write endpoints; GET metrics → 200 | 2 |

### `chromium` project — Browser UI specs (13 tests, full headless Chromium)

Specs at `tests/e2e/*.browser.spec.ts`. Selected via `testMatch` suffix pattern.

| Spec | Description | Tests |
|------|-------------|-------|
| `admin-journeys.browser.spec.ts` | Dashboard loads (not /auth); CTA navigates to data-entry; metric value entry; report export | 4 |
| `login-ui.browser.spec.ts` | Login form → dashboard; bad credentials stay on /auth; storageState admin sees dashboard | 3 |
| `viewer-fetch.browser.spec.ts` | Viewer in-browser fetch: POST /api/data-entry → 403; PUT metric target → 403; POST report → 403 | 3 |
| `viewer-ui.browser.spec.ts` | Viewer: save buttons absent; Admin: save buttons present; Viewer on dashboard (not /auth) | 3 |

### Admin journeys — browser assertion strategy

`admin-journeys.browser.spec.ts` uses the pre-seeded admin `storageState` from `global-setup.ts`.
Since the seeded company has `onboarding_complete = true`:

- Test 1: Asserts admin lands on `/` → **not** redirected to `/auth`; dashboard title is visible
- Test 2: Asserts data-entry page loads (via CTA or direct navigation); **not** on `/auth`
- Test 3: Asserts Manual Entry tab visible, metric input fills, save button clicks, **no error alert**
- Test 4: Asserts report export button visible and clickable; **no 500 error** after click

---

## Seed Utility (`tests/fixtures/seed.ts`)

Provisions two fully isolated tenants via API registration (SQL fallback on 429 rate-limit).
All seeded companies are marked `onboarding_complete = true`.

| User | Provisioned via | Role |
|------|-----------------|------|
| Tenant A admin | `POST /api/auth/register` (SQL fallback on 429) | admin |
| Tenant A viewer | Direct SQL | viewer |
| Tenant A contributor | Direct SQL | contributor |
| Tenant B admin | `POST /api/auth/register` (SQL fallback on 429) | admin |

Tenant B resources created by seed for cross-tenant isolation tests:

| Resource | Provisioned via | Used in |
|----------|-----------------|---------|
| `metricId` | `GET /api/metrics` after login | Suite 5 targeted checks |
| `topicId` | `GET /api/topics` after login | Suite 5 targeted checks |
| `reportId` | Direct SQL INSERT into `report_runs` | Suite 5 targeted checks |
| `actionId` | `POST /api/actions` | Suite 5 targeted checks |
| `questionnaireId` | Direct SQL INSERT into `questionnaires` | Suite 5 targeted checks |

Global setup also writes two Playwright `storageState` files and `seed-info.json` for specs:

- `tests/e2e/.auth/admin.json` — admin bearer token as `localStorage["auth_token"]`
- `tests/e2e/.auth/viewer.json` — viewer bearer token as `localStorage["auth_token"]`
- `tests/e2e/.auth/seed-info.json` — full tenant data (tokens, companyIds, metricIds, etc.)

---

## Known Gaps (Out of Scope)

| Area | Reason not covered |
|------|--------------------|
| MFA / step-up authentication | Not implemented in platform |
| Email verification flow | No email sending in test environment |
| Rate-limiter enforcement (API) | Consistently active; testing would exhaust registration slots |
| CI/CD pipeline integration | No CI configured for this project |
| WebSocket / real-time events | No WebSocket layer in current platform |
| File upload size limits | No file upload endpoints tested |
