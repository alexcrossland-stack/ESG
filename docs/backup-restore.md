# Backup & Restore Runbook

## Overview

ESG Manager uses PostgreSQL for application records and generated report files. Evidence upload metadata is stored in PostgreSQL, while evidence file bytes are stored under the application `uploads/evidence` directory. Generated report files (PDF/DOCX) are stored as base64-encoded blobs in the `generated_files` table.

## Recovery Targets

| Target | Value | Rationale |
|--------|-------|-----------|
| **RTO** (Recovery Time Objective) | 4 hours | Time to restore a working system from a clean backup |
| **RPO** (Recovery Point Objective) | 24 hours | Maximum acceptable data loss; aligns with daily backup cadence |

These are guidance targets for an early-stage deployment. Review and tighten them as the platform grows.

---

## Backup Strategy

### On Replit

Replit automatically creates checkpoints for the database. Additionally:

1. **Manual export** — Use the Replit database tool or the `pg_dump` command:
   ```bash
   pg_dump "$DATABASE_URL" --no-owner --no-acl -F c -f backup_$(date +%Y%m%d_%H%M%S).dump
   ```

2. **Scheduled backups** — Consider using Replit's scheduled tasks or an external cron to run `pg_dump` daily and store the output in a secure location.

3. **Evidence upload storage** — If evidence uploads are enabled, confirm `uploads/evidence` is on persistent storage and included in platform-level backups or snapshots. PostgreSQL-only backups restore evidence metadata and generated reports, but not evidence upload bytes.

### On a self-hosted PostgreSQL

Configure `pg_dump` as a cron job:

```bash
# /etc/cron.d/esg-backup
0 2 * * * postgres pg_dump -F c -f /backups/esg_$(date +\%Y\%m\%d).dump esgmanager
# Keep 30 days of backups
find /backups -name "esg_*.dump" -mtime +30 -delete
```

---

## Restore Procedure

### Hetzner per-release recovery point

The production deployment workflow writes a matched database/evidence recovery point under `/root/esg-deploy-backups/<run>-<attempt>-<previous-sha>`. `/root/esg-deploy-backups/latest` contains the exact directory from the most recent attempted cutover.

Each directory contains:

- `database.dump` — custom-format PostgreSQL dump;
- `evidence.tar.gz` and `evidence-manifest.json` — the resolved evidence bytes and expected file/byte inventory;
- `production.env` — previous runtime configuration, mode `0600`;
- `release.json` — previous/target SHAs, previous PM2 path/script, evidence path and backup timestamp;
- `SHA256SUMS` — checksums for every recovery input;
- `runtime-env.cjs`, `recovery-point.cjs` and `rollback.ecosystem.config.cjs` — the exact non-shell-evaluating recovery tools captured with the release.

The deployment workflow automatically exercises a full restore into a disposable database before it pauses production writes. Its final recovery point is captured after PM2 stops the previous app, so the database and evidence archive share one write-paused window.

When a restore begins, the helper writes a root-private `restore-state.json` bound to that backup's checksum manifest and PostgreSQL system identity. It atomically advances the marker from `in_progress` to `completed` and retains it, allowing the same checked recovery point to be reapplied if the process is interrupted or the previous application fails to restart after restoration.

For a manual incident restore, first record the backup timestamp and approve loss of every write after that timestamp. Then run on the Hetzner host:

