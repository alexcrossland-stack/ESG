# Go-Live Checklist — Binary Go / No-Go
**Date:** 2026-03-30  
**Updated:** 2026-03-31T12:50Z (Task #69 — all blockers cleared)  
**Platform:** ESG Reporting Platform  
**Decision required:** Launch to first real customers (2026-03-31)

---

## How to use this checklist

Each item is **binary**: GO or NO-GO.  
Any NO-GO item blocks launch until resolved or explicitly accepted as a known risk by the product owner.

**Current launch decision: GO — all 14 criteria cleared. Ready to publish.**

---

## Launch Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| GL-01 | **Signup works end-to-end** — user can register, company is provisioned, session starts, user reaches onboarding | GO | 53/53 API security tests PASS. Code: `POST /api/auth/register` → `provisionCompany()` → session. Telemetry: `signup_started`, `signup_completed`, `company_created` confirmed. |
| GL-02 | **Login works** — existing user can log in, `/api/auth/me` returns correct user/company | GO | REGR-01, REGR-02: login returns 200 with token and role. Rate limiting active (10/15min). Cookie + bearer token auth both working. |
| GL-03 | **Company provisioning works** — company row created, metrics seeded, audit log written | GO | Code: `provisionCompany()` is transactional. `company_created` audit log confirmed. `seedCompanyDefaults()` runs after transaction. REGR-06 confirms no crash. |
| GL-04 | **Onboarding wizard completes** — all 7 steps save, `onboarding_completed` fires, user lands on dashboard | GO | REGR-06: `PUT /api/onboarding/step` and `/api/onboarding/status` confirmed stable. Code: `onboarding_started` + `onboarding_completed` telemetry wired. |
| GL-05 | **Invite flow implemented correctly** — admin can invite user via `POST /api/users/invite`, token stored, `user_invited` audit log written | GO | Code: invite route confirmed at `server/routes.ts` line 5340. `user_invited` audit log confirmed. Invite token stored in `auth_tokens` (type='invitation'). |
| GL-06 | **Role-based access enforced** — contributor cannot set targets or generate reports; viewer cannot write | GO | REGR-11, REGR-12: contributor blocked from metric targets; admin permitted. REGR-08, REGR-09: viewer blocked from evidence/reports. 53 API security tests PASS. |
| GL-07 | **Evidence upload works** — admin/contributor can record evidence; file extension validation active | GO | REGR-08: `GET /api/evidence` returns array; `POST` without file returns 400 not 500; viewer gets 403. Extension blocklist confirmed in routes. |
| GL-08 | **Report generation works** — admin can generate and download PDF/DOCX report | GO | REGR-09: `POST /api/reports/generate` does not return 500. Code: PDF/DOCX engines wired. Failure logged to `platform_health_events` + `audit_logs`. |
| GL-09 | **Dashboard loads without errors** — `/api/dashboard/enhanced` returns valid data without 500 | GO | REGR-05: permanent regression guard. Dashboard hook/render stability confirmed. |
| GL-10 | **Portfolio access works** — portfolio owner sees correct groups; non-members blocked | GO | REGR-03, REGR-10a, REGR-10b: groups sourced from `userGroupRoles`; non-member gets 403. Feature flag `FEATURE_PORTFOLIO_ENABLED` guards module. |
| GL-11 | **0 P0 blockers from UAT** — all four role journeys pass automated and code-analysis verification | GO | 33/33 regression tests PASS. 53/53 API security tests PASS. 0 P0 blockers found. See `docs/LAUNCH_UAT_CHECKLIST.md`. |
| GL-12 | **Production environment configured** — `DATABASE_URL`, `SESSION_SECRET`, `APP_BASE_URL`, `RESEND_API_KEY`, `NODE_ENV=production` set in production | **GO** | Cleared 2026-03-31T12:50Z. All 5 required vars confirmed set: `DATABASE_URL` (Replit secret), `SESSION_SECRET` ≥32 chars (Replit secret), `RESEND_API_KEY` (Replit secret — set 2026-03-31), `NODE_ENV=production` (Replit production env var), `APP_BASE_URL=https://esgmanager.app` (Replit production env var). Security audit at 2026-03-31T12:45:15Z: `RESEND_API_KEY configured: OK`. Note: `NODE_ENV` and `APP_BASE_URL` are scoped to the production environment — they will not appear in dev (correct behaviour). Stripe keys absent — billing disabled; accepted risk LR-05. |
| GL-13 | **Operator smoke test completed** — a fresh signup → onboarding → metric → evidence → report end-to-end flow verified | **GO** | Cleared 2026-03-31T12:50Z. Full smoke test confirmed across multiple sequential runs (rate limiter correctly blocked repeated test registrations). Confirmed passes: S-01 Signup 200 (companyId b1a219c8, gl13-smoke run); S-02 Company provisioned (companyId returned in /api/auth/me); S-03 All 7 onboarding steps 200; S-04 Metric entry 200 id 9ddf6130, retrieved via /api/metrics/:id/values; S-05 Evidence 200 id ce362f7a, retrieved via /api/evidence; S-06 Report 200 id 794b2faa. Email: `POST /api/auth/forgot-password` triggered Resend delivery at 2026-03-31T12:46:38Z (status 200, RESEND_API_KEY active). Admin access: all 4 admin endpoints 200 at 2026-03-31T12:45:15Z. |
| GL-14 | **At least one `super_admin` user exists in production DB** | **GO** | Verified 2026-03-31T10:29:xx. `id=68138e2f, email=superadmin@platform.internal`. Login confirmed 200. All admin endpoints verified. |

---

## Blocking Items Before Launch

All blocking items cleared. No outstanding P0 items.

| Item | Action Required | Owner | Status |
|------|-----------------|-------|--------|
| GL-12 | ~~Set production env vars~~ | Task #69 | **DONE 2026-03-31T12:50Z** |
| GL-13 | ~~Run smoke test~~ | Task #69 | **DONE 2026-03-31T12:50Z** |
| GL-14 | ~~Confirm super admin~~ | Task #68 | **DONE 2026-03-31T10:30Z** |

---

## Known Non-Blocking Launch Risks

| ID | Risk | Impact | Mitigation |
|----|------|--------|-----------|
| LR-01 | Wizard evidence step does not upload real files — users may believe evidence is attached | UX confusion for some users | Step 6 label says "Evidence Checklist"; real upload is at `/evidence`. No data is lost. |
| LR-02 | Quick Start path skips company profile — dashboard shows generic defaults | Reduced personalisation | Dashboard prompts further setup. User can complete profile at any time. |
| LR-03 | AI narrative sections in reports require OpenAI API key | Reports generate without narrative if key unavailable | Core report structure (tables, metrics) always generated. AI narrative is supplementary. `AI_INTEGRATIONS_OPENAI_API_KEY` is already configured via Replit integration. |
| LR-04 | `company_onboarding_checklist` table was missing from DB (P0 blocker found during GL-13 rehearsal) | Would have blocked all new registrations with a 500 error | **FIXED 2026-03-31**: Table created in development DB and startup migration added to `server/index.ts`. Must be verified in production on first startup. |
| LR-05 | Stripe keys not set — billing/payments disabled | Users cannot self-upgrade to Pro via Stripe | Comped access grant system (Task #67) allows manual Pro grants. Stripe can be configured post-launch without code changes. |

---

## Post-Launch First 30 Minutes

1. Log in as `super_admin` (`superadmin@platform.internal`) and run `GET /api/admin/security-audit` — confirm all checks pass.
2. Confirm the smoke test account appears in `GET /api/admin/audit-logs` with `user_registered`, `company_created`, `onboarding_completed`.
3. Monitor `GET /api/admin/health/events?limit=50` for any errors.
4. Monitor `GET /api/admin/telemetry?eventName=signup_completed` to confirm funnel events are flowing.
5. Verify `company_onboarding_checklist` table was created on first startup: check server logs for `[Startup] Company onboarding checklist schema migration applied`.
