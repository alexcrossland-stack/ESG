# Dependency and Supply-Chain Hardening

Last reviewed: 2026-05-11

## Lightweight Checks

Run these before dependency/security-sensitive PRs:

```bash
npm run check:secrets
npm run check:lockfile
npm run audit:prod
npm run build
```

`npm run audit:prod` is a production-readiness gate. It exits non-zero when high severity advisories are present.

## Current Audit Snapshot

Command:

```bash
npm audit --audit-level=high --omit=dev --json
```

Result before this triage pass on 2026-05-10:

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 7 |
| Moderate | 6 |
| Low | 1 |
| Total | 14 |

Result after the targeted dependency updates and focused XLSX/Drizzle remediation PRs on 2026-05-11:

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 0 |
| Moderate | 0 |
| Low | 0 |
| Total vulnerable packages | 0 |

`npm run audit:prod` passes after these remediation branches are reconciled.

## Triage Result

Targeted updates applied:

- `express-rate-limit` from `^8.3.1` to `^8.5.1`, which updates the vulnerable `ip-address` dependency path.
- `marked` from `^18.0.0` to `^18.0.3`.
- `sanitize-html` from `^2.17.2` to `^2.17.3`.
- `postcss` from `^8.4.47` to `^8.5.14`.
- Moved `tailwindcss-animate` from production dependencies to dev dependencies because it is only used by Tailwind build configuration.
- Removed the production `xlsx` dependency and disabled server-side XLS/XLSX import parsing. CSV/text imports remain supported.
- Upgraded `drizzle-orm` from `^0.39.3` to `^0.45.2`.
- Refreshed affected lockfile-only transitive dependencies where npm could safely resolve patched compatible versions.

| Package / path | Direct or transitive | Runtime or dev-only | Production reachable | Fix status | Decision |
| --- | --- | --- | --- | --- | --- |
| `drizzle-orm` | Direct | Runtime | Yes. Core database access uses Drizzle throughout the app. Known raw SQL callsites are mostly static, allowlisted, or manually escaped. | Fixed by upgrading to `^0.45.2`; no migration or application code changes were required. | Resolved by the focused Drizzle remediation PR. |
| `xlsx` | Direct before remediation | Runtime before remediation | Previously yes. It parsed authenticated questionnaire and raw-data import uploads. Evidence uploads may still store XLS/XLSX files as opaque files, but those files are not parsed by the removed dependency. | No npm audit fix is available, so the dependency was removed and XLS/XLSX import formats are rejected before parsing. | Resolved by removing production parser support. CSV/text import paths remain supported. |
| `marked` | Direct | Runtime | Yes. Markdown rendering/sanitization paths can be reached by product/report/policy flows. | Fixed by updating to `^18.0.3`. | Resolved in this PR. |
| `sanitize-html` / `postcss` | Direct and transitive | Runtime and build tooling | Yes for HTML sanitization; build-only for Tailwind/Vite PostCSS usage. | Fixed by updating `sanitize-html` to `^2.17.3` and `postcss` to `^8.5.14`. | Resolved in this PR. |
| `express-rate-limit` / `ip-address` | Direct and transitive | Runtime | Yes. Rate-limit middleware is part of auth/security abuse protection. | Fixed by updating `express-rate-limit` to `^8.5.1`, which resolves `ip-address` to a patched range. | Resolved in this PR. |
| `brace-expansion`, `minimatch`, `picomatch`, `yaml` | Transitive | Build/dev tooling after this PR | Not production reachable after moving `tailwindcss-animate` to dev dependencies. These packages are Tailwind/Vite/build/test tooling paths. | Compatible lockfile updates applied where available. | Removed from production audit scope. |
| `lodash`, `path-to-regexp`, `qs` | Transitive | Runtime | Potentially reachable through charting/router/query parsing, but not reported by the current production audit output. | `qs` was resolved to a patched compatible version in the lockfile; no override was introduced for `lodash` or `path-to-regexp`. | Monitor with `npm run audit:prod`; do not introduce overrides unless the advisory reappears or a focused compatibility PR is warranted. |

## Triage Rules

- Do not run broad package upgrades in unrelated security PRs.
- Prefer one dependency-risk PR per risky direct package when tests need careful validation.
- For semver-major upgrades, include compatibility notes and focused regression coverage.
- For no-fix packages, document exposure, compensating controls, and replacement options.
- Never commit `.env` files, raw production credentials, private keys, API keys, recovery codes, reset tokens, or invite tokens.

## XLSX Parser Remediation Decision

The application previously used the unpatched `xlsx` npm package to parse uploaded spreadsheet content in:

- `POST /api/questionnaires/import`
- `POST /api/raw-data/import/parse`

The package has no npm audit fix for the current high-severity advisories. The production decision for this remediation pass is to remove server-side XLS/XLSX parsing rather than keep a vulnerable parser in the runtime path.

Current behaviour:

- Questionnaire import supports pasted text and CSV upload.
- Raw data import supports CSV upload.
- XLS/XLSX import formats are rejected with safe `400` responses before parsing.
- Existing evidence uploads may still store `.xls` or `.xlsx` files as opaque evidence attachments; those files are not parsed by the removed `xlsx` dependency.

Future XLSX support should use a maintained parser or isolated conversion service with explicit file size limits, MIME/extension validation, tenant authorization before parsing, safe error handling, and no formula execution/evaluation.

## Drizzle ORM Remediation

Reviewed: 2026-05-11

Advisory:

- `drizzle-orm <0.45.2`
- High severity SQL injection risk in improperly escaped SQL identifiers.

Decision:

- Upgrade the production dependency from `^0.39.3` to `^0.45.2`.
- Keep `drizzle-zod` and `drizzle-kit` unchanged because their current peer ranges remain compatible and this remediation does not require migration tooling changes.
- No schema migration is required.

Reachability:

- Production reachable. The server uses `drizzle-orm` in core storage, startup/index DDL, report/export paths, settings/security APIs, scheduler code, and audit/security alert flows.
- Existing dynamic identifier usage is mostly static or allowlisted (`ensureIndexes`, startup DDL, workflow table allowlists, assignment table map), but upgrading the ORM removes the vulnerable library version rather than relying on callsite-by-callsite containment.

Validation:

- `npm run audit:prod` no longer reports `drizzle-orm`.
- `npm run build`
- `npm run check:lockfile`
- Focused DB/auth/settings/report/security regressions before release.

## Added Repo-Local Checks

- `npm run check:secrets`: scans tracked files for common committed secret patterns.
- `npm run check:lockfile`: dry-runs `npm ci` without lifecycle scripts to verify lockfile/install consistency.
- `npm run audit:prod`: checks production dependencies for high-or-higher advisories.

These checks do not change dependencies and do not require a migration.
