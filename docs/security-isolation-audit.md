# Security Isolation Audit

This document audits every route category for tenant isolation enforcement and RBAC correctness.

**Last updated:** 2026-03-19  
**Auditor:** Security Foundation task #12

---

## Enforcement Mechanisms

| Mechanism | Description |
|-----------|-------------|
| `requireAuth` | Checks `req.session.userId` or Bearer token; returns 401 if absent |
| `requirePermission(module)` | Checks `user.role` against permission matrix; returns 403 if insufficient |
| `requireSuperAdmin` | Verifies `user.role === "super_admin"`; returns 403 otherwise |
| `validateSiteOwnership(siteId, companyId)` | Checks site belongs to company; write mode rejects archived sites |
| Storage queries scoped by `companyId` | All reads/writes in `DatabaseStorage` filter by `company_id = session.companyId` |

---

## Auth & Session Routes

| Route | Auth Required | Isolation | Notes |
|-------|--------------|-----------|-------|
| `POST /api/auth/register` | No (public) | N/A | Rate-limited; creates new tenant |
| `POST /api/auth/login` | No (public) | N/A | Rate-limited; IP+UA logged |
| `POST /api/auth/logout` | No (session cleared) | N/A | Session destroyed server-side |
| `GET /api/auth/me` | Session check | Session-scoped | Returns only own user |
| `POST /api/auth/forgot-password` | No (public) | N/A | Always returns 200; no email enumeration |
| `POST /api/auth/reset-password` | No (public, token-gated) | Token scoped | Token single-use, TTL 1h |
| `POST /api/auth/change-password` | `requireAuth` | Session-scoped | Rate-limited |

---

## Company & Settings Routes

| Route | Auth Required | Isolation | Notes |
|-------|--------------|-----------|-------|
| `GET /api/company` | `requireAuth` | `companyId` from session | Cannot read other companies |
| `PUT /api/company` | `requireAuth` + `requirePermission("settings_admin")` | `companyId` from session | |
| `GET /api/audit-logs` | `requireAuth` | `companyId` from session | |
| `GET /api/company/api-keys` | `requireAuth` + `requirePermission("settings_admin")` | `companyId` from session | |
| `POST /api/company/api-keys` | `requireAuth` + `requirePermission("settings_admin")` | `companyId` from session | |
| `DELETE /api/company/api-keys/:id` | `requireAuth` + `requirePermission("settings_admin")` | Ownership verified: `key.companyId === session.companyId` | |

---

## Data Entry & Metrics

| Route | Auth Required | Isolation | Notes |
|-------|--------------|-----------|-------|
| `GET /api/metrics` | `requireAuth` | `companyId` from session | |
| `POST /api/metric-values` | `requireAuth` + `requirePermission("metrics_data_entry")` | `companyId` from session | |
| `PUT /api/metric-values/:id` | `requireAuth` + `requirePermission("metrics_data_entry")` | Ownership verified via `companyId` | |
| `POST /api/carbon` | `requireAuth` + `requirePermission("metrics_data_entry")` | `companyId` from session | |

---

## Evidence

| Route | Auth Required | Isolation | Notes |
|-------|--------------|-----------|-------|
| `GET /api/evidence` | `requireAuth` | `companyId` from session | |
| `POST /api/evidence` | `requireAuth` + `requirePermission("metrics_data_entry")` | `companyId` from session; file type validated; rate-limited |
| `PUT /api/evidence/:id` | `requireAuth` + `requirePermission("metrics_data_entry")` | Ownership: `allFiles.find(f => f.id === id)` scoped to company |
| `DELETE /api/evidence/:id` | `requireAuth` + `requirePermission("metrics_data_entry")` | Ownership verified; audit logged with IP/UA |

---

## Site Management