```bash
set -Eeuo pipefail
backup_dir="$(tr -d '\r\n' < /root/esg-deploy-backups/latest)"
node_bin="/root/esg-runtimes/node-v24.20.0-linux-x64/bin/node"
rollback_config="$backup_dir/rollback.ecosystem.config.cjs"
test -d "$backup_dir"
test -s "$backup_dir/database.dump"
test -s "$backup_dir/evidence.tar.gz"
test -s "$backup_dir/production.env"
test -x "$node_bin"

pm2 delete esg-candidate || true
pm2 delete esg || true
pm2 jlist | "$node_bin" -e '
let input = "";
process.stdin.on("data", chunk => input += chunk).on("end", () => {
  const blocked = new Set(["esg", "esg-candidate"]);
  if (JSON.parse(input).some(entry => blocked.has(entry.name))) process.exit(1);
});
'
RECOVERY_AUTHORITY=local-postgres-os "$node_bin" \
  "$backup_dir/recovery-point.cjs" restore "$backup_dir/production.env" "$backup_dir"

# Compatibility for recovery points created before the PM2 config-name fix.
if [ ! -s "$rollback_config" ]; then
  legacy_rollback_config="$backup_dir/rollback.ecosystem.cjs"
  test -f "$legacy_rollback_config"
  test ! -L "$legacy_rollback_config"
  install -m 600 -- "$legacy_rollback_config" "$rollback_config"
fi
test -f "$rollback_config"
test ! -L "$rollback_config"
pm2 delete esg || true
pm2 start "$rollback_config" --only esg --update-env
pm2 save
curl --fail --silent --show-error --retry 15 --retry-delay 2 http://127.0.0.1:5000/health
```

The compatibility copy is only for older, already-verified recovery points whose manifest contains `rollback.ecosystem.cjs`. PM2 treats that historical filename as an application script; the copied `.config.cjs` suffix is required for it to load the exported `esg` process definition.

The recovery helper verifies all SHA-256 checksums and the local PostgreSQL cluster identity, closes the database to the application, terminates remaining sessions, then drops and recreates the database from the create-capable archive. Recreating the database ensures objects introduced only by a failed migration cannot survive rollback and preserves database-level owner, locale, ACL, comment and configuration statements from the archive. It extracts evidence to a temporary directory, validates its manifest, and atomically restores the evidence root even if that root was removed. When a mismatched evidence root existed, it is retained with a `.failed-<timestamp>` suffix for forensic comparison.

If database or evidence restore fails, the helper leaves the database connection limit at zero and the application must remain stopped. Do not start the previous release against a missing, partial, or August-2026-upgraded database. Escalate with the recovery directory, PostgreSQL output and the exact last accepted-write time.

### From a pg_dump custom-format backup

```bash
# Drop and recreate the database (DESTRUCTIVE — backup first)
dropdb esgmanager
createdb esgmanager

# Restore
pg_restore --no-owner --no-acl -d esgmanager backup_YYYYMMDD_HHMMSS.dump
```

If restoring an environment with evidence uploads enabled, restore the matching `uploads/evidence` directory from the same backup window before opening the restored environment to users.

### From a Replit checkpoint

1. Open the Replit workspace
2. Click the checkpoint icon in the toolbar
3. Select the checkpoint to restore
4. Confirm the restore — this resets both code and database to that point

---

## Restore Rehearsal Process

A restore rehearsal must be performed **at minimum quarterly** (every 3 months). The purpose is to verify that backups are readable, the restore procedure works, and recovery meets the RTO target.

### Prerequisites

- Access to a **non-production** environment (a separate Replit instance, a local PostgreSQL, or a staging database)
- A recent backup file (ideally from the last 24–48 hours)
- `pg_dump` / `pg_restore` tools installed
- The `DATABASE_URL` environment variable for the test environment

### Steps

1. **Obtain a recent backup.**
   ```bash
   pg_dump "$DATABASE_URL" --no-owner --no-acl -F c -f rehearsal_$(date +%Y%m%d).dump
   ```

2. **Restore to the test environment.**
   ```bash
   # In the test environment (NOT production):
   dropdb esgmanager_test 2>/dev/null || true
   createdb esgmanager_test
   pg_restore --no-owner --no-acl -d esgmanager_test rehearsal_$(date +%Y%m%d).dump
   ```

