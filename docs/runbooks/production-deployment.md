# Production Deployment Runbook

Use this runbook for production deployments after production readiness has been confirmed green. It is intentionally operational: complete each check, deploy from `main`, smoke the release, and keep rollback ready.

If a release includes migrations or catalogue reconciliation, attach a migration-specific plan and rollback decision before starting. The August 2026 SME release uses [2026-08-27-sme-release-migration.md](./2026-08-27-sme-release-migration.md).

Production deployment is manual-gated. Pushing or merging to `main` must not deploy production automatically. Use the `Deploy to Hetzner` GitHub Actions workflow, provide `confirm_target=production`, and complete any configured `production` environment approval before deployment starts.

Do not use the production deployment workflow for staging/pre-production validation. Use `docs/runbooks/staging-deployment.md` and the `Deploy to Staging` workflow when validating a release before production.

For the August 2026 SME release, the deployment workflow keeps the live checkout intact, builds the candidate in a versioned Git worktree, checks that the target database identity is unchanged, validates disk headroom, creates a database/evidence recovery point, and proves that the dump restores into a disposable database before pausing writes.

Runtime configuration is parsed as dotenv data by Node and passed to PM2 through `ecosystem.config.cjs`; `.env` is never sourced or executed by a shell. The workflow preserves allowlisted settings that are already live when an optional GitHub environment secret is absent. Secret values must never be printed in workflow logs.

At cutover the workflow:

1. creates a deployment write-lock file and stops the previous PM2 process;
2. captures a coordinated custom-format database dump and the resolved evidence directory with checksums and a byte/file manifest;
3. boots the candidate on private port 5001 with its scheduler deliberately dormant and requires database, app-shell and exact-SHA health;
4. switches PM2 to port 5000 while all non-read requests return a retryable 503; the scheduler reports running but does not poll or enqueue work while the lock exists;
5. verifies the local process and local HTTPS reverse proxy, records `/root/esg-current`, saves PM2 state, then removes the write lock.

Before the write lock is removed, any candidate failure automatically restores the coordinated database/evidence point and restarts the previous release. If the restore itself fails, the workflow deliberately leaves the old application stopped instead of running it against a partially upgraded database.

## 1. Pre-Deploy Checks

Confirm the release is being deployed from the latest reviewed `main` commit.

Required environment and dependency checks:

- [ ] `DATABASE_URL` points to the production PostgreSQL database.
- [ ] `SESSION_SECRET` is set, production-only, and at least 32 characters.
- [ ] `MFA_ENCRYPTION_KEY` is set and stable across deploys.
- [ ] `APP_BASE_URL` matches the production user-facing URL.
- [ ] `CSRF_TRUSTED_ORIGINS` or `REPLIT_DOMAINS` includes the exact production origin.
- [ ] `SESSION_COOKIE_SECURE` is unset or `true` in production.
- [ ] `RESEND_API_KEY` is configured if invite/password-reset email is enabled.
- [ ] `AI_INTEGRATIONS_OPENAI_API_KEY` is configured if AI report narrative features are enabled.
- [ ] `AI_INTEGRATIONS_OPENAI_BASE_URL` is set to `https://api.openai.com/v1` if AI features are enabled.
- [ ] `AI_INTEGRATIONS_OPENAI_MODEL` is unset to use the application default, or explicitly set to an approved accessible production chat model. The deploy workflow validates that a supplied runtime model is configured without enforcing one specific model name.
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and plan price IDs are configured if billing is enabled.
- [ ] Production database connectivity has been verified by the platform operator.
- [ ] Generated report files are backed by database storage and included in database backups.
- [ ] Evidence upload storage under `uploads/evidence` is persistent across deploys/restarts if evidence uploads are enabled.
- [ ] The production database role can create/drop a disposable rehearsal database and restore a custom dump.
- [ ] There are no duplicate `(country, factor_year, name)` emission-factor rows; the workflow also checks this before taking downtime.
- [ ] The workflow's early and post-build capacity checks pass: the release/backup filesystem reserves a candidate release, two database-size allowances, same-volume evidence allowance and 1 GiB; a separate evidence volume reserves a full restored copy plus 1 GiB.
- [ ] PostgreSQL storage has room for the disposable restored clone. The restore rehearsal proves this immediately before cutover, but application-host `df` cannot measure a separately hosted database volume.
- [ ] The platform/operator backup outside the application disk is current; the per-release recovery point is not a substitute for off-host disaster recovery.
- [ ] No production secrets are present in the repository, build logs, or deployment notes.
- [ ] The pinned production Ed25519 host-key fingerprint still matches the independently verified server key; rotate it only through a reviewed workflow change.

Required backup and storage checks:

- [ ] Latest production database backup timestamp is recorded.
- [ ] Backup restore path is known and documented in `docs/backup-restore.md`.
- [ ] Backup includes `generated_files` because historical report exports are stored in PostgreSQL.
- [ ] Evidence storage backup/retention path is confirmed if file uploads are enabled.

