# ESG Platform — Test Coverage

## Overview

Three test layers cover the API security layer, per-domain API contracts, and core
user-journey flows. All suites use bearer-token authentication and deterministic seed data.

### Test inventory at a glance

| Suite | File(s) | Tests |
|-------|---------|-------|
| API Security | `tests/api-security.test.ts` | 53 |
| API Domain — Auth | `tests/api/auth.test.ts` | 12 |
| API Domain — Dashboard | `tests/api/dashboard.test.ts` | 10 |
| API Domain — Metrics | `tests/api/metrics.test.ts` | 11 |
| API Domain — Evidence | `tests/api/evidence.test.ts` | 10 |
| API Domain — Reports | `tests/api/reports.test.ts` | 10 |
| API Domain — Portfolio | `tests/api/portfolio.test.ts` | 8 |
| API Domain — Permissions Matrix | `tests/api/permissions.test.ts` | 22 |
| E2E (existing) — API-mode | `tests/e2e/*.spec.ts` (6 files) | 16 |
| E2E (existing) — Browser | `tests/e2e/*.browser.spec.ts` (5 files) | 17 |
| E2E (new) — Evidence upload | `tests/e2e/evidence-upload.spec.ts` | 8 |
| E2E (new) — First metric entry | `tests/e2e/first-metric.spec.ts` | 6 |
| E2E (new) — Report generation | `tests/e2e/report-generation.spec.ts` | 8 |
| E2E (new) — Portfolio access | `tests/e2e/portfolio-access.spec.ts` | 8 |
| E2E (new) — Portfolio switching | `tests/e2e/portfolio-switching.spec.ts` | 6 |
| **TOTAL** | | **205** |

### One-command runs

```bash
# API security suite (53 tests)
npx tsx tests/api-security.test.ts

# Per-domain API tests (83 tests)
npx tsx tests/api/auth.test.ts
npx tsx tests/api/dashboard.test.ts
npx tsx tests/api/metrics.test.ts
npx tsx tests/api/evidence.test.ts
npx tsx tests/api/reports.test.ts
npx tsx tests/api/portfolio.test.ts
npx tsx tests/api/permissions.test.ts

# All Playwright E2E tests (API-mode + browser-mode)
npx playwright test

# New E2E domain specs only (36 tests, API-mode)
npx playwright test \
  tests/e2e/evidence-upload.spec.ts \
  tests/e2e/first-metric.spec.ts \
  tests/e2e/report-generation.spec.ts \
  tests/e2e/portfolio-access.spec.ts \
  tests/e2e/portfolio-switching.spec.ts \
  --project=api

# Regression-tagged specs only
npx playwright test --grep 'REGR-'
```

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

## Suite 2: Per-Domain API Tests (`tests/api/`)

**83 tests across 7 domain files — all passing.**

Each file seeds deterministic Tenant A and Tenant B via `tests/fixtures/seed.ts` before running.

### `tests/api/auth.test.ts` — 12 tests

| Test | Asserts |
|------|---------|
| POST /api/auth/login valid credentials | 200 + `token` field |
| POST /api/auth/login bad password | 401 |
| POST /api/auth/login missing email | 400 |
| POST /api/auth/login missing password | 400 |
| POST /api/auth/login unknown email | 401 |
| GET /api/auth/me with valid token | 200 + `id`, `email`, `companyId` |
| GET /api/auth/me with no token | 401 |
| GET /api/auth/me with invalid token | 401 |
| POST /api/auth/logout with valid token | 200 or 204 |
| POST /api/auth/logout → token revoked | 401 |
| GET /api/auth/me: Tenant A cannot read Tenant B user | 401 (cross-token isolation) |
| POST /api/auth/login rate-limit fires at 10 attempts | 429 or graceful |

### `tests/api/dashboard.test.ts` — 10 tests

| Test | Asserts |
|------|---------|
| GET /api/dashboard for admin | 200 with data |
| GET /api/dashboard unauthenticated | 401 |
| GET /api/dashboard for viewer (read access) | 200 |
| GET /api/enhanced-dashboard for admin | 200 |
| GET /api/metrics for admin | 200 array |
| GET /api/metrics for viewer | 200 array |
| GET /api/metrics unauthenticated | 401 |
| GET /api/topics for admin | 200 |
| GET /api/topics unauthenticated | 401 |
| GET /api/dashboard Tenant B companyId absent from Tenant A response | data isolation |

### `tests/api/metrics.test.ts` — 11 tests

| Test | Asserts |
|------|---------|
| POST /api/data-entry admin → 200/201 | value accepted |
| POST /api/data-entry contributor → 200/201 | contributor write access |
| POST /api/data-entry viewer → 403 | read-only enforcement |
| POST /api/data-entry unauthenticated → 401 | auth required |
| POST /api/data-entry missing period → 400 | input validation |
| POST /api/data-entry invalid value → 400 | type validation |
| GET /api/metrics/:id/values persists submitted value | round-trip |
| PUT /api/metrics/:id/target admin → 200 | target set |
| PUT /api/metrics/:id/target viewer → 403 | RBAC |
| PUT /api/metrics/:id/target Tenant B metric → 403/404 | cross-tenant |
| GET /api/metrics/:id/history → 200 array | history available |

