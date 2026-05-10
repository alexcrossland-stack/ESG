# Security Hardening Phase Close

Last updated: 2026-05-10

## Scope Closed

This phase hardened the highest-risk platform security surfaces without adding broad new product features or migrations.

Closed areas:

- Auth/session lifecycle: login, logout, password reset, MFA setup/change, recovery codes, step-up auth, session invalidation, and timestamp handling.
- Settings/admin access control: admin, contributor, viewer, and super-admin boundaries across settings routes and APIs.
- Invitation and identity-provider flows: create, resend, revoke, accept, expired/revoked/used token handling, tenant scoping, and response sanitization.
- API key and token lifecycle: create, display-once, list, revoke, authenticate, wrong-tenant/wrong-role rejection, and internal agent key boundaries.
- Report export security: export authorization, tenant-scoped content, unsupported format rejection, generated-file ownership, expiry, download, deletion, and stale-file prevention.
- Audit logging: export/download events, security lifecycle events, failed attempts, safe metadata, tenant visibility, immutability, retention behavior, pagination, and UI access.
- Abuse protection: rate limits for login, MFA, recovery codes, password reset requests, invite spam, API key auth failures, and audit-log reads.
- Browser/runtime hardening: session cookie expectations, CSRF/origin checks for cookie-auth state changes, security headers, sensitive-response cache behavior, and CSP-compatible local behavior.
- Response sanitization: auth/settings/invite/API key/audit/export/generated-file/generic error responses do not expose secrets, payloads, stack traces, or cross-tenant metadata.
- Supply-chain hygiene: production audit command, lockfile dry-run check, lightweight secret scan, and dependency triage documentation.
- Regression enforcement: documented `npm run test:security` command surface for API and browser security regressions.

## Required Validation Commands

Run these before merging security-sensitive changes:

```bash
DATABASE_URL="postgresql://<user>@127.0.0.1:55432/<db>" \
npm run test:security
```

For narrower runs:

```bash
DATABASE_URL="postgresql://<user>@127.0.0.1:55432/<db>" npm run test:security:api
DATABASE_URL="postgresql://<user>@127.0.0.1:55432/<db>" npm run test:security:browser
npm run build
npm run audit:prod
npm run check:lockfile
npm run check:secrets
```

See `docs/security-regression-suite.md` for the current suite composition and prerequisites.

## Phase-Close Checklist

- Security PRs merged through PR #46.
- Focused API security regressions pass.
- Focused browser security regressions pass.
- `npm run build` passes.
- No pending migrations.
- No deploys performed as part of this phase.
- No known unresolved high-risk auth, tenant-isolation, export, audit-log, token, or settings-admin gaps.
- Deferred items are documented below.

## Deferred Items

- CI enforcement: the repository currently has a deployment workflow only. Add a non-deploy pull-request workflow with disposable Postgres that runs `npm run test:security` and `npm run build`.
- Dependency advisories: `npm run audit:prod` currently reports known production advisories documented in `docs/dependency-supply-chain-hardening.md`. Remediation should be handled as focused dependency work, not broad upgrades.
- Browser coverage expansion: current browser security coverage focuses on settings/security and audit-log access. Additional UI flows can be added as narrow regressions when specific risk areas change.
- Rate-limit storage: current protection follows existing app patterns. Consider shared/distributed storage if multiple production instances are introduced.
- CSP tightening: current headers preserve Vite/dev/test compatibility. Production CSP can be narrowed further once all third-party asset and inline-script requirements are inventoried.

## Operational Notes

- Treat failed security regressions as release blockers unless the failure is proven environmental.
- Keep audit-log metadata safe: log actor, tenant/company, entity identifiers, action, outcome, and reason; do not log tokens, full API keys, recovery codes, reset/invite tokens, report payloads, or stack traces.
- Preserve tenant scoping as a default requirement for settings, reports, exports, generated files, audit logs, API keys, and identity-provider settings.
- Prefer focused security PRs with tests first and implementation fixes only where a regression exposes unsafe behavior.
