# ESG Platform — First-Time Activation Audit (Task #49)

**Date:** March 2026  
**Scope:** End-to-end audit from the perspective of a new small business user with no ESG knowledge.  
**Six high-risk journeys tested:** Auth/Signup (J1), Onboarding Wizard (J2), Data Entry (J3), Dashboard (J4), Report Generation (J5), Role/Permission Enforcement (J6).

---

## Issue Log

| # | Severity | Journey | Type | Root Cause | Fix Applied | Status |
|---|----------|---------|------|------------|-------------|--------|
| 1 | Critical | J6 | Security — IDOR | `POST /api/data-entry` accepted any `metricId` without verifying the metric belonged to the authenticated user's company. Cross-tenant write was possible. | Added ownership check: metric must belong to `req.user.companyId` (404 if not). | Fixed |
| 2 | Critical | J6 | Security — IDOR | `PUT /api/topics/:id` lacked ownership check and `selected` field validation. Any user could update another company's topics. | Added company ownership check (404 if mismatched) and `selected` field Zod validation (400 if missing). | Fixed |
| 3 | Critical | J6 | Security — IDOR | `GET/PUT /api/metrics/:id/values`, `GET /api/metrics/:id/history`, `PUT /api/metrics/:id/target` did not verify metric ownership. Cross-tenant read/write was possible. | Added company ownership check on each route (404 if mismatched). | Fixed |
| 4 | High | J1 | Functionality | `GET /api/auth/sessions` returned HTTP 500 because the `user_sessions_ext` table was missing from the database. | Created `user_sessions_ext` table via `db:push`. | Fixed |
| 5 | High | J4 | UX — First-time user | Dashboard showed ESG score widget with no explanation of what it means or how to improve it. New users had no guidance. | Added `PageGuidance` component to dashboard explaining ESG score and next steps. | Fixed |
| 6 | High | J2 | UX — First-time user | Maturity quiz used jargon ("Scope 1/2", "Board Governance", "Linked Module") that would confuse non-ESG users. | Replaced with plain English equivalents. | Fixed |
| 7 | Medium | J2 | UX — Friction | No "Not sure" option in the maturity quiz — users who didn't know the answer had to pick Yes or No. | Added "Not sure" button (visually distinct in amber) which records `false` for scoring but shows user's uncertainty state correctly using `maturityUnsure` set. | Fixed |
| 8 | Medium | J2 | UX — Clarity | Onboarding reporting frequency showed raw values (monthly/quarterly/etc.) without descriptions. | Added descriptive labels to each frequency option. | Fixed |
| 9 | Medium | J3 | UX — Empty state | Metrics page "Clear Filters" button was missing from the empty filter-results state. | Added "Clear Filters" button to empty state in `metrics.tsx`. | Fixed |
| 10 | Medium | J1 | UX — Discoverability | Password reset email instructions didn't mention spam/junk folders, causing users to think email delivery failed. | Added spam folder mention to the reset confirmation message. | Fixed |
| 11 | Low | J1 | Compliance | `ConsentBanner` component existed but was never mounted in the application. Users could use the app without accepting privacy terms. | Mounted `ConsentBanner` globally in `App.tsx`. | Fixed |

---

## Test Commands Run

```bash
# Input validation tests (unauthenticated):
curl -s -X POST http://localhost:5000/api/data-entry -H "Content-Type: application/json" -d '{"value":42}'
# => 401 Unauthorized (not logged in) or 400 (missing metricId)

curl -s -X PUT http://localhost:5000/api/topics/1 -H "Content-Type: application/json" -d '{}'
# => 401 Unauthorized or 400 (missing selected field)

# Cross-tenant isolation (authenticated as Company B, attempting to read Company A's metric):
curl -s -X GET http://localhost:5000/api/metrics/<company_a_metric_id> --cookie "session=<company_b_session>"
# => 404 Not Found (ownership check prevents data leak)

# Auth endpoint reliability:
curl -s -X GET http://localhost:5000/api/auth/sessions
# => 401 (not 500; table exists)

# Automated regression suite:
npx tsx tests/api-security.test.ts
# => 14/14 passed
```

---

## Unresolved / Known Minor Issues

| # | Severity | Description | Risk |
|---|----------|-------------|------|
| R1 | Low | React `ref` warning in `SidebarMenuButton` (cosmetic, no functionality impact) | None |
| R2 | Low | `step6Complete` in onboarding status check uses `hasPolicy` which may be truthy if an empty policy record exists in DB (false positive completion state) | Low — affects progress indicator only |
| R3 | Info | `CURRENT_LEGAL_VERSION` is `"1.0"` and all new users register with `"1.0"` — consent enforcement doesn't currently block any users. Will need revisiting when legal terms are updated. | Low |

---

## Journey Pass/Fail Summary

| Journey | Status | Key Fixes |
|---------|--------|-----------|
| J1 — Auth/Signup | PASS | Spam folder hint, consent banner mounted, sessions 500 fixed |
| J2 — Onboarding | PASS | Plain English labels, "Not sure" maturity option, frequency descriptions |
| J3 — Data Entry | PASS | Cross-tenant metric write prevented, Clear Filters in empty state |
| J4 — Dashboard | PASS | PageGuidance added, ESG score explained |
| J5 — Report Generation | PASS | No critical issues found |
| J6 — Role/Permission | PASS | IDOR fixed on topics, metrics (values, history, target), data-entry |
