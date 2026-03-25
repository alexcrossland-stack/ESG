# Production Operations Runbook

**Audience:** On-call engineers, DevOps, SRE  
**Last updated:** 2026-03-25

---

## 1. Severity Definitions

| Level | Definition | Response SLA |
|-------|-----------|--------------|
| **P1 – Critical** | Service down, data loss, security breach, or all users blocked. | 15 minutes to acknowledge, 1 hour to mitigate |
| **P2 – High** | Core workflow broken for a significant subset of users (e.g., report generation, data submission), or a single tenant's data is inaccessible. | 30 minutes to acknowledge, 4 hours to mitigate |
| **P3 – Medium** | Feature degraded but workaround exists; minor data discrepancy detected; non-critical third-party integration down. | Next business day |
| **P4 – Low** | Cosmetic or UX issue, informational alert. | Best effort |

---

## 2. Log Locations

### Application Logs (structured JSON, stdout)

All log lines are emitted to **stdout** of the Node.js process. In Replit deployments these are accessible via the deployment console. In self-hosted environments, pipe stdout to your log aggregator (Datadog, CloudWatch, etc.).

Key log sources:

| Source | Pattern to search |
|--------|-------------------|
| API error middleware | `"type":"api_error"` |
| Audit events | `"type":"audit"` |
| Telemetry events | `"type":"telemetry"` |
| Integrity check results | `"type":"integrity_check"` |
| Feature flag denials | `code: "FEATURE_DISABLED"` |
| Security health events | `"type":"health_event"` |

### Database Tables

| Table | Purpose |
|-------|---------|
| `audit_logs` | Full structured audit trail with actor, entity, IP, before/after |
| `telemetry_events` | Product telemetry events (onboarding, report generation, evidence uploads) |
| `health_events` | Security and system health events (login failures, MFA, anomalies) |

Query recent errors:
```sql
SELECT * FROM audit_logs WHERE action ILIKE '%error%' ORDER BY created_at DESC LIMIT 50;
```

Query a specific company's activity:
```sql
SELECT * FROM audit_logs WHERE company_id = '<UUID>' ORDER BY created_at DESC LIMIT 100;
```

Query telemetry for a user journey:
```sql
SELECT event_name, properties, occurred_at FROM telemetry_events
WHERE company_id = '<UUID>' ORDER BY occurred_at ASC;
```

### Admin API Endpoints (requires `super_admin` session)

```
GET /api/admin/audit-logs
  ?companyId=<uuid>
  &userId=<uuid>
  &entityType=<metric_value|evidence_file|company|user|report_run>
  &action=<action string>
  &dateFrom=<ISO 8601>
  &dateTo=<ISO 8601>
  &limit=<1–500, default 200>

GET  /api/admin/security-audit                 — system security checks snapshot
GET  /api/admin/health/events                  — recent security health events
GET  /api/admin/telemetry                      — recent telemetry events (filterable by eventName, companyId, userId)
POST /api/admin/integrity-check               — run data integrity checks (body: { companyId? })
```

---

## 3. Feature Flag Toggling

Feature flags are environment variables. They default to **enabled** (`true`) when unset.

| Flag | Env var | Controls |
|------|---------|---------|
| Portfolio module | `FEATURE_PORTFOLIO_ENABLED` | All `/api/portfolio/*` endpoints |
| Estimation module | `FEATURE_ESTIMATION_ENABLED` | All `/api/estimation*` endpoints |
| Report generation | `FEATURE_REPORT_GENERATION_ENABLED` | `/api/reports/generate`, `/api/report-runs/*/download` |

**To disable a module without redeployment (Replit):**
1. Go to the Replit project → Secrets.
2. Add or update the env var: `FEATURE_PORTFOLIO_ENABLED` = `false`.
3. Restart the application workflow.
4. All affected endpoints immediately return HTTP 503:
   ```json
   { "error": "...", "code": "FEATURE_DISABLED", "feature": "portfolio", "message": "..." }
   ```

**To re-enable:** set the env var to `true` (or remove it) and restart.

---

## 4. Dashboard / Portfolio Failure Checklist

### 4a. Dashboard shows stale or missing data

1. Check recent errors in logs: search for `api_error` with `route` containing `/dashboard`.
2. Run the integrity check manually via the admin endpoint:
   ```
   GET /api/admin/security-audit
   ```