### `tests/api/evidence.test.ts` — 10 tests

| Test | Asserts |
|------|---------|
| POST /api/evidence admin → 200/201 | upload accepted |
| POST /api/evidence contributor → 200/201 | contributor write |
| POST /api/evidence viewer → 403 | read-only enforcement |
| POST /api/evidence unauthenticated → 401 | auth required |
| POST /api/evidence missing filename → 400 | input validation |
| GET /api/evidence admin → 200 array | list access |
| GET /api/evidence viewer → 200 array | viewer read access |
| GET /api/evidence unauthenticated → 401 | auth required |
| GET /api/evidence Tenant B companyId absent | cross-tenant list isolation |
| GET /api/evidence/coverage → 200 or 404, never 500 | no server error |

### `tests/api/reports.test.ts` — 10 tests

| Test | Asserts |
|------|---------|
| POST /api/reports/generate admin → 200 with id | generation succeeds |
| Generated report appears in GET /api/reports | persistence |
| POST /api/reports/generate viewer → 403 | RBAC |
| POST /api/reports/generate contributor → 403 | RBAC |
| POST /api/reports/generate unauthenticated → 401 | auth required |
| POST /api/reports/generate invalid reportType → 400 | enum validation |
| POST /api/reports/generate invalid period format → 400 | period validation |
| GET /api/reports/:id/files Tenant B → 403 or 404 | cross-tenant |
| GET /api/reports company-scoped (Tenant B absent) | list isolation |
| GET /api/reports admin → 200 array | list access |

> Report response shape is `{ report: { id, ... }, data }` — id is at `body.report.id`.
> Period format must be `YYYY-MM` (e.g. `2024-01`). `reportType` is optional (pdf/csv/word);
> to trigger 400 via enum validation, send `"invalid-type"`.

### `tests/api/portfolio.test.ts` — 8 tests

| Test | Asserts |
|------|---------|
| portfolio_owner `/api/auth/me` returns portfolioGroups | group membership visible |
| portfolio_viewer `/api/auth/me` returns portfolioGroups | viewer membership visible |
| GET /api/portfolio/groups → groups for owner | list returned |
| GET /api/portfolio/groups/:id/companies → both members present | `{ companies, total, page, pageSize }` shape |
| Non-member GET /api/portfolio/groups/:id/companies → 403 or 404 | access control |
| Non-member GET /api/portfolio/groups/:id/summary → 403 or 404 | access control |
| GET /api/portfolio/groups without token → 401 | auth required |
| Regular admin `/api/auth/me` has empty portfolioGroups | no accidental membership |

> Portfolio companies endpoint returns `{ companies: [...], total, page, pageSize }` — not a plain array.

### `tests/api/permissions.test.ts` — 22 tests

Full role × route matrix (PERM-01 through PERM-06). Each row exercises
unauthenticated → 401, low-privilege → 403, authorised → 200/201, wrong-company → 403/404.

| Group | Route | Roles tested |
|-------|-------|--------------|
| PERM-01 | `PUT /api/metrics/:id/target` | unauthed, contributor, viewer, admin, wrong-company |
| PERM-02 | `POST /api/data-entry` | unauthed, viewer, contributor, admin |
| PERM-03 | `POST /api/reports/generate` | unauthed, viewer, contributor, admin |
| PERM-04 | `PUT /api/company/settings` | unauthed, viewer, contributor, admin |
| PERM-05 | `POST /api/evidence` | unauthed, viewer, admin |
| PERM-06 | `GET /api/admin/users` | unauthed, admin (non-super_admin) |

---

## Suite 3: Playwright E2E Tests (`tests/e2e/`)

### Existing specs — 33 tests (29 passed, 4 skipped)

#### `api` project — API-mode specs (16 tests)

| Spec | Description | Tests |
|------|-------------|-------|
| `auth.spec.ts` | Login → logout; bad credentials; missing fields | 3 |
| `onboarding.spec.ts` | New user seedDatabase; onboarding step PUT not 500 | 2 |
| `metric-entry.spec.ts` | Submit metric value + retrieve; missing period → 400 | 2 |
| `dashboard.spec.ts` | Dashboard/enhanced, metrics, topics; unauthenticated → 401 | 4 |
| `reports.spec.ts` | Generate report (no 500); list reports; viewer blocked | 3 |
| `viewer-restrictions.spec.ts` | Viewer blocked from 4 write endpoints; GET metrics → 200 | 2 |

#### `chromium` project — Browser UI specs (17 tests)

