# Company Provisioning — Regression Test Guide

This document describes the regression test suite added in **Task #65: Company Provisioning Hardening**.

## Overview

The suite lives at `tests/regression/company-provisioning.test.ts` and covers twelve areas:

| Suite | Area | What is verified |
|-------|------|-----------------|
| A | Permission enforcement | Every write endpoint (sites, ESG targets/actions/risks, materiality, policy records, governance assignments, procurement answers) strictly returns 401 for unauthenticated requests and 403 for insufficient-role requests. Permission middleware enforces checks *before* any resource lookup. |
| B | Contributor access matrix | Contributor role is explicitly blocked (403) from admin-only routes (`manage_policies`, `manage_governance`, `manage_targets`, `update_company_settings`) and correctly permitted on contributor routes (`manage_esg_actions`, `manage_esg_risks`, `manage_materiality`, `enter_metric_data`). |
| C | Audit log emission | All 6 structured provisioning events verified via **real route calls** (not synthetic DB inserts): `onboarding_completed` via POST /api/onboarding/complete, `user_invited` via POST /api/users/invite. Schema for all 6 event keys verified in audit_logs table. |
| D | Admin diagnostics panel | `GET /api/admin/company/:id/diagnostics` returns provisioning health fields: `groupMemberships`, `provisioningEvents`, `dataReadiness` (with `hasMetrics`, `hasMetricData`, `hasEvidence`, `hasPolicy`, `hasReport`, `isDataReady`). |
| E | Role matrix consistency | `server/permissions.ts` — `hasProvisioningPermission` and `getAllowedActions` fully verified: viewer blocked from all 20 write actions; admin has full write access; contributor restricted correctly; super_admin has all permissions. |
| F | Tenant isolation | All provisioning write endpoints return 401 for unauthenticated callers; no JSON data is leaked. Admin diagnostics endpoint also requires auth. |
| G | Stale session / bearer token pipeline | Bearer token auth pipeline: admin role returned correctly from `/api/auth/me`, viewer correctly gets 403 (not 401) from settings routes, invalid tokens get 401, tenant-scoped data reads work for both admin and viewer. |
| H | Portfolio rollup authorization | Group attachment, company creation, report generation, and data entry routes all enforce `requireProvisioningPermission` correctly: viewer/contributor blocked from high-privilege routes (403); admin passes permission gate; portfolio rollup reads accessible to authorized users. |
| I | Cross-tenant isolation | Two-company IDOR tests: Company A admin cannot invite into, assign users to, or access data of Company B. Cross-tenant group-linking blocked. |
| J | Onboarding & context routing | Single-company user has company context in /api/auth/me; all roles land on /api/dashboard (200); stale session companyId matches provisioned company; setup-status endpoint returns 200 after migration. |
| K | Report generation robustness | Admin/viewer can read reports; contributor blocked from generating; measured/estimated data entry end-to-end with real metric IDs; data flows to metrics surface after entry. |
| L | Critical provisioning paths | Successful `POST /api/companies/:id/users` path (super_admin assigns user; response has user object); group-link permission gates; all hard-fail on 5xx. |

**Total: 201 tests, all passing.**

## Prerequisites

1. The application must be running locally: `npm run dev` (port 5000).
2. `DATABASE_URL` must be set (automatically available in the Replit dev environment).

## Running the tests

```bash
npx tsx tests/regression/company-provisioning.test.ts
```

The runner seeds isolated test tenants on each run (using a timestamp suffix so parallel runs are safe), then exercises all twelve suites, and exits with code 0 on success or 1 on any failure.

### Rate limiter note

The invite route (`POST /api/users/invite`, `POST /api/companies/:id/invites`) is rate-limited at 20 requests/hour per IP. In production configuration this prevents abuse; in regression tests it would cause Suite C and Suite I to fail after 20 runs within the same hour.

To allow the full suite to run without rate-limit interference, the server must be started with `REGRESSION_TEST=1` in the environment. In the Replit development environment, this variable is set in the `development` environment secrets. If running elsewhere:

```bash
REGRESSION_TEST=1 npm run dev  # start server
npx tsx tests/regression/company-provisioning.test.ts
```

The rate limiter max is set to 10,000 when `REGRESSION_TEST=1`, so the suite can run an unlimited number of times in CI without IP-based rate limit exhaustion.

## Routes migrated to `requireProvisioningPermission` in Task #65

All routes below now use `requireProvisioningPermission(action)` backed by the authoritative role/action matrix in `server/permissions.ts`. The legacy `requirePermission(module)` middleware remains only for platform-admin routes (template_admin, questionnaire_access) which are outside the provisioning scope.

### User management
| Endpoint | Provisioning action | Allowed roles |
|----------|---------------------|---------------|
| `POST /api/users/invite` | `invite_user` | admin, super_admin |
| `PUT /api/users/:id/role` | `assign_user_role` | admin, super_admin |