3. Query `audit_logs` for recent `metric_value_submitted` or `metric_value_updated` actions on the affected company.
4. Run the integrity check SQL:
   ```sql
   SELECT mv.metric_id, mv.period, mv.value, d.value as dashboard_value
   FROM metric_values mv
   LEFT JOIN dashboard_metrics d ON d.metric_id = mv.metric_id AND d.period = mv.period
   WHERE mv.company_id = '<UUID>'
   ORDER BY mv.period DESC LIMIT 20;
   ```
5. If discrepancy confirmed → escalate to P2. Tag the incident with the company ID and affected period.

### 4b. Portfolio endpoint returning 503

1. Check whether `FEATURE_PORTFOLIO_ENABLED` is set to `false`. If so, this is intentional.
2. If flag is `true` but 503s still appear, look for `api_error` log lines with `"status":503`.
3. Check database connectivity: run `GET /api/admin/security-audit` and look for DB-related failures.

### 4c. Portfolio summary shows wrong company count

1. Run: `SELECT COUNT(*) FROM group_companies WHERE group_id = '<UUID>';`
2. Compare with `/api/portfolio/groups/<groupId>/summary` response.
3. If mismatch, check `audit_logs` for recent `group_company_added` or `group_company_removed` actions.

---

## 5. Report Generation Failure Checklist

1. Check `FEATURE_REPORT_GENERATION_ENABLED` is not `false`.
2. Search logs for `api_error` with route `/api/reports/generate`.
3. Check recent `report_runs` table entries:
   ```sql
   SELECT id, status, error, created_at FROM report_runs
   WHERE company_id = '<UUID>' ORDER BY created_at DESC LIMIT 5;
   ```
4. If status is `failed`, the `error` column contains the root cause.
5. Check `OPENAI_API_KEY` / AI integration secret is configured (required for AI-generated narrative sections).
6. Re-trigger generation after fixing the root cause.

---

## 6. Data Integrity Verification

The application runs three automated integrity checks daily via the scheduler and on-demand via the admin API:

| Check | What it verifies |
|-------|-----------------|
| `checkDashboardVsMetrics` | Dashboard cache matches raw `metric_values` for active metrics |
| `checkReportVsDashboard` | Latest report run references consistent dashboard snapshot |
| `checkPortfolioVsCompanies` | Portfolio group company count matches `group_companies` join table |

**Scheduled:** Runs automatically every 24 hours against all active companies (up to 50). Output is logged to stdout.

**On-demand via admin API:**
```
POST /api/admin/integrity-check
Body: {} — checks all active companies (up to 50)
Body: { "companyId": "<uuid>" } — checks a specific company

Response: { checked, totalDiscrepancies, results: [{ companyId, dashboardOk, reportOk, discrepancies }] }
```

Discrepancy log format:
```
[integrity:dashboard] Discrepancy — Metric 'Carbon Emissions' (abc-123): dashboard=42, db=45
[integrity] Daily check complete: 12 companies checked, 0 discrepancies
```

**If a discrepancy is found:**
1. Identify the affected company and metric.
2. Determine which value is correct by checking `audit_logs` for the relevant period.
3. If the dashboard value is stale, trigger a cache refresh by POSTing to `/api/dashboard/refresh` (or restarting the app as a last resort).
4. Document the incident and resolution in the `audit_logs` via an admin action entry.

---

## 7. Escalation Contacts

| Role | When to escalate |
|------|-----------------|
| On-call engineer | All P1/P2 incidents |
| Data protection officer | Any confirmed or suspected data breach |
| Stripe support | Billing webhook failures lasting > 1 hour |
| OpenAI support | AI integration outage lasting > 2 hours |

---

## 8. Routine Maintenance

| Task | Frequency | How |
|------|-----------|-----|
| Review `health_events` for anomalies | Daily | `GET /api/admin/health/events?limit=200` |
| Rotate `SESSION_SECRET` | Quarterly | Update secret + rolling restart |
| Review expired auth tokens | Weekly | See `GET /api/admin/security-audit` |
| Check telemetry for onboarding drop-off | Weekly | Query `telemetry_events` grouped by `event_name` |
| Audit `audit_logs` for unexpected bulk actions | Weekly | Filter by `action` containing `bulk` or `delete` |