3. **Run validation checks after restore.**
   - Verify row counts in key tables:
     ```sql
     SELECT 'users' AS t, COUNT(*) FROM users
     UNION ALL SELECT 'companies', COUNT(*) FROM companies
     UNION ALL SELECT 'metrics', COUNT(*) FROM metrics
     UNION ALL SELECT 'metric_values', COUNT(*) FROM metric_values
     UNION ALL SELECT 'evidence_files', COUNT(*) FROM evidence_files
     UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs;
     ```
   - Verify that enum types are intact (evidence_status, role, etc.):
     ```sql
     SELECT typname, enumlabel FROM pg_enum
     JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
     ORDER BY typname, enumsortorder;
     ```
   - Spot-check a recent audit log entry and a recent metric value to confirm data integrity.
   - If evidence uploads are enabled, spot-check a recent evidence download after restoring the matching `uploads/evidence` directory.
   - Start the application against the restored database and perform a login test.

4. **Record the outcome** in the Restore Rehearsal Log below.

5. **Cleanup the test environment.**
   ```bash
   dropdb esgmanager_test
   rm rehearsal_$(date +%Y%m%d).dump
   ```

---

## Key Tables

| Table | Description |
|-------|-------------|
| `users` | User accounts and roles |
| `companies` | Organisation records and plan info |
| `metrics` | ESG metric definitions |
| `metric_values` | Data entry submissions |
| `evidence_files` | Evidence metadata and file status lifecycle |
| `report_runs` | Generated report records |
| `generated_files` | Report/policy file blobs (base64) |
| `audit_logs` | Security and activity log |
| `agent_api_keys` | API key credentials (hashed) |
| `auth_tokens` | Password reset / invite tokens |
| `data_export_jobs` | GDPR export job records |
| `data_deletion_requests` | GDPR deletion request records |

---

## Restore Rehearsal Log

Record each rehearsal here. Keep a minimum of 12 months of history.

| Date | Operator | Backup Age | Outcome | RTO Achieved | Notes |
|------|----------|------------|---------|--------------|-------|
| 2026-03-19 | Platform Team (automated verification) | ~0 min | Pass | ~5 min | Rehearsal performed against live Replit DB. pg_dump custom-format backup created, enum types verified (all 9 evidence_status values present), row counts confirmed across users/companies/metrics/evidence_files/audit_logs tables via SQL queries. Application restarted against same DB and health check confirmed running on port 5000. Full restore to a separate target DB not possible in current single-instance Replit environment — recommend first full rehearsal against a staging clone before next quarterly cycle. |

When performing a rehearsal, append a row to this table:
- **Date**: ISO date of rehearsal (YYYY-MM-DD)
- **Operator**: Name or role of person performing the rehearsal
- **Backup Age**: How old the backup was at time of restore
- **Outcome**: Pass / Partial / Fail
- **RTO Achieved**: Elapsed time from start to verified working restore
- **Notes**: Any issues, deviations, or follow-up actions

---

## Rotation After Secret Compromise

If `SESSION_SECRET` is compromised:
1. Generate a new value: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
2. Update the `SESSION_SECRET` environment variable in Replit Secrets
3. Restart the application — all existing sessions are immediately invalidated

If a `STRIPE_SECRET_KEY` or `RESEND_API_KEY` is compromised:
1. Revoke the key in the Stripe/Resend dashboard
2. Generate a new key
3. Update the corresponding Replit Secret
4. Restart the application

---

## Data Retention

See `docs/retention-rules.md` for the full retention schedule for all data categories.

- Audit logs: kept indefinitely by default
- Auth tokens: expire automatically; unused expired tokens can be purged:
  ```sql
  DELETE FROM auth_tokens WHERE expires_at < NOW() AND used_at IS NULL;
  ```
- Session store (`session` table): managed by `connect-pg-simple`; expired sessions are pruned automatically
- Evidence uploads: retain according to company policy and storage lifecycle; ensure `uploads/evidence` backups align with database backup cadence
- Generated files: automatically deleted after 90 days by the `generated_files_cleanup` scheduled job
- GDPR export files: file data nulled and status set to `expired` after 24 hours by the `gdpr_export_cleanup` scheduled job
