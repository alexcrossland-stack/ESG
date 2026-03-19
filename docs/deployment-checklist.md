# Deployment Checklist

Complete this checklist before every production deployment.

## 1. Environment Variables

- [ ] `DATABASE_URL` is set and points to the production database
- [ ] `SESSION_SECRET` is set, at least 32 characters, and different from development
- [ ] `APP_BASE_URL` is set to the production domain (e.g. `https://your-app.replit.app`)
- [ ] `RESEND_API_KEY` is set for transactional email
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID` are set if billing is enabled
- [ ] `AI_INTEGRATIONS_OPENAI_API_KEY` is set if AI features are required
- [ ] No `.env` file or raw secrets are committed to version control

## 2. Security Configuration

- [ ] `NODE_ENV=production` is set
- [ ] Session cookies use `secure: true`, `httpOnly: true`, `sameSite: "none"` (set by default in production)
- [ ] HSTS header is active (enabled automatically when `NODE_ENV=production`)
- [ ] `Referrer-Policy` and `X-Content-Type-Options` headers are set (Helmet handles this)
- [ ] CSP is reviewed and does not allow unsafe origins
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

## 6. Backup & Monitoring

- [ ] Automated database backups are configured (see `docs/backup-restore.md`)
- [ ] Platform health monitoring is active (`/api/admin/health`)
- [ ] Audit log retention policy is configured (default: all logs kept)

## 7. Post-Deployment

- [ ] Login with a test account and verify session works
- [ ] Verify rate limiting returns 429 correctly
- [ ] Verify `/api/auth/me` returns 401 for unauthenticated requests
- [ ] Check `/api/admin/security-audit` for any failed security checks
- [ ] Confirm email delivery works (test password reset)
- [ ] Check platform health events in the admin panel
