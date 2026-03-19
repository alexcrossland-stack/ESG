# Runbook: Cross-Tenant Access Concern

## How to Detect
- User reports seeing data that belongs to another company
- API response includes data for a `company_id` different from the authenticated user's
- Audit log shows an agent API key or user accessing resources for multiple company IDs
- Error log contains unexpected `company_id` values in data queries

## Immediate Containment (do first)
1. Identify the user or API key involved
2. Revoke the API key or user session immediately if confirmed cross-tenant access occurred
3. Disable the user account if compromise is suspected: `POST /api/admin/security/containment/disable-user/:userId`

## Logs to Inspect
- `audit_logs` WHERE `user_id = '<user_id>'` — look for actions referencing foreign `company_id` values
- `agent_runs` and `agent_actions` for the affected API key — were cross-tenant resources accessed?
- Server error logs for `company_id` mismatch errors or authorisation bypass patterns
- `data_export_jobs` — check whether any cross-tenant data was exported

## Remediation Steps
1. Confirm the scope: which companies were affected, what data was accessed
2. Review the authorisation logic for the affected endpoint to identify the isolation failure
3. Patch the bug — all queries must filter by the authenticated user's `company_id`
4. Notify affected companies if their data was accessed by another tenant
5. Determine whether any data was retained or exported by the party who gained access
6. Consider a comprehensive access control audit across all data-returning endpoints
7. Add integration tests verifying tenant isolation for all sensitive routes
