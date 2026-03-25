# ESG Platform — Regression Pack

## What is this?

The regression pack is a named, runnable suite of API-level tests that guard the ten most commercially critical user journeys. It must pass before every release. Each test is tagged `REGR-NN` so it can be run independently of the broader E2E suite.

The suite explicitly protects against the three regression classes fixed prior to the last release:

| Regression class | How it is tested |
|-----------------|-----------------|
| Dashboard hook/render stability | `REGR-05` — asserts `/api/dashboard/enhanced` never returns 500 and response body is a valid object without stack traces |
| Portfolio access uses group membership (not direct company) | `REGR-03`, `REGR-04`, `REGR-10a`, `REGR-10b` — asserts `portfolioGroups` is resolved from `userGroupRoles`, correct companies are listed per group, and non-members are denied |
| Permission guards on write endpoints | `REGR-11`, `REGR-12` — asserts contributor gets 403 on `PUT /api/metrics/:id/target`, admin gets 200/400 (never 403) |

---

## How to run

**Prerequisite:** the application server must be running on port 5000 and `DATABASE_URL` must be set.

```bash
# Run the regression pack only — single command, clear PASS/FAIL (fastest, ~30–60 s)
./scripts/test-regression.sh

# Equivalent direct Playwright invocation
npx playwright test --grep "REGR-"

# Run the full E2E suite (includes regression pack + all other specs)
npm run test:e2e

# Run all suites (API security + E2E)
npm run test:all
```

---

## Flows covered

| ID | Flow | Description |
|----|------|-------------|
| REGR-01 | Login — Company Admin | Admin login returns 200, token and role `admin` |
| REGR-02 | Login — Contributor | Contributor login returns 200, token and role `contributor` |
| REGR-03 | Login — Portfolio Owner | Portfolio owner login returns 200; `/api/auth/me` includes `portfolioGroups` sourced from group membership |
| REGR-04 | Login — Portfolio Viewer | Portfolio viewer login and group membership reflected in `/api/auth/me` |
| REGR-05 | Dashboard load (admin) | `/api/dashboard/enhanced` never returns 500; response is a valid object with no stack traces |
| REGR-06 | Onboarding / first-session | Metrics seeded after first login; `PUT /api/onboarding/step` does not crash; `/api/onboarding/status` is reachable |
| REGR-07 | First metric entry | Admin can `POST /api/data-entry`, value is retrievable via `GET /api/metrics/:id/values` |
| REGR-08 | Evidence upload | `GET /api/evidence` returns array; `POST` without file returns 400 not 500; viewer gets 403 |
| REGR-09 | Report generation | `POST /api/reports/generate` does not return 500; viewer gets 403 |
| REGR-10a | Portfolio dashboard access | Portfolio owner/viewer `GET /api/portfolio/groups` returns their group sourced from `userGroupRoles`; regular admin gets 403 |
| REGR-10b | Portfolio company switching | `GET /api/portfolio/groups/:id/companies` lists all companies in the group for owner and viewer; non-member gets 403 |
| REGR-11 | Contributor blocked from metric targets | `PUT /api/metrics/:id/target` returns 403 for contributor and viewer |
| REGR-12 | Admin permitted to set metric targets | `PUT /api/metrics/:id/target` returns 200 or 400 (never 403) for admin |

---

## Test file locations

| File | Purpose |
|------|---------|
| `tests/e2e/regression.spec.ts` | Regression pack — all 10 flows |
| `tests/e2e/auth.spec.ts` | Auth flow (login/logout/bad credentials) |
| `tests/e2e/dashboard.spec.ts` | Dashboard API baseline |
| `tests/e2e/onboarding.spec.ts` | Onboarding flow |
| `tests/e2e/metric-entry.spec.ts` | Metric data entry |
| `tests/e2e/reports.spec.ts` | Report generation |
| `tests/e2e/viewer-restrictions.spec.ts` | Viewer RBAC restrictions |
| `tests/e2e/admin-journeys.browser.spec.ts` | Admin browser journeys |
| `tests/api-security.test.ts` | API security (53 tests) |
| `tests/portfolio.test.ts` | Portfolio unit/integration tests |

---

## Pass/fail criteria

The suite exits with code `0` (PASS) when all tests pass, or non-zero (FAIL) when any test fails. This makes it suitable for use in CI pipelines:

```yaml
- name: Regression pack
  run: ./scripts/test-regression.sh
```

A Playwright HTML report is written to `playwright-report/` after each run.

---

## Infrastructure

- **Global setup** (`tests/e2e/global-setup.ts`) — seeds two test tenants (Tenant A and Tenant B) before the suite. Credentials are written to `tests/e2e/.auth/seed-info.json`.
- **Portfolio seed** — the regression spec seeds its own isolated portfolio group, two companies, and portfolio_owner/viewer users at runtime. These are created directly via SQL so the register rate limit (5/hr) is not hit.
- **Playwright projects** — API specs (no `.browser.spec.ts` suffix) run in the `api` project without a browser. The regression spec is an API spec.
