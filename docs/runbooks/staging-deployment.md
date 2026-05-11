# Staging Deployment Runbook

Use this runbook to deploy the latest reviewed `main` commit to staging/pre-production only. Do not use the production deployment workflow or production host for staging validation.

The staging deployment path is manual by design. It is triggered from GitHub Actions with `workflow_dispatch` in `.github/workflows/deploy-staging.yml` and requires a separate `staging` environment with staging-only secrets.

## 1. Isolation Requirements

- Staging must use a separate host from production.
- Staging must use a separate application directory from production.
- Staging must use a separate PM2 process name from production.
- Staging must use a separate PostgreSQL database from production.
- Staging evidence uploads under `uploads/evidence` must use persistent staging storage and must not share the production evidence volume.
- Staging generated report files are stored in PostgreSQL via `generated_files`; staging backups must include that table.
- Staging secrets must use the `STAGING_` prefix in GitHub Actions. Do not reuse production secrets.

The workflow rejects these unsafe targets:

- `STAGING_APP_DIR=/root/ESG`
- `STAGING_PM2_PROCESS=esg`
- `STAGING_SERVER_HOST` matching `SERVER_HOST`
- missing or incorrect `confirm_target`

## 2. Required GitHub Environment

Create a GitHub Actions environment named `staging`.

Recommended protection:

- Require manual approval from a deployment operator.
- Restrict environment secret editing to repository administrators.
- Keep production secrets out of the staging environment.

## 3. Required Staging Secrets

Deployment target secrets:

- `STAGING_SERVER_HOST`
- `STAGING_SERVER_USER`
- `STAGING_SERVER_SSH_KEY`
- `STAGING_APP_DIR`
- `STAGING_PM2_PROCESS`

Application secrets:

- `STAGING_DATABASE_URL`
- `STAGING_SESSION_SECRET`
- `STAGING_MFA_ENCRYPTION_KEY`
- `STAGING_APP_BASE_URL`
- `STAGING_CSRF_TRUSTED_ORIGINS`
- `STAGING_REPLIT_DOMAINS`
- `STAGING_RESEND_API_KEY`
- `STAGING_AI_INTEGRATIONS_OPENAI_API_KEY`
- `STAGING_AI_INTEGRATIONS_OPENAI_BASE_URL`
- `STAGING_STRIPE_SECRET_KEY`
- `STAGING_STRIPE_WEBHOOK_SECRET`
- `STAGING_STRIPE_PRO_PRICE_ID`

The workflow maps staging secrets to the application’s runtime environment variable names on the staging host. The generated `.env` file is copied to `STAGING_APP_DIR/.env` on the staging host and is not committed to the repository.

## 4. Staging Host Preparation

Before first deploy, prepare the staging host:

1. Create `STAGING_APP_DIR`.
2. Clone the repository into `STAGING_APP_DIR`.
3. Ensure the staging deploy user can run `git fetch`, `npm ci`, `npm run build`, and `pm2`.
4. Ensure the staging deploy user can write `STAGING_APP_DIR/.env`.
5. Ensure `uploads/evidence` is backed by persistent staging storage.
6. Ensure the staging PostgreSQL database is reachable from the staging host.
7. Confirm staging database backups and restore procedure.

Do not run destructive cleanup against staging unless the target database and evidence storage are explicitly disposable.

## 5. Pre-Deploy Validation

Run these checks locally or in CI against the candidate commit before triggering staging deployment:

```bash
npm run audit:prod
npm run build
npm run test:security
npm run check:secrets
npm run check:lockfile
```

Do not proceed if any command fails.

## 6. Deploy Staging

1. Open GitHub Actions.
2. Select `Deploy to Staging`.
3. Click `Run workflow`.
4. Set `ref` to `main` or the exact reviewed commit SHA.
5. Set `confirm_target` to `staging`.
6. Confirm the environment approval if configured.
7. Wait for the workflow to finish.
8. Record:
   - deployed commit SHA
   - staging target host
   - timestamp
   - workflow run URL
   - platform warnings

Do not trigger the production `Deploy to Hetzner` workflow while staging validation is in progress.

## 7. Staging Smoke Checklist

Run smoke checks with a staging-only user and staging-only tenant data.

Authentication and settings:

- [ ] Login succeeds.
- [ ] Logout invalidates the session.
- [ ] MFA and step-up auth work.
- [ ] Settings/admin access matches role permissions.
- [ ] Invite/password reset work if staging email is configured.
- [ ] API key create/revoke/auth failure path is safe.

Reports and files:

- [ ] Report generation completes.
- [ ] Report Library lists historical reports.
- [ ] Historical report viewing opens the selected snapshot.
- [ ] Export/download generated reports works.
- [ ] Generated report metadata shows the correct period and scope.
- [ ] Generated report files persist across restart or redeploy.

Audit and isolation:

- [ ] Audit Log UI shows safe metadata only.
- [ ] Cross-tenant isolation spot check passes.
- [ ] Failed auth/export/download attempts do not leak secrets or stack traces.

Evidence:

- [ ] Evidence upload storage under `uploads/evidence` persists across restart or redeploy.
- [ ] Evidence downloads work for authorized staging users.
- [ ] Evidence from one tenant is not visible to another tenant.

## 8. Monitoring Checks

Inspect staging logs for:

- auth failures
- report generation/export failures
- audit-log write failures
- rate-limit anomalies
- evidence upload/storage errors
- email provider errors
- AI integration errors
- billing integration errors
- unsafe stack traces or secret leakage

If any high-risk issue appears, stop staging promotion and fix it in a focused PR with regression coverage.

## 9. Rollback

If staging deploy fails:

1. Stop further staging deploy attempts.
2. Record the workflow run URL, deployed ref, failing step, and timestamp.
3. Redeploy the previous known-good staging commit with `Deploy to Staging`.
4. Confirm staging database compatibility before rollback if the failed release included data-shape changes.
5. Confirm generated reports and evidence files remain accessible.
6. Run the staging smoke checklist again.

Do not use production rollback procedures for staging unless the staging target has been explicitly configured to mirror production operations.