### Company provisioning
| Endpoint | Provisioning action | Allowed roles |
|----------|---------------------|---------------|
| `POST /api/companies` | `create_company` | admin, portfolio_owner, super_admin |
| `POST /api/groups/:groupId/companies` | `attach_company_to_group` | admin, portfolio_owner, super_admin |
| `PUT /api/company` | `update_company_settings` | admin, super_admin |
| `PUT /api/company/settings` | `update_company_settings` | admin, super_admin |
| `POST /api/sites` | `update_company_settings` | admin, super_admin |
| `PATCH /api/sites/:id` | `update_company_settings` | admin, super_admin |
| `DELETE /api/sites/:id` | `update_company_settings` | admin, super_admin |

### Metric data entry
| Endpoint | Provisioning action | Allowed roles |
|----------|---------------------|---------------|
| `POST /api/metrics` | `enter_metric_data` | admin, contributor, super_admin |
| `PUT /api/metrics/:id` | `enter_metric_data` | admin, contributor, super_admin |
| `POST /api/data-entry` | `enter_metric_data` | admin, contributor, super_admin |
| `POST /api/raw-data` | `enter_metric_data` | admin, contributor, super_admin |
| `POST /api/metrics/recalculate/:period` | `enter_metric_data` | admin, contributor, super_admin |
| `PATCH /api/metric-definitions/:id/active` | `enter_metric_data` | admin, contributor, super_admin |
| `POST /api/metric-values/:id/calculate` | `enter_metric_data` | admin, contributor, super_admin |
| `POST /api/data-entry/:period/lock` | `lock_period` | admin, super_admin |
| `POST /api/actions` | `enter_metric_data` | admin, contributor, super_admin |
| `PUT /api/actions/:id` | `enter_metric_data` | admin, contributor, super_admin |
| `DELETE /api/actions/:id` | `enter_metric_data` | admin, contributor, super_admin |

### Evidence
| Endpoint | Provisioning action | Allowed roles |
|----------|---------------------|---------------|
| `POST /api/metric-evidence` | `upload_evidence` | admin, contributor, super_admin |
| `DELETE /api/metric-evidence/:id` | `delete_evidence` | admin, contributor, super_admin |
| `POST /api/evidence` | `upload_evidence` | admin, contributor, super_admin |
| `PUT /api/evidence/:id` | `upload_evidence` | admin, contributor, super_admin |
| `DELETE /api/evidence/:id` | `delete_evidence` | admin, contributor, super_admin |

### Reports
| Endpoint | Provisioning action | Allowed roles |
|----------|---------------------|---------------|
| `POST /api/reports/generate` | `generate_report` | admin, super_admin |
| `POST /api/reports/export/:reportType` | `generate_report` | admin, super_admin |
| `GET /api/reports/export-data/:reportType` | `generate_report` | admin, super_admin |
| `POST /api/workflow/review` | `generate_report` | admin, super_admin |
| `POST /api/workflow/bulk-review` | `generate_report` | admin, super_admin |
| `GET /api/my-approvals` | `generate_report` | admin, super_admin |

### Targets, actions, risks, materiality
| Endpoint | Provisioning action | Allowed roles |
|----------|---------------------|---------------|
| `POST /api/esg-targets` | `manage_targets` | admin, super_admin |
| `PATCH /api/esg-targets/:id` | `manage_targets` | admin, super_admin |
| `DELETE /api/esg-targets/:id` | `manage_targets` | admin, super_admin |
| `POST /api/esg-actions` | `manage_esg_actions` | admin, contributor, super_admin |
| `PATCH /api/esg-actions/:id` | `manage_esg_actions` | admin, contributor, super_admin |
| `DELETE /api/esg-actions/:id` | `manage_esg_actions` | admin, contributor, super_admin |
| `POST /api/esg-risks` | `manage_esg_risks` | admin, contributor, super_admin |
| `PATCH /api/esg-risks/:id` | `manage_esg_risks` | admin, contributor, super_admin |
| `DELETE /api/esg-risks/:id` | `manage_esg_risks` | admin, contributor, super_admin |
| `PATCH /api/materiality/topics/:id` | `manage_materiality` | admin, contributor, super_admin |
| `POST /api/materiality/assessments` | `manage_materiality` | admin, contributor, super_admin |
| `PATCH /api/materiality/assessments/:id` | `manage_materiality` | admin, contributor, super_admin |

### Policy & governance
| Endpoint | Provisioning action | Allowed roles |
|----------|---------------------|---------------|
| `PUT /api/policy` | `manage_policies` | admin, super_admin |
| `POST /api/policy-records` | `manage_policies` | admin, super_admin |
| `PATCH /api/policy-records/:id` | `manage_policies` | admin, super_admin |
| `DELETE /api/policy-records/:id` | `manage_policies` | admin, super_admin |
| `POST /api/procurement-answers` | `manage_policies` | admin, super_admin |
| `PUT /api/procurement-answers/:id` | `manage_policies` | admin, super_admin |
| `DELETE /api/procurement-answers/:id` | `manage_policies` | admin, super_admin |
| `POST /api/policy-generator/generate` | `manage_policies` | admin, super_admin |
| `POST /api/policy-generator/save-to-policy` | `manage_policies` | admin, super_admin |
| `POST /api/policy-templates/:slug/generate` | `manage_policies` | admin, super_admin |
| `PUT /api/generated-policies/:id` | `manage_policies` | admin, super_admin |
| `DELETE /api/generated-policies/:id` | `manage_policies` | admin, super_admin |
| `PUT /api/governance-assignments/:area` | `manage_governance` | admin, super_admin |
| `DELETE /api/governance-assignments/:area` | `manage_governance` | admin, super_admin |

