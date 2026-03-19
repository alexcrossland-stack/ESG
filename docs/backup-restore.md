# Backup & Restore Runbook

## Overview

ESG Manager uses a PostgreSQL database. All persistent state lives in the database. No external file storage is used; evidence files are stored as metadata (URLs/filenames) in the database.

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

## Key Tables

| Table | Description |
|-------|-------------|
| `users` | User accounts and roles |
| `companies` | Organisation records and plan info |
| `metrics` | ESG metric definitions |
| `metric_values` | Data entry submissions |
| `evidence_files` | Evidence metadata |
| `report_runs` | Generated report records |
| `audit_logs` | Security and activity log |
| `agent_api_keys` | API key credentials (hashed) |
| `auth_tokens` | Password reset / invite tokens |

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

## Data Retention

- Audit logs: kept indefinitely by default
- Auth tokens: expire automatically; unused expired tokens can be purged:
  ```sql
  DELETE FROM auth_tokens WHERE expires_at < NOW() AND used_at IS NULL;
  ```
- Session store (`session` table): managed by `connect-pg-simple`; expired sessions are pruned automatically