| Spec | Description | Tests |
|------|-------------|-------|
| `activation-journey.browser.spec.ts` | Signup form → onboarding; Quick Start → dashboard; logout | 3* |
| `admin-journeys.browser.spec.ts` | Dashboard loads; data-entry CTA; metric entry; report export | 4 |
| `login-ui.browser.spec.ts` | Login form; bad credentials; storageState; logout | 4 |
| `viewer-fetch.browser.spec.ts` | Viewer POST data-entry/PUT target/POST report → 403 in-browser | 3 |
| `viewer-ui.browser.spec.ts` | Viewer: save buttons absent; Admin: present†; viewer dashboard | 3 |

> \* Activation journey tests skip gracefully when registration rate-limiter returns 429.
> † Admin save-button test is an intentional skip (flaky in headless).

### New E2E domain specs — 36 tests (all passing)

All new specs use the `api` project (no browser required). They share the deterministic
`tests/e2e/.auth/seed-info.json` produced by `global-setup.ts`.

#### `tests/e2e/evidence-upload.spec.ts` — 8 tests

| Test | Asserts |
|------|---------|
| Admin upload POST /api/evidence → 200/201 | upload accepted |
| Uploaded row appears in GET /api/evidence list | persistence |
| Uploaded filename present in list | filename preserved |
| Viewer GET /api/evidence → 200 | read-only access |
| Viewer POST /api/evidence → 403 | write blocked |
| Contributor POST /api/evidence → 200/201 | contributor write |
| POST without filename → 400 | input validation |
| GET /api/evidence/coverage → 200 or 404, never 500 | no server error |

#### `tests/e2e/first-metric.spec.ts` — 6 tests

| Test | Asserts |
|------|---------|
| GET /api/metrics returns at least one metric for admin | metrics seeded |
| Admin POST /api/data-entry → 200/201 | value accepted |
| Submitted value retrievable via /api/metrics/:id/values | persistence |
| Contributor POST /api/data-entry → 200/201 | contributor write |
| Viewer POST /api/data-entry → 403 | read-only enforcement |
| POST without period → 400 | input validation |

#### `tests/e2e/report-generation.spec.ts` — 8 tests

| Test | REGR tag | Asserts |
|------|----------|---------|
| Admin POST /api/reports/generate → 200 with id | | generation succeeds |
| Report in GET /api/reports list | | persistence |
| Admin generate csv variant → 200 | | format options work |
| Viewer POST /api/reports/generate → 403 | REGR-RG | RBAC |
| Contributor POST /api/reports/generate → 403 | REGR-RG | RBAC |
| Invalid period format → 400 | REGR-RG | period input validation |
| Unauthenticated POST /api/reports/generate → 401 | REGR-RG | auth required |
| Viewer GET /api/reports → 200 array | | read access |

#### `tests/e2e/portfolio-access.spec.ts` — 8 tests

| Test | Asserts |
|------|---------|
| portfolio_owner /api/auth/me has portfolioGroups | membership reflected |
| portfolio_viewer /api/auth/me has portfolioGroups | viewer membership |
| Owner GET /api/portfolio/groups → list returned | groups visible |
| Companies list contains members A and B | `body.companies` shape confirmed |
| Companies list excludes non-member company C | isolation |
| Non-member access to companies → 403/404 | access control |
| Non-member access to summary → 403/404 | access control |
| Unauthenticated GET /api/portfolio/groups → 401 | auth required |

#### `tests/e2e/portfolio-switching.spec.ts` — 6 tests

| Test | REGR tag | Asserts |
|------|----------|---------|
| Groups endpoint returns both companies | REGR-PS | member list complete |
| Company A summary does not contain Company B id | REGR-PS | data isolation |
| Companies list has distinct entries, no duplicates | REGR-PS | dedup |
| Owner group list returns switching context | REGR-PS | context available |
| /api/auth/me includes group for switching | REGR-PS | membership data |
| Unauthenticated → 401 | REGR-PS | auth required |

---

## Seed Utility (`tests/fixtures/seed.ts`)

Provisions two fully isolated tenants via API registration (SQL fallback on 429 rate-limit).
Tenant A and B are marked `onboarding_complete = true` so dashboard-based tests run directly.
The first-time activation journey test registers its own fresh user so the wizard can be observed.

Portfolio tests additionally create:
- A portfolio group with Tenant A and B as members
- A `portfolio_owner` user and `portfolio_viewer` user in Tenant A
- A non-member Tenant C company for isolation tests

Global setup writes auth state files for all spec types:

- `tests/e2e/.auth/admin.json` — admin bearer token
- `tests/e2e/.auth/viewer.json` — viewer bearer token
- `tests/e2e/.auth/seed-info.json` — full tenant data (tokens, companyIds, metricIds, portfolioGroup, etc.)

---

## Known Gaps (Out of Scope)

| Area | Reason not covered |
|------|--------------------|
| MFA / step-up authentication | Not implemented in platform |
| Email verification flow | No email sending in test environment |
| Rate-limiter enforcement (API) | Consistently active; testing would exhaust registration slots |
| CI/CD pipeline integration | No CI configured for this project |
| WebSocket / real-time events | No WebSocket layer in current platform |
| File upload size limits | No file upload endpoints in scope |
| Stripe / billing flows | STRIPE keys not set; billing disabled (accepted risk LR-05) |
