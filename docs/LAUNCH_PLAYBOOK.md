# Launch Playbook — Operator Runbook
**Date:** 2026-03-30  
**Audience:** On-call operators and support engineers on launch day  
**Purpose:** Short, actionable runbook for handling the most common support situations during go-live

---

## P0 Definition

> A P0 is anything that blocks or breaks a customer from completing: signup, login, company creation, onboarding, invite acceptance, evidence upload, report generation, portfolio access, or company switching.

**P0 response:** Acknowledge within 15 minutes. Target mitigation within 1 hour. Escalate immediately if data loss or security breach is suspected.

---

## 1. Checking Provisioning Status

**Q: Did a new company provision correctly?**

1. Go to the admin panel: `GET /api/admin/company/:companyId/diagnostics` (requires `super_admin` session).
2. Check `lifecycleState` — valid states: `created`, `onboarding_started`, `onboarding_completed`, `active`, `archived`.
3. Check `onboardingComplete` and `onboardingCompletedAt`.
4. Review `provisioningEvents` array — should contain `company_created` and optionally `company_linked_to_group`.
5. Check `counts.users` ≥ 1 and the admin user is present in the `users` array.

**If provisioning failed:**
- Search audit logs for `action = 'provisioning_failure'`:
  ```
  GET /api/admin/audit-logs?action=provisioning_failure&limit=20
  ```
- Check `platform_health_events` for `event_type = 'report_failure'` or DB errors.
- If the company row was created but defaults not seeded, the `counts.metrics` will be 0.

---

## 2. Checking Onboarding State

**Q: A customer says they completed onboarding but their dashboard is empty.**

1. Fetch diagnostics: `GET /api/admin/company/:companyId/diagnostics`.
2. Check `onboardingComplete` — if `false`, onboarding was not finished.
3. Check `lifecycleState` — should be `onboarding_completed` or `active` if finished.
4. Check `activityTimeline` for `onboarding_completed` event.
5. Check `dataReadiness` — `hasMetrics`, `hasMetricData`, `hasEvidence`, `hasReport` flags show what's present.
6. Check telemetry: `GET /api/admin/telemetry?eventName=onboarding_completed&companyId=<id>`.

**Quick fix if onboarding state is stuck:**
- If the customer is genuinely stuck mid-wizard, they can refresh and resume — progress is saved per step.
- If `onboardingComplete = false` but the customer says they finished, the `POST /api/onboarding/complete` call may have failed. Check `audit_logs` for errors.

---

## 3. Diagnosing Role / Permission Issues

**Q: A user says they cannot access a page or feature.**

1. Look up the user in `GET /api/admin/users?search=<email>`.
2. Check their `role` field — valid roles: `admin`, `editor`, `contributor`, `approver`, `viewer`, `super_admin`.
3. Check which company they are assigned to (`companyId`).
4. If they are a portfolio user, check `userGroupRoles` via audit log history for `user_role_changed` actions.
5. Permission matrix reference (see `shared/schema.ts` `hasPermission()`):
   - `admin` — full access including report generation and metric targets
   - `editor` — all data but no admin actions
   - `contributor` — data entry, no targets, no report generation
   - `approver` — review/approve metrics
   - `viewer` — read-only, no writes

**To update a user's role (admin action):**
- Use the admin panel or the `PUT /api/users/:id/role` endpoint (requires `super_admin`).
- An audit log `user_role_changed` will be written automatically.

---

## 4. Diagnosing Invite / Email Issues

**Q: A user says they did not receive their invite email.**

1. Confirm `RESEND_API_KEY` is set and valid.
2. Check the invite token in the `auth_tokens` table:
   ```sql
   SELECT token_hash, type, email, expires_at, created_at
   FROM auth_tokens WHERE email = '<email>' AND type = 'invitation'
   ORDER BY created_at DESC LIMIT 5;
   ```
3. Check `audit_logs` for `action = 'user_invited'` and the company ID.
4. If the invite token exists but email was not received:
   - Check Resend dashboard for delivery status.
   - Re-send invite from the team management page (creates a new token).
5. Common cause: `APP_BASE_URL` pointing to wrong domain means accept link is broken even if email delivered.

**Q: Invite link gives an error.**

