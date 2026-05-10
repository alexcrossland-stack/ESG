# Dependency and Supply-Chain Hardening

Last reviewed: 2026-05-10

## Lightweight Checks

Run these before dependency/security-sensitive PRs:

```bash
npm run check:secrets
npm run check:lockfile
npm run audit:prod
npm run build
```

`npm run audit:prod` is intentionally advisory until the current dependency findings are triaged. It exits non-zero when high severity advisories are present.

## Current Audit Snapshot

Command:

```bash
npm audit --audit-level=high --omit=dev --json
```

Result on 2026-05-10:

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 7 |
| Moderate | 6 |
| Low | 1 |
| Total | 14 |

Notable direct dependencies:

| Package | Severity | Notes |
| --- | --- | --- |
| `drizzle-orm` | High | Fix requires semver-major upgrade to `0.45.2`; defer to a dedicated ORM compatibility PR. |
| `marked` | High | Fix available; should be assessed with report/policy rendering tests. |
| `xlsx` | High | No npm audit fix available; keep spreadsheet parsing behind trusted/admin flows and evaluate replacement or vendor guidance. |
| `express-rate-limit` | Moderate | Fix available via dependency update; validate rate-limit regression suite after upgrade. |
| `postcss` | Moderate | Fix available; validate build pipeline after upgrade. |
| `sanitize-html` | Moderate | Fix available; validate policy/report sanitization after upgrade. |

## Triage Rules

- Do not run broad package upgrades in unrelated security PRs.
- Prefer one dependency-risk PR per risky direct package when tests need careful validation.
- For semver-major upgrades, include compatibility notes and focused regression coverage.
- For no-fix packages, document exposure, compensating controls, and replacement options.
- Never commit `.env` files, raw production credentials, private keys, API keys, recovery codes, reset tokens, or invite tokens.

## Added Repo-Local Checks

- `npm run check:secrets`: scans tracked files for common committed secret patterns.
- `npm run check:lockfile`: dry-runs `npm ci` without lifecycle scripts to verify lockfile/install consistency.
- `npm run audit:prod`: checks production dependencies for high-or-higher advisories.

These checks do not change dependencies and do not require a migration.
