# Runbook: Account Compromise

## How to Detect
- Security overview panel shows repeated failed logins for the same account
- Alert fired for `repeated_login_failures_user` rule
- User reports unexpected password changes or activity
- Audit log shows `login_success` from an unusual IP immediately after `login_failed` events

## Immediate Containment (do first)
1. Disable the affected user account via `POST /api/admin/security/containment/disable-user/:userId`
2. Revoke all active sessions: `POST /api/admin/security/containment/revoke-sessions/:userId`
3. If API keys are associated, revoke them via `POST /api/admin/agent-api-keys/:id/revoke`

## Logs to Inspect
- `audit_logs` WHERE `user_id = '<affected_user_id>'` ORDER BY `created_at DESC` — look for login sequence, IP changes
- `security_alerts` for fired alerts on this user
- `audit_logs` WHERE `action = 'login_failed'` AND recent timestamps

## Remediation Steps
1. Confirm the affected account and collect IP addresses from audit logs
2. Check whether any data was exported, modified, or deleted by the compromised account
3. Notify the legitimate account holder via out-of-band channel
4. Reset password using admin controls or password reset flow
5. If MFA was not enabled, enforce it before re-enabling the account
6. Re-enable the user account once credentials are secured
7. Document the incident with timeline and affected actions
