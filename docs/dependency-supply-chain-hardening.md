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
| `drizzle-orm` | High | Remediated in dedicated ORM compatibility PR by upgrading to `^0.45.2`; no application code changes required after validation. |
| `marked` | High | Fix available; should be assessed with report/policy rendering tests. |
| `xlsx` | High | Remediated in the XLSX parser remediation PR by removing the production dependency and disabling server-side XLS/XLSX import parsing. CSV/text imports remain supported. |
| `express-rate-limit` | Moderate | Fix available via dependency update; validate rate-limit regression suite after upgrade. |
| `postcss` | Moderate | Fix available; validate build pipeline after upgrade. |
| `sanitize-html` | Moderate | Fix available; validate policy/report sanitization after upgrade. |

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

- `npm run audit:prod` no longer reports `drizzle-orm`; it still exits non-zero for unrelated advisories tracked separately.
- `npm run build`
- `npm run check:lockfile`
- Focused DB/auth/settings/report/security regressions before release.

## Added Repo-Local Checks

- `npm run check:secrets`: scans tracked files for common committed secret patterns.
- `npm run check:lockfile`: dry-runs `npm ci` without lifecycle scripts to verify lockfile/install consistency.
- `npm run audit:prod`: checks production dependencies for high-or-higher advisories.

These checks do not change dependencies and do not require a migration.
