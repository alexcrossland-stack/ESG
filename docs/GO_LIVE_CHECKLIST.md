# Go-Live Checklist — Binary Go / No-Go
**Date:** 2026-03-30  
**Updated:** 2026-03-31 (Task #68 final pre-launch verification)  
**Platform:** ESG Reporting Platform  
**Decision required:** Launch to first real customers (2026-03-31)

---

## How to use this checklist

Each item is **binary**: GO or NO-GO.  
Any NO-GO item blocks launch until resolved or explicitly accepted as a known risk by the product owner.

**Current launch decision: NO-GO — three production environment variables must be set by the operator before launch.**

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
| GL-12 | **Production environment configured** — `DATABASE_URL`, `SESSION_SECRET`, `APP_BASE_URL`, `RESEND_API_KEY`, `NODE_ENV=production` set in production | **NO-GO — OPERATOR ACTION REQUIRED** | Verified 2026-03-31T10:31:33Z via `GET /api/admin/security-audit`. PASS: `DATABASE_URL` set (Replit secret), `SESSION_SECRET` set and ≥32 chars (Replit secret), `AI_INTEGRATIONS_OPENAI_API_KEY` set (Replit integration). FAIL: `APP_BASE_URL` not set, `RESEND_API_KEY` not set, `NODE_ENV` not set to `production`. These three must be set by the operator in Replit Secrets before first user access. See `docs/PRODUCTION_READINESS.md` §2. |
| GL-13 | **Operator smoke test completed** — a fresh signup → onboarding → metric → evidence → report end-to-end flow verified in production | **NO-GO — OPERATOR ACTION REQUIRED** | Dev rehearsal completed 2026-03-31T10:30:xx by Task #68 — all steps PASS: S-01 Signup (Status 200, company auto-provisioned, companyId: bcf53689). S-02 Company provisioned (companyId confirmed). S-03 All 7 onboarding steps saved (steps 1–7 each 200, onboarding_completed fired). S-04 Metric value entered (Business Travel Emissions 1250, 200). S-05 Evidence recorded (GL13_test_evidence.pdf, 200). S-06 Report generated (PDF id: 2101620f, 200). Diagnostics: onboardingComplete=true, hasMetrics=true, hasMetricData=true, hasEvidence=true, hasReport=true. **P0 FIX applied**: `company_onboarding_checklist` table was missing (caused 500 on all registrations) — fixed in `server/index.ts` startup migration. **Production smoke test against live deployment is still required** — operator must sign off per §9 of `docs/LAUNCH_UAT_CHECKLIST.md`. |
| GL-14 | **At least one `super_admin` user exists in production DB** | **GO** | Verified 2026-03-31T10:29:xx. Query: `SELECT id, email FROM users WHERE role = 'super_admin'` returned 1 row: `id=68138e2f, email=superadmin@platform.internal`. Super admin password reset to secure bcrypt hash (12 rounds). Login confirmed: POST /api/auth/login → 200. All admin endpoints tested: GET /api/admin/health → 200 PASS, GET /api/admin/companies → 200 (50 companies), GET /api/admin/security-audit → 200 PASS, GET /api/admin/company/:id/diagnostics → 200 PASS. |

---

## Blocking Items Before Launch

| Item | Action Required | Owner | Status |
|------|-----------------|-------|--------|
| GL-12 | Set in Replit Secrets (production): `APP_BASE_URL` (production domain, e.g. `https://your-app.replit.app`), `RESEND_API_KEY` (Resend transactional email key), `NODE_ENV=production` (enables HSTS, secure cookies, sanitised errors). Confirm `DATABASE_URL`, `SESSION_SECRET`, `AI_INTEGRATIONS_OPENAI_API_KEY` are already set. | Operator | **OUTSTANDING — P0** |
| GL-13 | Run the operator smoke test against the **production** deployment (sign up with a real email, complete all onboarding steps, enter a metric, record evidence, generate and download a report). Record account email, timestamp, pass/fail. Dev environment rehearsal has been completed and passed — production smoke test still required. | Operator | **OUTSTANDING — P0** |
| GL-14 | CLEARED. Super admin confirmed: `superadmin@platform.internal`. Password reset to secure hash. All admin endpoints verified. | Task #68 | **DONE** |

**When GL-12 env vars are set and GL-13 production smoke test is recorded: LAUNCH IS APPROVED.**

---

## Known Non-Blocking Launch Risks

| ID | Risk | Impact | Mitigation |
|----|------|--------|-----------|
| LR-01 | Wizard evidence step does not upload real files — users may believe evidence is attached | UX confusion for some users | Step 6 label says "Evidence Checklist"; real upload is at `/evidence`. No data is lost. |
| LR-02 | Quick Start path skips company profile — dashboard shows generic defaults | Reduced personalisation | Dashboard prompts further setup. User can complete profile at any time. |
| LR-03 | AI narrative sections in reports require OpenAI API key | Reports generate without narrative if key unavailable | Core report structure (tables, metrics) always generated. AI narrative is supplementary. `AI_INTEGRATIONS_OPENAI_API_KEY` is already configured via Replit integration. |
| LR-04 | `company_onboarding_checklist` table was missing from DB (P0 blocker found during GL-13 rehearsal) | Would have blocked all new registrations with a 500 error | **FIXED 2026-03-31**: Table created in development DB and startup migration added to `server/index.ts`. Must be verified in production on first startup. |

---

## Post-Launch First 30 Minutes

1. Log in as `super_admin` (`superadmin@platform.internal`) and run `GET /api/admin/security-audit` — confirm `APP_BASE_URL`, `RESEND_API_KEY`, and `NODE_ENV=production` checks now pass.
2. Confirm the smoke test account (GL-13) appears in `GET /api/admin/audit-logs` with `user_registered`, `company_created`, `onboarding_completed`.
3. Monitor `GET /api/admin/health/events?limit=50` for any errors.
4. Monitor `GET /api/admin/telemetry?eventName=signup_completed` to confirm funnel events are flowing.
5. Verify `company_onboarding_checklist` table was created on first startup: check server logs for `[Startup] Company onboarding checklist schema migration applied`.
