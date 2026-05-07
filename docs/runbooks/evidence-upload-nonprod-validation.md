# Evidence Upload Non-Production Validation

Use this runbook before marking PR #5 ready, merging, or deploying. It is intentionally written for a confirmed non-production environment only.

Do not use the production SSH host, production database, production upload volume, production user accounts, or production tenant data unless that environment has first been explicitly confirmed as non-production.

## Existing Non-Production Documentation

The repository has partial non-production references in:

- `docs/backup-restore.md`, which describes restore rehearsal against a separate Replit, local PostgreSQL, or staging database.
- `docs/regression-pack.md`, which documents DB-backed regression prerequisites.
- `docs/runbooks/hetzner-preflight.md`, which documents a final host preflight but is not a PR #5 staging setup.
- `docs/LAUNCH_UAT_CHECKLIST.md`, which records a previous UAT result and should be treated as historical.

There is not currently a complete staging or local setup guide specifically for PR #5 evidence upload validation. Use the steps below until a permanent staging environment exists.

## Required Environment

Required:

- `DATABASE_URL`: PostgreSQL connection string for a disposable or explicitly confirmed non-production database.
- `SESSION_SECRET`: any non-production secret value.
- `BASE_URL`: normally `http://127.0.0.1:5000`.
- `PORT`: normally `5000`.
- Writable upload storage at `uploads/evidence` relative to the repository root.
- Browser support for Playwright, including the `chromium` project.

The evidence upload root is currently fixed in code as:

```text
<repo root>/uploads/evidence
```

For PR #5, uploaded files are stored under:

```text
uploads/evidence/<companyId>/<evidenceId>/<safe-filename>
```

Run the app from the repository root so storage resolution is predictable.

## Stop Conditions

Stop immediately if any of these are true:

- `DATABASE_URL` points at an unknown database.
- The database name, host, or owner cannot be confirmed as non-production.
- The upload path is a production or shared persistent volume.
- The app is connected to production auth, production tenant data, or production users.
- A migration command would run before the database identity has been inspected.

## Prepare A Disposable Database

Preferred path: create a fresh database such as `esg_pr5_validation`, run the migration and tests, then drop the database afterwards.

If local PostgreSQL tools are available:

```bash
createdb esg_pr5_validation
export DATABASE_URL="postgres://localhost:5432/esg_pr5_validation"
```

If using a hosted staging database, create a fresh disposable database or schema there and provide only that connection string as `DATABASE_URL`.

## Configure Environment

From the repository root:

```bash
export DATABASE_URL="postgres://user:password@host:5432/esg_pr5_validation"
export SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
export BASE_URL="http://127.0.0.1:5000"
export PORT="5000"
```

Confirm the database identity before running any migration:

```bash
node --input-type=module -e "import pg from 'pg'; const { Client } = pg; const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); const r = await c.query('select current_database() as database, current_user as user_name, inet_server_addr() as host, inet_server_port() as port'); console.log(r.rows[0]); await c.end();"
```

Proceed only if the output is explicitly non-production.

## Verify Upload Storage

```bash
mkdir -p uploads/evidence/.validation-check
printf "evidence-storage-check" > uploads/evidence/.validation-check/check.txt
test -s uploads/evidence/.validation-check/check.txt
rm uploads/evidence/.validation-check/check.txt
rmdir uploads/evidence/.validation-check
```

To confirm storage is not ephemeral, run the upload tests, restart the app, then verify a downloaded evidence file still opens successfully from the Evidence page and the metric context area.

## Run Migration

Apply the PR #5 migration:

```bash
node --input-type=module -e "import { readFileSync } from 'node:fs'; import pg from 'pg'; const { Client } = pg; const sql = readFileSync('scripts/migrations/2026-05-07-add-evidence-metric-tags.sql', 'utf8'); const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); await c.query(sql); await c.end(); console.log('migration applied');"
```

Run it a second time to confirm idempotency:

```bash
node --input-type=module -e "import { readFileSync } from 'node:fs'; import pg from 'pg'; const { Client } = pg; const sql = readFileSync('scripts/migrations/2026-05-07-add-evidence-metric-tags.sql', 'utf8'); const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); await c.query(sql); await c.end(); console.log('migration reapplied safely');"
```

Verify schema state:

```bash
node --input-type=module -e "import pg from 'pg'; const { Client } = pg; const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); console.log('columns', (await c.query(\"select column_name, data_type from information_schema.columns where table_name = 'evidence_files' and column_name in ('metric_id', 'tags') order by column_name\")).rows); console.log('indexes', (await c.query(\"select indexname from pg_indexes where tablename = 'evidence_files' and indexname = 'idx_evidence_files_metric_id'\")).rows); await c.end();"
```