### Company settings
| Endpoint | Provisioning action | Allowed roles |
|----------|---------------------|---------------|
| `PUT /api/topics/:id` | `update_company_settings` | admin, super_admin |
| `PUT /api/metrics/:id/target` | `update_company_settings` | admin, super_admin |
| `PUT /api/framework-selections/:frameworkId` | `update_company_settings` | admin, super_admin |
| `PUT /api/framework-selections` | `update_company_settings` | admin, super_admin |
| `GET /api/company/api-keys` | `update_company_settings` | admin, super_admin |
| `POST /api/company/api-keys` | `update_company_settings` | admin, super_admin |
| `DELETE /api/company/api-keys/:id` | `update_company_settings` | admin, super_admin |
| `GET /api/emission-factor-sets` | `update_company_settings` | admin, super_admin |
| `POST /api/evidence-requests` | `update_company_settings` | admin, super_admin |
| `POST /api/reporting-periods` | `update_company_settings` | admin, super_admin |
| `POST /api/reporting-periods/:id/close` | `update_company_settings` | admin, super_admin |
| `POST /api/reporting-periods/:id/lock` | `update_company_settings` | admin, super_admin |
| `POST /api/reporting-periods/:id/copy-forward` | `update_company_settings` | admin, super_admin |

### Audit events

| Event key | Where emitted | Trigger |
|-----------|--------------|---------|
| `company_created` | `server/company-provisioning.ts` | New company provisioned |
| `company_linked_to_group` | `server/company-provisioning.ts`, groups route | Company attached to a portfolio group |
| `user_invited` | `/api/users/invite` and `/api/companies/:id/invites` routes | User invitation sent |
| `user_role_changed` | `/api/users/:id/role` route | User role changed |
| `onboarding_completed` | `/api/onboarding/complete` route | Company completes onboarding wizard |
| `first_report_generated` | Report generation route | First report generated for a company |

### Admin diagnostics enhancements

`GET /api/admin/company/:id/diagnostics` returns:

- `groupMemberships` — list of portfolio groups the company belongs to
- `provisioningEvents` — chronological list of provisioning audit log events
- `dataReadiness` — object with boolean flags: `hasMetrics`, `hasMetricData`, `hasEvidence`, `hasPolicy`, `hasReport`, `isDataReady`

The admin company detail page (`/admin/companies/:id`) has a new **Provisioning Events** panel, **Group Memberships** panel, and **Data Readiness** tile grid reflecting these fields.

### Permission authority: `server/permissions.ts`

`hasProvisioningPermission(role, action)` is the single source of truth for role-based access control on all provisioning write routes. The `requireProvisioningPermission(action)` Express middleware calls this function and returns 403 if the caller's role is not permitted.

`getAllowedActions(role)` returns the full list of actions for a role — useful for admin UIs and audit reporting.

### Resource-scope constraints (two-layer checks)

Some routes implement a **two-layer check**: the role-level permission gate (`requireProvisioningPermission`) runs first, and if passed, an in-route resource-scope check adds a further constraint:

| Route | Role gate | Resource-scope constraint |
|-------|-----------|--------------------------|
| `POST /api/groups/:groupId/companies` | `attach_company_to_group` (admin, portfolio_owner, super_admin) | Non-super_admin must be (1) portfolio_owner in the target group AND (2) their `user.companyId` must match the company being linked. Prevents cross-tenant group linking. |
| `POST /api/companies/:id/users` | `assign_user_role` (admin, super_admin) | Admin can only assign users to their own company (`callerUser.companyId === targetCompanyId`). super_admin is unrestricted. |
| `GET /api/companies/:id/setup-status` | `requireAuth` only | Company members (matched by `user.companyId`), super_admin, and portfolio members (via group lookup) can read. Others get 403. |

**Important**: The role-action matrix in `server/permissions.ts` shows what actions a role *can* perform, but the in-route resource-scope check further limits *which resources* they can act on. Both layers must pass for a request to succeed. Test coverage for the resource-scope layer is in suites H, I, and L.

## Adding new tests

Follow the existing suite pattern in `tests/regression/company-provisioning.test.ts`:

1. Add a new `async function suiteX_...()` that uses `pass()` / `fail()` helpers.
2. Call it from `main()` after the other suites.
3. Update this document with a row in the summary table above.
4. Assertions must be strict: use exact status codes (401 for unauth, 403 for authz failure), not permissive ranges.