| Route | Auth Required | Isolation | Notes |
|-------|--------------|-----------|-------|
| `GET /api/sites` | `requireAuth` | `companyId` from session | |
| `POST /api/sites` | `requireAuth` + `requirePermission("settings_admin")` | `companyId` from session | |
| `PUT /api/sites/:id` | `requireAuth` + `requirePermission("settings_admin")` | `validateSiteOwnership` enforced |
| `DELETE /api/sites/:id` | `requireAuth` + `requirePermission("settings_admin")` | `validateSiteOwnership` enforced |
| `POST /api/sites/migrate` | Disabled (returns 403) | N/A | Legacy endpoint decommissioned |

---

## Reports

| Route | Auth Required | Isolation | Notes |
|-------|--------------|-----------|-------|
| `POST /api/reports/generate` | `requireAuth` + `requirePermission("report_generation")` | `companyId` from session; `siteId` ownership validated; rate-limited |
| `GET /api/reports` | `requireAuth` | `companyId` from session | |

---

## Workflow (Approval/Rejection)

| Route | Auth Required | Isolation | Notes |
|-------|--------------|-----------|-------|
| `POST /api/workflow/review` | `requireAuth` + `requirePermission("report_generation")` | Entity ownership verified via `companyId` |
| `POST /api/workflow/bulk-review` | `requireAuth` + `requirePermission("report_generation")` | Same as above |

---

## Team / User Management

| Route | Auth Required | Isolation | Notes |
|-------|--------------|-----------|-------|
| `GET /api/users` | `requireAuth` + `requirePermission("user_management")` | `companyId` from session | |
| `PUT /api/users/:id/role` | `requireAuth` + `requirePermission("user_management")` | `targetUser.companyId === session.companyId` checked; audit logged |

---

## Billing

| Route | Auth Required | Isolation | Notes |
|-------|--------------|-----------|-------|
| `POST /api/billing/create-checkout` | `requireAuth` | `companyId` from session | |
| `POST /api/billing/cancel` | `requireAuth` + `requirePermission("settings_admin")` | `companyId` from session |
| `GET /api/billing/status` | `requireAuth` | `companyId` from session |
| `POST /api/billing/webhook` | Stripe signature verified | `companyId` from Stripe metadata | Raw body verification |

---

## Agent API Keys (Internal)

| Route | Auth Required | Isolation | Notes |
|-------|--------------|-----------|-------|
| `POST /api/internal/agent/keys` | `requireAdminUser` (admin session) | Platform-wide (super-admin/admin) | Raw key shown once; audit logged |
| `GET /api/internal/agent/keys` | `requireAdminUser` | Platform-wide | Never returns `keyHash` |
| `DELETE /api/internal/agent/keys/:id` | `requireAdminUser` | Platform-wide | Audit logged |

---

## Super-Admin Routes

| Route | Auth Required | Isolation | Notes |
|-------|--------------|-----------|-------|
| `GET /api/admin/companies` | `requireSuperAdmin` | Platform-wide view | |
| `GET /api/admin/users` | `requireSuperAdmin` | Platform-wide view | |
| `POST /api/admin/company/suspend` | `requireSuperAdmin` | Any company | |
| `POST /api/admin/impersonate/:companyId` | `requireSuperAdmin` | Sets `isImpersonating` flag; audit logged |
| `GET /api/admin/audit-logs` | `requireAuth` + `requireSuperAdmin` | Platform-wide | |
| `GET /api/admin/security-audit` | `requireAuth` + `requireSuperAdmin` | Platform-wide | |
| `POST /api/admin/migrate-sites` | `requireSuperAdmin` | Platform-wide | Dry-run + execute modes |

---

## Known Gaps / Accepted Risk

1. **File storage**: Evidence "files" are stored as metadata (URLs/filenames), not binary content. There is no binary file store to secure. File type validation blocks executables at upload metadata time.

2. **Webhook verification**: Stripe webhook uses raw body + signature verification. Agent webhook (`AGENT_WEBHOOK_URL`) is outbound-only; no inbound agent webhooks without API key auth.

3. **Invite flow**: Team invitations are handled via direct registration links. There is no `PUT /api/users/invite` endpoint; this is a known gap deferred to a future task.
