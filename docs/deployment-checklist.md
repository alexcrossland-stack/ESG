# Deployment Checklist

Complete this checklist before every production deployment.

## 1. Environment Variables

- [ ] `DATABASE_URL` is set and points to the production database
- [ ] `SESSION_SECRET` is set, at least 32 characters, and different from development
- [ ] `MFA_ENCRYPTION_KEY` is set in production and is stable across deploys
- [ ] `APP_BASE_URL` is set to the production domain (e.g. `https://your-app.replit.app`)
- [ ] `RESEND_API_KEY` is set for transactional email
- [ ] Billing mode is explicit: Stripe keys are set if billing is enabled, or billing is intentionally disabled and checkout/subscription UI is unavailable
- [ ] `AI_INTEGRATIONS_OPENAI_API_KEY` is set if AI features are required
- [ ] `REPLIT_DOMAINS` or `CSRF_TRUSTED_ORIGINS` includes the production origin used by browser users
- [ ] `SESSION_COOKIE_SECURE` is unset or `true` in production
- [ ] `SESSION_IDLE_TIMEOUT_MS`, `SESSION_ABSOLUTE_LIFETIME_MS`, and `STEP_UP_VALIDITY_MS` are either unset to use safe defaults or intentionally configured
- [ ] No `.env` file or raw secrets are committed to version control

## 2. Security Configuration

- [ ] `NODE_ENV=production` is set
- [ ] Session cookies use `secure: true`, `httpOnly: true`, `sameSite: "none"` (set by default in production)
- [ ] HSTS header is active (enabled automatically when `NODE_ENV=production`)
- [ ] `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, and `Permissions-Policy` headers are set
- [ ] CSP is reviewed and does not allow unsafe origins; current app compatibility still permits inline/eval script for the bundled app runtime
- [ ] CSRF origin/referrer checks reject cookie-authenticated state-changing requests from untrusted origins
- [ ] The `/api/admin/*` routes are only accessible to `super_admin` users
- [ ] Error responses in production return sanitised messages (no stack traces)

## 3. Database

- [ ] Run any pending schema migrations before deploying
- [ ] Confirm `audit_logs` table has columns: `ip_address`, `user_agent`, `actor_type`, `actor_agent_id`
- [ ] Confirm `organisation_sites` and all `site_id` columns are present
- [ ] Verify at least one `super_admin` user exists

## 4. Rate Limiting

- [ ] Login attempts are rate-limited (10/15min per email/IP)
- [ ] Registration is rate-limited (5/hour)
- [ ] Password change is rate-limited (5/15min)
- [ ] Evidence uploads are rate-limited (60/15min)
- [ ] Report generation is rate-limited (30/15min)
- [ ] CSV imports are rate-limited (20/15min)
- [ ] AI/agent routes are rate-limited (20/min)

## 5. File Upload Security

- [ ] Evidence upload rejects blocked file extensions (`.exe`, `.sh`, `.js`, etc.)
- [ ] Only allowed file types are accepted: pdf, doc, docx, xls, xlsx, csv, txt, png, jpg, etc.
- [ ] Evidence upload storage directory (`uploads/evidence`) is on persistent production storage if evidence uploads are enabled
- [ ] Generated report files are stored in the database-backed `generated_files` table, not public static storage
- [ ] Generated report file retention cleanup is running and expired/unavailable files cannot be downloaded

## 6. Backup & Monitoring

- [ ] Automated database backups are configured (see `docs/backup-restore.md`)
- [ ] Backups include `generated_files` because historical PDF/DOCX blobs are stored in PostgreSQL
- [ ] Platform health monitoring is active (`/api/admin/health`)
- [ ] Audit log retention policy is configured (default: all logs kept)
- [ ] Export/download/security audit logs are visible to authorized admins only
- [ ] Optional `SLACK_SECURITY_WEBHOOK_URL` is configured if security/health alert notifications are required

## 7. Dependency And Supply-Chain Checks

- [ ] `npm run check:secrets` passes
- [ ] `npm run check:lockfile` passes
- [ ] `npm run audit:prod` passes
- [ ] Any future high-severity dependency findings are fixed in a focused dependency PR or explicitly accepted for this deploy by the release owner

## 8. Post-Deployment

- [ ] Login with a test account and verify session works
- [ ] Verify rate limiting returns 429 correctly
- [ ] Verify `/api/auth/me` returns 401 for unauthenticated requests
- [ ] Check `/api/admin/security-audit` for any failed security checks
- [ ] Confirm email delivery works (test password reset)
- [ ] Check platform health events in the admin panel
- [ ] Smoke the Reports tab Library: historical list, filters, selected snapshot, available file open/download, expired/deleted unavailable messaging

## 9. Known Build Warning Follow-Up

- [ ] PostCSS `from` option warning: investigate in a dedicated CSS toolchain PR; current build output is unaffected.

Resolved in final pre-deploy cleanup:

- [x] Browserslist data age warning: refreshed `caniuse-lite`.
- [x] Large client chunk warning: added route-level lazy loading and conservative vendor chunks.
