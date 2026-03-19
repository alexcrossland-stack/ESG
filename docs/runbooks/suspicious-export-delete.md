# Runbook: Suspicious Export or Deletion Activity

## How to Detect
- Alert fired for `unusual_export_volume` or `unusual_delete_volume`
- Security overview panel shows spike in `data_export_completed` or `data_deletion_requested` events
- User or company reports they did not authorise an export or deletion
- Audit log shows exports/deletions from unusual IPs or at unusual hours

## Immediate Containment (do first)
1. If an active export job is pending, cancel it in the database:
   `UPDATE data_export_jobs SET status = 'cancelled' WHERE id = '<job_id>'`
2. If a deletion request is pending (within 7-day window), contact support to cancel before it executes
3. Suspend the user account responsible if access is unauthorised: `POST /api/admin/security/containment/disable-user/:userId`
4. Revoke sessions: `POST /api/admin/security/containment/revoke-sessions/:userId`

## Logs to Inspect
- `data_export_jobs` — recent jobs, who requested them, which company data
- `data_deletion_requests` — any pending or recent deletion requests
- `audit_logs` WHERE `action IN ('data_export_completed', 'company_deletion_requested')`
- `audit_logs` for the responsible `user_id` — broader activity context

## Remediation Steps
1. Identify what data was exported or deleted and who initiated each action
2. If data was exported to a download token, check whether the token was used (`download_token_used`)
3. For deletions, determine whether data can be restored from backups (contact Replit support)
4. If the action was unauthorised, treat as account compromise and follow that runbook
5. Notify affected company admins of any data access
6. Review export/deletion permissions and consider requiring MFA for such operations
