# Retention Rules for Sensitive Operational Data

This document defines the minimum retention rules for sensitive operational data categories in ESG Manager. All retention periods are defaults; adjust them when regulatory or contractual obligations require different timeframes.

---

## 1. Export Artifacts (GDPR Data Exports)

| Property | Value |
|----------|-------|
| Table | `data_export_jobs` |
| Data retained | Export job record (metadata) |
| File data retained | 24 hours from job completion |
| Download token validity | Single-use; expires after 24 hours |
| Cleanup mechanism | `gdpr_export_cleanup` scheduler job (runs every 6 hours) |
| Cleanup action | Sets `file_data = NULL`, `status = 'expired'` for all completed jobs where `expires_at < NOW()` |
| Download after expiry | Rejected with HTTP 410; event logged in audit log |
| Job record retention | Records are kept for audit purposes; only the `file_data` payload is nulled |
| File storage | File data stored in the `file_data` database column only — never written to public static storage |

**Rationale**: GDPR export files contain personal data and must be short-lived. The 24-hour window gives users time to download while limiting the exposure window for sensitive data at rest.

---

## 2. Deletion Staging Records

| Property | Value |
|----------|-------|
| Table | `data_deletion_requests` |
| Retention | Indefinite (kept as evidence of compliance) |
| Cool-down period (company deletion) | 7 days before execution |
| Processing mechanism | `gdpr_deletion_processor` scheduler job (runs hourly) |
| Post-execution state | `status = 'completed'`, `processed_at` timestamped |
| PII in records | Minimal — contains only scope, user/company IDs, and confirmation text |

**Rationale**: Deletion request records serve as audit evidence that data rights were honoured. They are retained indefinitely but contain no personal data payloads.

---

## 3. Backup Verification Logs

| Property | Value |
|----------|-------|
| Location | `docs/backup-restore.md` (Restore Rehearsal Log section) |
| Frequency | Minimum quarterly (every 3 months) |
| Retention | Minimum 12 months of history kept in the log |
| Contents | Date, operator, backup age, outcome, RTO achieved, notes |
| Format | Markdown table appended to `docs/backup-restore.md` |

**Rationale**: Backup verification logs demonstrate that restore capability has been tested. They are not stored in the database and are tracked via version control.

---

## 4. Temporary Report Bundles (Generated Files)

| Property | Value |
|----------|-------|
| Table | `generated_files` |
| Retention | 90 days from `generated_at` |
| Cleanup mechanism | `generated_files_cleanup` scheduler job (runs daily) |
| Cleanup action | Hard-deletes rows where `generated_at < NOW() - 90 days` |
| File storage | Base64-encoded blobs stored in the `file_data` database column |
| Access control | Scoped to `company_id`; all access requires authentication |
| Access audit | All downloads logged in `audit_logs` with action `generated_file_downloaded` |

**Rationale**: Report files are regenerable on demand. Retaining them for 90 days covers typical review cycles. Longer retention is unnecessary and increases the attack surface.

---

## 5. Uploaded Evidence Files

| Property | Value |
|----------|-------|
| Table | `evidence_files` |
| Retention | Indefinite by default (until explicitly deleted) |
| Status lifecycle | `pending` → `available` → `reviewed` → `approved`; or `quarantined` → `rejected` → `deleted` |
| Soft-delete pattern | Status set to `deleted`; record retained for audit trail |
| Status transitions | Logged in `audit_logs` with action `evidence_status_changed` |
| Upload validation | Extension blocklist + allowlist enforced on upload |
| Access logging | Upload and deletion logged in `audit_logs` |
| Expiry | Optional `expiry_date` per file; `evidence_expiry` job flags expired files |

**Rationale**: Evidence files underpin ESG data quality scores and audit trails. Hard deletion is operator-initiated. The `deleted` status enables soft-delete semantics while preserving the audit record.

---

## 6. User Activity Logs

| Property | Value |
|----------|-------|
| Table | `user_activity` |
| Retention | 90 days |
| Cleanup mechanism | `activity_cleanup` scheduler job (runs daily) |
| Cleanup action | Deletes rows where `created_at < NOW() - 90 days` |

---

## 7. Platform Health Events

| Property | Value |
|----------|-------|
| Table | `platform_health_events` |
| Retention | 90 days |
| Cleanup mechanism | `health_event_cleanup` scheduler job (runs daily) |

---

## 8. Background Jobs

| Property | Value |
|----------|-------|
| Table | `background_jobs` |
| Retention | 30 days after completion or failure |
| Cleanup mechanism | `job_cleanup` scheduler job (runs daily) |

---

## 9. Audit Logs

| Property | Value |
|----------|-------|
| Table | `audit_logs` |
| Retention | Indefinite by default |
| Sensitive events always logged | Evidence uploads, deletions, status changes; GDPR export requests and downloads; generated file downloads; account and company deletion events |

**Rationale**: Audit logs are the primary integrity record. They are not purged by automated jobs unless a company deletion is executed, in which case only non-critical log detail fields are nulled.

---

## Cleanup Job Schedule Summary

| Job | Frequency | What it cleans |
|-----|-----------|----------------|
| `gdpr_export_cleanup` | Every 6 hours | Nulls `file_data` on expired GDPR export jobs |
| `generated_files_cleanup` | Daily | Hard-deletes `generated_files` rows older than 90 days |
| `activity_cleanup` | Daily | Deletes `user_activity` rows older than 90 days |
| `health_event_cleanup` | Daily | Deletes `platform_health_events` rows older than 90 days |
| `job_cleanup` | Daily | Deletes completed/failed `background_jobs` older than 30 days |
| `evidence_expiry` | Daily | Marks evidence files as `expired` when `expiry_date` has passed |
| `gdpr_deletion_processor` | Hourly | Executes scheduled company/user deletion requests |

All cleanup jobs are **idempotent** — running them multiple times produces the same result and is safe to retry without side effects.