Required local/release validation:

```bash
npm run audit:prod
npm run build
npm run test:security
npm run check:secrets
npm run check:lockfile
```

Do not proceed if any command fails unless the release owner records an explicit acceptance decision.

## 2. Deploy Steps

These are high-level steps only. Use the existing production deployment mechanism for the environment.

1. Confirm the release commit on `main`.
2. Confirm every migration/data reconciliation is documented and covered by the exact-commit release gate.
3. Confirm the latest production backup timestamp and rollback owner.
4. Trigger the manual `Deploy to Hetzner` GitHub Actions workflow from `main` with `confirm_target=production`.
5. Wait for the deployment to finish.
6. Confirm the workflow reported a successful disposable restore rehearsal, coordinated recovery point, private candidate boot and reverse-proxy health check.
7. Confirm the deployed commit matches the intended `main` commit.
8. Confirm the application health endpoint and logs show the app booted successfully.
9. Keep the previous release identifier available until smoke checks pass.

## 3. Production Smoke Checklist

Run smoke checks with an approved internal/safe tenant. Do not create customer-facing test data.

Authentication and security:

- [ ] Login succeeds for an approved internal user.
- [ ] Logout invalidates the session.
- [ ] MFA challenge works for an MFA-enabled test user.
- [ ] Step-up authentication is required for sensitive settings where applicable.
- [ ] Settings/admin pages are accessible only to authorized admin/super-admin users.
- [ ] Audit Log UI is visible only to authorized admins.

Core report flows:

- [ ] Report generation starts and completes for the approved tenant.
- [ ] Report readiness metadata shows the correct reporting period and scope.
- [ ] Report Library lists historical reports for the tenant.
- [ ] Opening a historical report shows the selected immutable snapshot.
- [ ] Export/download works for an available generated file.
- [ ] Expired, deleted, or unavailable report files cannot be opened.
- [ ] Export/download actions write safe audit-log entries.

Account and notification flows:

- [ ] Password reset email is sent and the reset link works, if email is configured.
- [ ] Invite email is sent and the accept link works, if invite testing is approved.
- [ ] Email failures are logged safely and do not expose tokens.

Integration checks:

- [ ] Generated report files remain accessible after deployment.
- [ ] Evidence files remain accessible if evidence uploads are enabled.
- [ ] AI narrative generation behaves as expected if AI is enabled.
- [ ] Billing pages/webhooks behave as expected if billing is enabled.

## 4. Rollback Checklist

If smoke checks fail or production health degrades:

1. Stop further production changes.
2. Record the failing endpoint, user action, deployed commit, timestamp, and log correlation details.
3. If failure occurred before the workflow removed its write lock, inspect the workflow result: it should already have restored the coordinated recovery point and restarted the previous release.
4. If failure occurred after a completed cutover, stop writes and use the exact recovery procedure in `docs/backup-restore.md`. Do not run the previous app against the upgraded August 2026 factor catalogue.
5. Confirm generated report files remain accessible after rollback.
6. Confirm evidence files remain accessible after rollback.
7. Verify login/logout and session behavior after rollback.
8. Verify MFA/step-up behavior after rollback.
9. Review audit logs for failed export/download/auth actions during the incident window.
10. Document whether any follow-up cleanup is required.

An application-only rollback to `a178ae2` is not safe after the August 2026 catalogue reconciliation: that version can select across factor years nondeterministically. Before the release becomes writable, automatic rollback restores the matched database and evidence point. After the release becomes writable, any restore is an incident decision because it discards later writes; record the cutoff time, affected users and data-loss assessment first.

## 5. Post-Deploy Monitoring

Monitor the following for at least the initial post-deploy window:

- Auth/session failures and unexpected 401/403 spikes.
- MFA, step-up, password reset, and invite failures.
- Report generation, readiness, export, and generated-file download failures.
- Report Library stale/unavailable file access failures.
- Audit-log write failures.
- Rate-limit spikes, especially login, MFA, password reset, invite, API key, audit-log, evidence, and report endpoints.
- Evidence upload failures and storage errors.
- Email provider errors.
- AI integration errors.
- Billing/payment provider errors.
- Slow dashboard, ESG Profile, evidence coverage, report, and export endpoints.

Escalate immediately if failures indicate cross-tenant leakage, sensitive data exposure, inaccessible generated files, broken auth/session handling, or audit-log write failures.

## 6. Required References

- Production readiness: `docs/PRODUCTION_READINESS.md`
- Deployment checklist: `docs/deployment-checklist.md`
- Backup and restore: `docs/backup-restore.md`
- Report Library readiness: `docs/report-library-deploy-readiness.md`
- Dependency and supply-chain posture: `docs/dependency-supply-chain-hardening.md`
- Security regression suite: `docs/security-regression-suite.md`
- Staging deployment: `docs/runbooks/staging-deployment.md`