Verify backfill did not leave resolvable metric-value evidence without `metric_id`:

```bash
node --input-type=module -e "import pg from 'pg'; const { Client } = pg; const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); const unresolved = await c.query(\"select count(*)::int as count from evidence_files ef join metric_values mv on ef.linked_module = 'metric_value' and ef.linked_entity_id = mv.id where ef.metric_id is null\"); const broken = await c.query(\"select ef.id, ef.filename from evidence_files ef left join metrics m on m.id = ef.metric_id where ef.metric_id is not null and m.id is null limit 20\"); console.log({ unresolvedMetricValueEvidence: unresolved.rows[0].count, brokenMetricLinks: broken.rows }); await c.end();"
```

Expected:

- `evidence_files.metric_id` exists.
- `evidence_files.tags` exists.
- `idx_evidence_files_metric_id` exists.
- `unresolvedMetricValueEvidence` is `0`.
- `brokenMetricLinks` is an empty list, unless the disposable database was intentionally seeded with broken fixtures.

## Start App

In a terminal with the environment variables above:

```bash
npm run dev
```

Confirm health:

```bash
curl -fsS http://127.0.0.1:5000/health
```

## Run Targeted Evidence Tests

These commands intentionally target PR #5 behavior rather than the entire suite.

```bash
BASE_URL=http://127.0.0.1:5000 DATABASE_URL="$DATABASE_URL" npx tsx tests/api/evidence.test.ts
BASE_URL=http://127.0.0.1:5000 DATABASE_URL="$DATABASE_URL" npx tsx tests/api/metrics.test.ts
BASE_URL=http://127.0.0.1:5000 DATABASE_URL="$DATABASE_URL" npx tsx tests/api/permissions.test.ts
BASE_URL=http://127.0.0.1:5000 DATABASE_URL="$DATABASE_URL" npx playwright test tests/e2e/evidence-upload.spec.ts --project=api
BASE_URL=http://127.0.0.1:5000 DATABASE_URL="$DATABASE_URL" npx playwright test tests/e2e/evidence-audit.browser.spec.ts --project=chromium
```

Coverage expected from these tests:

- Central Evidence multipart upload.
- Required file and metric selection.
- Metric linking on evidence records.
- Evidence list persistence and download.
- Data Entry multipart evidence uploads still work.
- Evidence under metric row reload path.
- Tenant-scoped evidence list and download.
- Cross-tenant metric rejection.
- Invalid MIME rejection.
- Oversized file rejection.
- Viewer upload rejection.

## Manual Checks Still Required

Before PR #5 is marked ready, also verify these manually or add targeted automated coverage:

- Upload from the central Evidence page in the browser, selecting a specific metric and period.
- Confirm the uploaded row shows filename, linked metric, period, upload date, uploader, and open/download action.
- Open/download the file from the Evidence page.
- Open the relevant metric detail/context page and confirm the linked evidence appears there.
- Open/download the same file from the metric detail/context area.
- Restart the app and confirm the same uploaded file still downloads.
- Confirm a missing file returns an unavailable/not found response rather than a server error.
- Confirm legacy `/api/metric-evidence` paths remain tenant-isolated. The checked-in targeted tests primarily cover `/api/evidence`, `/api/data-entry`, `/api/evidence/entity`, and `/api/metrics/:id/evidence`; legacy route validation should be added or performed explicitly before readiness.

## Cleanup

Safest cleanup is to destroy the disposable environment:

```bash
# Only when this is the disposable validation database.
dropdb esg_pr5_validation
```

Then remove only validation upload files from the disposable run. If the repository copy was used only for this validation, remove the evidence upload contents:

```bash
find uploads/evidence -mindepth 1 -maxdepth 1 -type d -print
```

Review the printed company directories. Remove only directories that belong to the disposable validation tenants.

If the database was shared non-production rather than disposable, do not run broad cleanup SQL. Identify the exact test company IDs from `tests/e2e/.auth/seed-info.json` and clean only those records and matching upload directories after taking a non-production backup.

## Result Needed Before Readiness

Record:

- Environment name and database identity output.
- Commit SHA under test.
- Migration output and idempotency result.
- Upload storage path and restart persistence result.
- Commands run.
- Test pass/fail output.
- Manual check results.
- Any cleanup performed.

PR #5 should remain draft/blocked until all automated and manual checks above pass in a confirmed non-production environment.