1. Check `APP_BASE_URL` — it must match the production domain exactly.
2. Check invite token expiry — invite tokens typically expire after 7 days.
3. If expired, delete the old invite and re-invite the user.

---

## 5. Diagnosing Report Generation Failures

**Q: A user cannot generate or download a report.**

1. Check `FEATURE_REPORT_GENERATION_ENABLED` is not `false`.
2. Check `report_runs` table for the failed run:
   ```sql
   SELECT id, status, error, created_at FROM report_runs
   WHERE company_id = '<UUID>' ORDER BY created_at DESC LIMIT 5;
   ```
3. If `status = 'failed'`, the `error` column contains the root cause.
4. Check `platform_health_events` for `event_type = 'report_failure'`:
   ```
   GET /api/admin/health/events?limit=50
   ```
5. Check `audit_logs` for `action = 'report_generation_failure'`.
6. If AI narrative is failing, confirm `AI_INTEGRATIONS_OPENAI_API_KEY` is set.
7. Re-trigger generation after fixing the root cause.

---

## 6. Disabling a Company

**Q: A company account needs to be immediately disabled.**

1. Suspend via admin API (requires `super_admin` session):
   ```
   POST /api/admin/company/suspend
   Body: { "companyId": "<uuid>" }
   ```
2. All authenticated requests for users of this company will immediately return 403 with `"Your company account has been suspended. Please contact support."`.
3. To reactivate:
   ```
   POST /api/admin/company/reactivate
   Body: { "companyId": "<uuid>" }
   ```
4. Both actions are logged to `super_admin_actions` table.

**Feature flag disable (affects all companies):**

To disable a module without suspending specific companies, set the env var and restart:
- `FEATURE_PORTFOLIO_ENABLED=false` — disables all portfolio endpoints (returns 503).
- `FEATURE_REPORT_GENERATION_ENABLED=false` — disables report generation (returns 503).

---

## 7. What to Do If a Customer Gets Stuck

| Scenario | First Steps | Escalate If |
|----------|-------------|-------------|
| Cannot sign up | Check for 409 (email exists), check provisioning failure audit log | Provisioning failure persists after retry |
| Cannot log in | Check account exists, check MFA status, check session via `/api/auth/me` | Account confirmed but still blocked |
| Onboarding stuck | Check `onboardingComplete`, check step progress via `/api/onboarding/status` | `onboarding_completed` audit log missing after claimed completion |
| Blank dashboard after onboarding | Check `dataReadiness` flags in diagnostics | All flags false and metrics seeded (metrics count > 0) |
| Cannot generate report | Check `FEATURE_REPORT_GENERATION_ENABLED`, check `report_runs.status`, check AI key | `status = 'failed'` with non-AI error |
| Invite not received | Verify `RESEND_API_KEY`, check invite record, re-invite | Resend dashboard shows delivery confirmed but user still not receiving |
| Cannot access portfolio | Check group membership in `userGroupRoles`, check `portfolioGroups` in `/api/auth/me` | Group exists but user has no `userGroupRoles` record |

---

## 8. Key Admin API Endpoints

All endpoints require a `super_admin` session.

```
GET  /api/admin/companies?search=<name>&page=1&pageSize=50
GET  /api/admin/company/:companyId
GET  /api/admin/company/:companyId/diagnostics
GET  /api/admin/audit-logs?companyId=&userId=&action=&limit=200
GET  /api/admin/telemetry?eventName=&companyId=&userId=
GET  /api/admin/health/events?limit=100
GET  /api/admin/security-audit
POST /api/admin/integrity-check    body: { "companyId": "<uuid>" }
POST /api/admin/company/suspend    body: { "companyId": "<uuid>" }
POST /api/admin/company/reactivate body: { "companyId": "<uuid>" }
```

---

## 9. Escalation Contacts

| Situation | Action |
|-----------|--------|
| All P0 incidents | Page on-call engineer immediately |
| Data loss or suspected breach | Contact data protection officer and suspend affected company |
| OpenAI API outage (report narrative failing) | Report generation still works without AI narrative; notify users of reduced report quality |
| Email delivery outage (Resend) | Notify affected users via direct channel; invite links can be manually shared |
| Database connectivity loss | Check `GET /api/admin/security-audit` — DB failure appears here; escalate to platform |
