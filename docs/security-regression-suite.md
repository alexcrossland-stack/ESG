# Security Regression Suite

Last updated: 2026-05-10

## Purpose

The security hardening phase adds focused regressions for auth, settings/admin, API keys, invitations, MFA, session lifecycle, report exports, generated files, audit logs, rate limiting, CSRF, headers, response sanitization, and operational containment actions.

Use this suite before merging security-sensitive changes.

## Prerequisites

- A local/dev Postgres `DATABASE_URL` with the current schema.
- Node dependencies installed.
- Optional: `SECURITY_TEST_BASE_PORT` to choose the first port used by the runner. Default is `5070`.

The runner starts and stops local app servers itself. It uses fresh server processes for API buckets so in-memory rate-limit state does not leak between unrelated suites.

## Commands

Run API security regressions:

```bash
DATABASE_URL="postgresql://<user>@127.0.0.1:55432/<db>" \
npm run test:security:api
```

Run browser security regressions:

```bash
DATABASE_URL="postgresql://<user>@127.0.0.1:55432/<db>" \
npm run test:security:browser
```

Run both:

```bash
DATABASE_URL="postgresql://<user>@127.0.0.1:55432/<db>" \
npm run test:security
```

## Included Coverage

- Settings/admin role and tenant boundaries
- Invite and identity-provider hardening
- API key and token lifecycle hardening
- Auth-token timestamp handling
- Password reset expiry/reuse safety
- Session, cookie, and CSRF hardening
- Security response headers
- Sensitive response sanitization
- Operational/admin containment actions
- Report export authorization and content integrity
- Generated report file lifecycle
- Report export audit logging and visibility
- Audit-log retention and immutability
- Security audit-log completeness
- Permission matrix regressions
- Abuse/rate-limit protections
- Settings/security browser flows
- Audit-log UI access controls

## CI Note

The repository currently only has a deployment workflow under `.github/workflows/deploy.yml`. No CI test workflow is present to extend safely in this batch. Recommended repository setting: add a non-deploy pull-request workflow that starts a disposable Postgres service, launches the app, and runs `npm run test:security` plus `npm run build`.
