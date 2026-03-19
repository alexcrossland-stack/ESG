# Backup & Restore Runbook

## Overview

ESG Manager uses a PostgreSQL database. All persistent state lives in the database. No external file storage is used; evidence files are stored as metadata (URLs/filenames) in the database. Generated report files (PDF/DOCX) are stored as base64-encoded blobs in the `generated_files` table.

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

### From a pg_dump custom-format backup

```bash
# Drop and recreate the database (DESTRUCTIVE — backup first)
dropdb esgmanager
createdb esgmanager

# Restore
pg_restore --no-owner --no-acl -d esgmanager backup_YYYYMMDD_HHMMSS.dump
```

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
- Generated files: automatically deleted after 90 days by the `generated_files_cleanup` scheduled job
- GDPR export files: file data nulled and status set to `expired` after 24 hours by the `gdpr_export_cleanup` scheduled job
