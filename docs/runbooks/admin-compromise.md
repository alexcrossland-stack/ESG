# Runbook: Admin Compromise

## How to Detect
- Alert fired for `admin_role_change` or `super_admin_critical_action`
- Audit log shows admin-level actions from unusual IP or at unusual time
- Security overview panel shows unexpected role changes or privileged operations
- Another admin reports suspicious behaviour from a colleague's account

## Immediate Containment (do first)
1. Disable the compromised admin account: `POST /api/admin/security/containment/disable-user/:userId`
2. Revoke all sessions: `POST /api/admin/security/containment/revoke-sessions/:userId`
3. Revoke any API keys the compromised admin had access to
4. If a super-admin is affected, ensure at least one other super-admin can take over

## Logs to Inspect
- `super_admin_actions` table for recent privileged operations
- `audit_logs` WHERE `user_id = '<admin_user_id>'` AND recent timestamps
- `audit_logs` WHERE `action IN ('User role changed', 'admin_suspend_company', 'admin_reactivate_company')`
- `security_alerts` for triggered rules

## Remediation Steps
1. Identify all actions taken during the compromise window
2. Reverse any unauthorised role changes or company modifications
3. If data was accessed or exported, document scope and notify affected companies if required
4. Reset credentials via secure out-of-band channel before restoring access
5. Enforce MFA for all admin and super-admin accounts
6. Review whether the compromise originated from an insider or credential theft
7. Update admin rotation and access review schedule
