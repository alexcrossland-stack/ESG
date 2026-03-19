# Runbook: Accidental Deletion

## How to Detect
- Company admin reports data (metrics, policies, evidence, reports) is missing
- Audit log shows `delete` actions that the user did not intend
- A company deletion request was triggered by mistake
- Data export was followed by deletion of the source data

## Immediate Containment (do first)
1. If a company deletion request is within the 7-day pending window, cancel it:
   - Contact Replit support to cancel before scheduled execution
   - Check `data_deletion_requests` for status and `scheduled_at`
2. Prevent further accidental deletion by suspending any automated processes if applicable
3. Identify what was deleted from the audit log

## Logs to Inspect
- `audit_logs` WHERE `action LIKE '%delete%' OR action LIKE '%Delete%'` AND recent timestamps
- `data_deletion_requests` for company-level deletion scope
- `evidence_files` WHERE `evidence_status = 'deleted'` — check for recoverable evidence
- `audit_logs` WHERE `entity_type` matches the deleted resource type

## Remediation Steps
1. Identify exact records deleted and timestamps
2. Check whether any deleted data can be recovered from Replit database snapshots (contact support)
3. If evidence files were deleted, check whether originals exist with the uploader
4. For soft-deleted records (status = 'deleted'), manual restoration may be possible via direct DB update
5. For company-level hard deletions past the 7-day window: data may be unrecoverable — document scope
6. Advise the affected company to re-enter any irrecoverably lost data
7. Review user permissions to ensure deletion actions require appropriate privilege levels
