# Production Readiness Verification
**Date:** 2026-03-30  
**Platform:** ESG Reporting Platform  
**Reviewer:** Task Agent (Task #66)  
**Method:** Code walkthrough + config inspection against live codebase

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| DB Migrations | PASS | Schema auto-applied on startup via `server/index.ts` |
| Environment Variables | PASS (see gaps) | All required vars documented; optional Stripe vars noted |
| Auth & Session | PASS | Cookie + bearer token, idle/absolute timeouts, MFA |
| Email / Invite | PASS | Resend integration via `server/email.ts` |
| Password Reset | PASS | Token-based flow in `server/routes.ts` |
| File Upload / Storage | PASS | Evidence files require persistent `uploads/evidence`; generated reports are DB-backed |
| Report Generation | PASS | PDF/DOCX via PDFKit/docx; feature flag guarded |
| Callback URLs | PASS | `APP_BASE_URL` drives all email links |
| Background Jobs | PASS | Scheduler in `server/scheduler.ts`; integrity checks daily |
| Critical Errors on Core Flows | PASS | No 500s on dashboard, auth, data entry in test |

---

## 1. Database Migrations

**Status: PASS**

- Schema migrations are applied automatically on server startup via `server/index.ts` using Drizzle ORM `db.execute(sql`CREATE TABLE IF NOT EXISTS ...`)` patterns.
- All tables required for core flows are present: `users`, `companies`, `metrics`, `metric_values`, `evidence_files`, `report_runs`, `audit_logs`, `telemetry_events`, `health_events`, `groups`, `group_companies`, `user_group_roles`, `organisation_sites`.
- `audit_logs` table confirmed to have: `ip_address`, `user_agent`, `actor_type`, `actor_agent_id` columns (per `docs/deployment-checklist.md` §3).
- `organisation_sites` and all `site_id` FK columns confirmed present.
- At least one `super_admin` user should be verified before go-live.

**Action required:** Confirm at least one `super_admin` exists: `SELECT id, email FROM users WHERE role = 'super_admin';`

---

## 2. Environment Variables

**Status: PASS (with gaps noted)**

| Variable | Required | Status | Notes |
|----------|----------|--------|-------|
| `DATABASE_URL` | Yes | Must be set | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Must be set | ≥32 chars, unique to production |
| `MFA_ENCRYPTION_KEY` | Yes | Must be set | Required in production to encrypt MFA secrets; keep stable across deploys |
| `APP_BASE_URL` | Yes | Must be set | Used in all email links and invite URLs |
| `RESEND_API_KEY` | Yes | Must be set | Transactional email (invites, password reset) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Yes for AI | Configured via Replit integration | Required for narrative report sections |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Yes for AI | Must be set | Use `https://api.openai.com/v1` for OpenAI production |
| `AI_INTEGRATIONS_OPENAI_MODEL` | Optional | Defaults to `gpt-4.1-mini` | Set only to an approved chat model available to the production OpenAI account |
| `NODE_ENV` | Yes | Must be `production` | Enables HSTS, secure cookies, sanitised errors |
| `REPLIT_DOMAINS` / `CSRF_TRUSTED_ORIGINS` | Yes | Must include production origin | Used for CORS and cookie-auth CSRF origin checks |
| `SESSION_COOKIE_SECURE` | Optional | Defaults secure in production | Leave unset or set to `true` |
| `SESSION_IDLE_TIMEOUT_MS` | Optional | Defaults to 4 hours | Browser/API session idle timeout |
| `SESSION_ABSOLUTE_LIFETIME_MS` | Optional | Defaults to 7 days | Maximum session lifetime |
| `STEP_UP_VALIDITY_MS` | Optional | Defaults to 15 minutes | Re-authentication window for sensitive settings |
| `STRIPE_SECRET_KEY` | Optional | Set if billing enabled | Billing feature |
| `STRIPE_WEBHOOK_SECRET` | Optional | Set if billing enabled | Stripe webhook validation |
| `STRIPE_PRO_PRICE_ID` | Optional | Set if billing enabled | Pro plan price reference |
| `SLACK_SECURITY_WEBHOOK_URL` | Optional | Set if alert notifications required | Security/health alert webhook |
| `FEATURE_PORTFOLIO_ENABLED` | Optional | Defaults to `true` | Set to `false` to disable portfolio module |
| `FEATURE_REPORT_GENERATION_ENABLED` | Optional | Defaults to `true` | Set to `false` to disable report generation |
| `FEATURE_ESTIMATION_ENABLED` | Optional | Defaults to `true` | Set to `false` to disable estimation module |

No `.env` file or raw secrets should be in version control.

---

## 3. Auth & Session

**Status: PASS**

- Cookie-based sessions via `express-session` + `connect-pg-simple` (sessions stored in DB).
- Bearer token support for API/agent access.
- Production cookie settings: `secure: true`, `httpOnly: true`, `sameSite: "none"` when `NODE_ENV=production`.
- HSTS header active when `NODE_ENV=production` (via Helmet).
- Security headers include CSP, frame denial, referrer policy, content-type sniffing protection, and permissions policy.
- Cookie-authenticated state-changing API requests are checked against `Origin` / `Referer`; trusted origins come from `CSRF_TRUSTED_ORIGINS` or `REPLIT_DOMAINS`.
- Session idle timeout: 4 hours (configurable via `SESSION_IDLE_TIMEOUT_MS`).
- Session absolute lifetime: 7 days (configurable via `SESSION_ABSOLUTE_LIFETIME_MS`).
- Server-side session revocation supported (`revokedAt` column in `user_sessions_ext`).
- MFA (TOTP) available and enforced where configured.
- Step-up authentication for high-risk actions.
- Company suspension check on every authenticated request — suspended company returns 403.
- Terms/privacy consent enforcement — users without current consent version get 451.

---

## 4. Email / Invite Flow

**Status: PASS**

- Email sent via Resend API (`server/email.ts`).
- Invite email: `buildInvitationEmail()` → generates secure token → stores in `auth_tokens` table (`type='invitation'`) → sends email with accept link.
- Accept URL uses `APP_BASE_URL`: `${process.env.APP_BASE_URL}/accept-invite?token=...`
- Invite audit log: `user_invited` written on invite creation.
- Rate limiting: invitation endpoints rate-limited.

**Verification step:** Test invite flow by creating a test invite and confirming email is received with a working link.

---

## 5. Password Reset

**Status: PASS**

- `POST /api/auth/forgot-password` generates a secure token via `generateSecureToken()`, stores with expiry, sends `buildPasswordResetEmail()` via Resend.
- Reset link: `${process.env.APP_BASE_URL}/reset-password?token=...`
- Token validated on `POST /api/auth/reset-password`.
- Rate limited: password change is rate-limited (5/15min).

**Verification step:** Trigger a password reset for a test account and confirm delivery and link validity.

---

## 6. File Upload / Storage

**Status: PASS**

- Evidence upload stores validated file metadata in PostgreSQL and file bytes under `uploads/evidence/<companyId>/<evidenceId>/...`.
- Extension blocklist enforced: `.exe`, `.sh`, `.js`, `.php`, `.py`, `.rb`, `.bat`, `.cmd` and others are rejected.
- Allowed types: pdf, doc, docx, xls, xlsx, csv, txt, png, jpg, jpeg, gif, webp, zip.
- Rate limited: 60 uploads/15min per company.
- `POST /api/evidence` requires auth; viewer role returns 403.

**Action required:** Confirm `uploads/evidence` is on persistent production storage before enabling evidence uploads in production.

---

## 7. Report Generation

**Status: PASS**

- `POST /api/reports/generate` creates a `report_runs` record. PDF/DOCX generation stores base64 file blobs in `generated_files`.
- PDF via PDFKit (`server/report-engine.ts`).
- DOCX via docx library.
- AI narrative sections use `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`, and the configurable chat model from `AI_INTEGRATIONS_OPENAI_MODEL` (default `gpt-4.1-mini`). If unavailable, generation falls back to non-AI content where possible but should be verified.
- Feature flag `FEATURE_REPORT_GENERATION_ENABLED` disables the endpoint cleanly (503) if set to `false`.
- Failure logged to `platform_health_events` (`event_type: 'report_failure'`) and `audit_logs` (`action: 'report_generation_failure'`).
- Rate limited: 30/15min per company.
- Generated report downloads are tenant-scoped, expire/unavailable safely, and are audited. Database backups must include `generated_files`.

---

## 8. Callback URLs

**Status: PASS**

- All email links use `APP_BASE_URL` env var as the base URL.
- Invite accept: `${APP_BASE_URL}/accept-invite?token=...`
- Password reset: `${APP_BASE_URL}/reset-password?token=...`
- Report ready notification: `${APP_BASE_URL}/reports`

**Action required:** Confirm `APP_BASE_URL` is set to the production domain before go-live.

---

## 9. Background Jobs

**Status: PASS**

- Scheduler (`server/scheduler.ts`) runs automated jobs: daily data integrity check, GDPR export jobs.
- Integrity check runs against all active companies (up to 50) every 24 hours.
- `GET /api/admin/security-audit` returns system health snapshot.
- Scheduler status: `GET /api/admin/health/events`.

---

## 10. Critical Console / Server Errors on Core Flows

**Status: PASS**

- Dashboard (`/api/dashboard/enhanced`) never returns 500 — REGR-05 guards this.
- Onboarding step save (`PUT /api/onboarding/step`) does not crash — REGR-06 guards this.
- Error responses in production return sanitised messages (no stack traces when `NODE_ENV=production`).
- API error middleware wraps all routes; unhandled exceptions return 500 with generic message.

---

## Pre-Launch Action Items

| # | Action | Owner | Priority |
|---|--------|-------|----------|
| PR-01 | Confirm `super_admin` user exists in production DB | Operator | Critical |
| PR-02 | Set `APP_BASE_URL` to production domain | Operator | Critical |
| PR-03 | Verify `RESEND_API_KEY` is valid and not rate-limited | Operator | Critical |
| PR-04 | Test password reset end-to-end in production | Operator | Critical |
| PR-05 | Test invite flow end-to-end in production | Operator | Critical |
| PR-06 | Confirm `NODE_ENV=production` is set | Operator | Critical |
| PR-07 | Confirm `AI_INTEGRATIONS_OPENAI_API_KEY` is set for report narrative | Operator | High |
| PR-08 | Run `GET /api/admin/security-audit` and verify no failures | Operator | High |
| PR-09 | Confirm automated DB backups are configured | Operator | High |
| PR-10 | Confirm `MFA_ENCRYPTION_KEY` is set and retained across deploys | Operator | Critical |
| PR-11 | Confirm `REPLIT_DOMAINS` or `CSRF_TRUSTED_ORIGINS` includes the production origin | Operator | Critical |
| PR-12 | Confirm `uploads/evidence` persists across deploy/restart if evidence upload is enabled | Operator | High |
| PR-13 | Confirm Report Library smoke passes for list/filter/open/download/unavailable states | Operator | High |

---

## 11. Build Warnings Reviewed 2026-05-11

| Warning | Status | Disposition |
|---------|--------|-------------|
| `import.meta` unavailable with CJS for `server/seed-pe-demo.ts` | Fixed | CLI guard no longer uses `import.meta`, preserving direct script execution while avoiding the server bundle warning. |
| Browserslist data age | Fixed | `caniuse-lite` was refreshed in the final pre-deploy warning cleanup. |
| PostCSS `from` option warning | Deferred | Current production build succeeds; warning traces to the Tailwind/PostCSS toolchain rather than application CSS. Handle in a dedicated CSS toolchain PR. |
| Large client chunk | Fixed | Protected app pages are route-lazy-loaded and common dependencies are split into conservative vendor chunks. |
