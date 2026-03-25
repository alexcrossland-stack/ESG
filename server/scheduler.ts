import { storage, db } from "./storage";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

type JobHandler = (payload: any, companyId: string | null) => Promise<any>;

const jobHandlers = new Map<string, JobHandler>();
const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;
const TICK_INTERVAL = 60_000;
const QUEUE_POLL_INTERVAL = 5_000;
const STUCK_TIMEOUT_MS = 10 * 60 * 1000;
const JOB_CLEANUP_DAYS = 30;
const HEALTH_CLEANUP_DAYS = 90;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let queueTimer: ReturnType<typeof setInterval> | null = null;
const startTime = Date.now();

interface RecurringJobDef {
  jobType: string;
  intervalMs: number;
  lastRun: number;
}

const recurringJobs: RecurringJobDef[] = [
  { jobType: "reminder_check", intervalMs: 24 * 60 * 60 * 1000, lastRun: 0 },
  { jobType: "evidence_expiry", intervalMs: 24 * 60 * 60 * 1000, lastRun: 0 },
  { jobType: "procurement_revalidation", intervalMs: 7 * 24 * 60 * 60 * 1000, lastRun: 0 },
  { jobType: "compliance_recalculation", intervalMs: 7 * 24 * 60 * 60 * 1000, lastRun: 0 },
  { jobType: "activity_cleanup", intervalMs: 24 * 60 * 60 * 1000, lastRun: 0 },
  { jobType: "job_cleanup", intervalMs: 24 * 60 * 60 * 1000, lastRun: 0 },
  { jobType: "health_event_cleanup", intervalMs: 24 * 60 * 60 * 1000, lastRun: 0 },
  { jobType: "gdpr_export_cleanup", intervalMs: 6 * 60 * 60 * 1000, lastRun: 0 },
  { jobType: "gdpr_deletion_processor", intervalMs: 60 * 60 * 1000, lastRun: 0 },
  { jobType: "generated_files_cleanup", intervalMs: 24 * 60 * 60 * 1000, lastRun: 0 },
  { jobType: "data_integrity_check", intervalMs: 24 * 60 * 60 * 1000, lastRun: 0 },
];

export function registerJobHandler(jobType: string, handler: JobHandler) {
  jobHandlers.set(jobType, handler);
}

export async function enqueueJob(
  jobType: string,
  payload: any,
  companyId: string | null,
  idempotencyKey?: string
): Promise<string | null> {
  if (idempotencyKey) {
    const existing = await storage.getJobByIdempotencyKey(idempotencyKey);
    if (existing && ["pending", "running", "completed"].includes(existing.status)) {
      const age = Date.now() - new Date(existing.createdAt!).getTime();
      if (age < 24 * 60 * 60 * 1000) return existing.id;
    }
  }

  const job = await storage.createBackgroundJob({
    companyId,
    jobType,
    status: "pending",
    payload,
    attempts: 0,
    maxAttempts: 3,
    idempotencyKey: idempotencyKey || null,
    scheduledAt: new Date(),
  });

  return job.id;
}

async function acquireAndProcessJob(): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      UPDATE background_jobs
      SET status = 'running',
          started_at = NOW(),
          locked_at = NOW(),
          worker_id = ${WORKER_ID},
          attempts = COALESCE(attempts, 0) + 1
      WHERE id = (
        SELECT id FROM background_jobs
        WHERE status = 'pending'
          AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, job_type, payload, company_id, attempts, max_attempts
    `);

    const rows = (result as any).rows;
    if (!rows || rows.length === 0) return false;

    const row = rows[0];
    const jobId = row.id as string;
    const jobType = row.job_type as string;
    const payload = row.payload;
    const companyId = row.company_id as string | null;
    const attempts = row.attempts as number;
    const maxAttempts = row.max_attempts as number || 3;

    console.log(`[Scheduler] Processing job ${jobId} (${jobType}) attempt ${attempts}/${maxAttempts}`);

    const handler = jobHandlers.get(jobType);
    if (!handler) {
      await db.execute(sql`
        UPDATE background_jobs
        SET status = 'failed', completed_at = NOW(), error = ${`No handler for: ${jobType}`},
            locked_at = NULL, worker_id = NULL
        WHERE id = ${jobId}
      `);
      await logHealthEvent("job_failure", "warning", `No handler for job type: ${jobType}`, { jobId, jobType }, companyId);
      return true;
    }

    try {
      const jobResult = await handler(payload, companyId);
      await db.execute(sql`
        UPDATE background_jobs
        SET status = 'completed', completed_at = NOW(), result = ${JSON.stringify(jobResult)}::jsonb,
            locked_at = NULL, worker_id = NULL, error = NULL
        WHERE id = ${jobId}
      `);
    } catch (err: any) {
      const failed = attempts >= maxAttempts;
      const backoffSeconds = [30, 120, 480][Math.min(attempts - 1, 2)];
      const nextSchedule = failed ? null : new Date(Date.now() + backoffSeconds * 1000);

      await db.execute(sql`
        UPDATE background_jobs
        SET status = ${failed ? "failed" : "pending"},
            completed_at = ${failed ? sql`NOW()` : sql`NULL`},
            error = ${err.message || "Unknown error"},
            locked_at = NULL,
            worker_id = NULL,
            scheduled_at = ${nextSchedule ? sql`${nextSchedule}` : sql`scheduled_at`}
        WHERE id = ${jobId}
      `);

      const severity = failed ? "error" : "warning";
      await logHealthEvent(
        "job_failure",
        severity,
        `Job ${jobType} failed (attempt ${attempts}/${maxAttempts}): ${err.message}`,
        { jobId, jobType, attempts, maxAttempts, backoffSeconds: failed ? null : backoffSeconds },
        companyId
      );
    }

    return true;
  } catch (err: any) {
    console.error("[Scheduler] Queue processing error:", err.message);
    return false;
  }
}

async function recoverStuckJobs() {
  try {
    const result = await db.execute(sql`
      UPDATE background_jobs
      SET status = 'pending', locked_at = NULL, worker_id = NULL
      WHERE status = 'running'
        AND locked_at < NOW() - INTERVAL '${sql.raw(String(STUCK_TIMEOUT_MS / 1000))} seconds'
      RETURNING id, job_type
    `);
    const rows = (result as any).rows;
    if (rows && rows.length > 0) {
      console.log(`[Scheduler] Recovered ${rows.length} stuck jobs`);
      for (const row of rows) {
        await logHealthEvent("job_stuck_recovered", "warning",
          `Recovered stuck job ${row.job_type} (${row.id})`,
          { jobId: row.id, jobType: row.job_type }, null);
      }
    }
  } catch {}
}

async function logHealthEvent(eventType: string, severity: string, message: string, details: any, companyId?: string | null) {
  try {
    await storage.createPlatformHealthEvent({
      eventType,
      severity,
      message,
      details,
      companyId: companyId || null,
    });
  } catch {}
}

async function runRecurringTick() {
  const now = Date.now();
  for (const def of recurringJobs) {
    if (now - def.lastRun >= def.intervalMs) {
      def.lastRun = now;
      try {
        const companies = await db.execute(sql`SELECT id FROM companies WHERE demo_mode = false OR demo_mode IS NULL`);
        for (const row of (companies as any).rows) {
          const idemKey = `recurring:${def.jobType}:${row.id}:${new Date().toISOString().slice(0, 10)}`;
          await enqueueJob(def.jobType, {}, row.id as string, idemKey);
        }
      } catch (err: any) {
        console.error(`[Scheduler] Recurring tick error for ${def.jobType}:`, err.message);
      }
    }
  }

  await recoverStuckJobs();
}

async function processQueue() {
  try {
    let processed = 0;
    const maxBatch = 5;
    while (processed < maxBatch) {
      const found = await acquireAndProcessJob();
      if (!found) break;
      processed++;
    }
  } catch (err: any) {
    console.error("[Scheduler] Queue poll error:", err.message);
  }
}

async function jobCleanupHandler() {
  const cutoff = new Date(Date.now() - JOB_CLEANUP_DAYS * 86400000);
  const result = await db.execute(sql`
    DELETE FROM background_jobs
    WHERE status IN ('completed', 'failed')
      AND completed_at < ${cutoff}
  `);
  const count = (result as any).rowCount || 0;
  console.log(`[Scheduler] Cleaned up ${count} old jobs`);
  return { deleted: count };
}

async function healthEventCleanupHandler() {
  const cutoff = new Date(Date.now() - HEALTH_CLEANUP_DAYS * 86400000);
  const result = await db.execute(sql`
    DELETE FROM platform_health_events
    WHERE created_at < ${cutoff}
  `);
  const count = (result as any).rowCount || 0;
  console.log(`[Scheduler] Cleaned up ${count} old health events`);
  return { deleted: count };
}

async function reminderCheckHandler(_payload: any, companyId: string | null) {
  if (!companyId) return { generated: 0 };
  const settings = await storage.getCompanySettings(companyId);
  if (settings && !(settings as any).reminderEnabled) return { generated: 0 };

  let count = 0;
  const now = new Date();
  const allMetrics = await storage.getMetrics(companyId);
  const enabledMetrics = allMetrics.filter((m: any) => m.enabled);
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const values = await storage.getMetricValuesByPeriod(companyId, currentPeriod);
  const valueMetricIds = new Set(values.map((v: any) => v.metricId));

  for (const m of enabledMetrics) {
    if (!valueMetricIds.has(m.id)) {
      const key = `metric_submission:${m.id}:${currentPeriod}`;
      try {
        await storage.createNotification({ companyId, type: "reminder", title: `Missing data: ${m.name}`, message: `No value submitted for ${m.name} in ${currentPeriod}`, sourceKey: key, link: "/data-entry" } as any);
        count++;
      } catch {}
    }
  }

  const evidence = await storage.getEvidenceFiles(companyId);
  const tiers = [60, 30, 14, 7];
  for (const e of evidence) {
    if (e.expiryDate) {
      const daysUntil = Math.floor((new Date(e.expiryDate).getTime() - now.getTime()) / 86400000);
      for (const tier of tiers) {
        if (daysUntil <= tier && daysUntil > (tier === 60 ? 30 : tier === 30 ? 14 : tier === 14 ? 7 : 0)) {
          const key = `evidence_expiry:${e.id}:${tier}d`;
          try {
            await storage.createNotification({ companyId, type: "reminder", title: `Evidence expiring in ${daysUntil} days`, message: `${e.filename} expires ${new Date(e.expiryDate).toLocaleDateString()}`, sourceKey: key, link: "/evidence" } as any);
            count++;
          } catch {}
          break;
        }
      }
    }
  }

  const actions = await storage.getActionPlans(companyId);
  for (const a of actions) {
    if (a.status !== "complete" && a.dueDate && new Date(a.dueDate) < now) {
      const key = `overdue_action:${a.id}:${currentPeriod}`;
      try {
        await storage.createNotification({ companyId, type: "reminder", title: `Overdue: ${a.title}`, message: `This action was due ${new Date(a.dueDate).toLocaleDateString()}`, sourceKey: key, link: "/actions" } as any);
        count++;
      } catch {}
    }
  }

  const pendingValues = values.filter((v: any) => v.workflowStatus === "submitted");
  for (const v of pendingValues) {
    const daysSinceSubmit = (v as any).updatedAt ? Math.floor((now.getTime() - new Date((v as any).updatedAt).getTime()) / 86400000) : 0;
    if (daysSinceSubmit >= 3) {
      const bucket = Math.floor(daysSinceSubmit / 3);
      const key = `pending_approval:${v.id}:bucket${bucket}`;
      try {
        const m = enabledMetrics.find((met: any) => met.id === v.metricId);
        await storage.createNotification({ companyId, type: "reminder", title: `Pending approval: ${m?.name || "Metric"}`, message: `Awaiting approval for ${daysSinceSubmit} days`, sourceKey: key, link: "/my-approvals" } as any);
        count++;
      } catch {}
    }
  }

  return { generated: count };
}

async function evidenceExpiryHandler(_payload: any, companyId: string | null) {
  if (!companyId) return { flagged: 0 };
  const evidence = await storage.getEvidenceFiles(companyId);
  let flagged = 0;
  const now = new Date();

  for (const e of evidence) {
    if (e.expiryDate && new Date(e.expiryDate) < now && e.evidenceStatus !== "expired") {
      try {
        await storage.updateEvidenceFile(e.id, { evidenceStatus: "expired" } as any);
        await storage.createNotification({
          companyId,
          type: "warning",
          title: `Evidence expired: ${e.filename}`,
          message: `This file expired on ${new Date(e.expiryDate).toLocaleDateString()}`,
          sourceKey: `evidence_expired:${e.id}`,
          link: "/evidence",
        } as any);
        flagged++;
      } catch {}
    }
  }

  return { flagged };
}

async function procurementRevalidationHandler(_payload: any, companyId: string | null) {
  if (!companyId) return { flagged: 0 };
  const result = await db.execute(
    sql`SELECT pa.id, pa.question FROM procurement_answers pa WHERE pa.company_id = ${companyId} AND pa.status = 'approved' AND pa.linked_metric_ids IS NOT NULL`
  );
  let flagged = 0;
  for (const row of (result as any).rows) {
    try {
      await db.execute(sql`UPDATE procurement_answers SET status = 'draft', flagged_reason = 'Scheduled revalidation' WHERE id = ${row.id}`);
      flagged++;
    } catch {}
  }
  return { flagged };
}

async function complianceRecalculationHandler(_payload: any, companyId: string | null) {
  if (!companyId) return { checked: 0 };
  const result = await db.execute(
    sql`SELECT cr.id, cr.code, cr.linked_metric_ids FROM compliance_requirements cr
        JOIN compliance_frameworks cf ON cf.id = cr.framework_id
        WHERE cf.is_active = true`
  );
  return { checked: (result as any).rows.length };
}

async function activityCleanupHandler() {
  const deleted = await storage.cleanupOldActivity(90);
  return { deleted };
}

async function gdprExportCleanupHandler() {
  try {
    const result = await db.execute(sql`
      UPDATE data_export_jobs
      SET file_data = NULL, status = 'expired'
      WHERE status = 'completed'
        AND expires_at IS NOT NULL
        AND expires_at < NOW()
        AND file_data IS NOT NULL
    `);
    const cleaned = (result as any).rowCount ?? 0;
    if (cleaned > 0) console.log(`[GDPR] Cleaned ${cleaned} expired export(s)`);
    return { cleaned };
  } catch (e) {
    console.error("[GDPR] Export cleanup error:", e);
    return { error: String(e) };
  }
}

const GENERATED_FILES_RETENTION_DAYS = 90;

async function generatedFilesCleanupHandler() {
  try {
    const cutoff = new Date(Date.now() - GENERATED_FILES_RETENTION_DAYS * 86400000);
    const result = await db.execute(sql`
      DELETE FROM generated_files
      WHERE generated_at < ${cutoff}
    `);
    const deleted = (result as any).rowCount ?? 0;
    if (deleted > 0) console.log(`[Cleanup] Removed ${deleted} generated file record(s) older than ${GENERATED_FILES_RETENTION_DAYS} days`);
    return { deleted, retentionDays: GENERATED_FILES_RETENTION_DAYS };
  } catch (e) {
    console.error("[Cleanup] Generated files cleanup error:", e);
    return { error: String(e) };
  }
}

async function gdprDeletionProcessorHandler() {
  try {
    const result = await db.execute(sql`
      SELECT id, company_id, requested_by, deletion_scope
      FROM data_deletion_requests
      WHERE status = 'pending'
        AND scheduled_at IS NOT NULL
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      LIMIT 5
    `);
    const rows = (result as { rows: Array<Record<string, unknown>> }).rows ?? [];
    let processed = 0;
    for (const row of rows) {
      try {
        if (row.deletion_scope === "company") {
          await db.execute(sql`DELETE FROM metric_values WHERE metric_id IN (SELECT id FROM metrics WHERE company_id = ${row.company_id})`);
          await db.execute(sql`DELETE FROM raw_data_inputs WHERE company_id = ${row.company_id}`);
          await db.execute(sql`DELETE FROM carbon_calculations WHERE company_id = ${row.company_id}`);
          await db.execute(sql`DELETE FROM action_plans WHERE company_id = ${row.company_id}`);
          await db.execute(sql`DELETE FROM evidence_files WHERE company_id = ${row.company_id}`);
          await db.execute(sql`DELETE FROM report_runs WHERE company_id = ${row.company_id}`);
          await db.execute(sql`DELETE FROM metrics WHERE company_id = ${row.company_id}`);
          await db.execute(sql`DELETE FROM data_export_jobs WHERE company_id = ${row.company_id}`);
          await db.execute(sql`UPDATE audit_logs SET details = NULL WHERE company_id = ${row.company_id} AND action NOT IN ('company_deletion_requested', 'data_export_completed', 'legal_acceptance', 'mfa_backup_code_used')`);
          const users = await storage.getUsersByCompany(row.company_id);
          for (const u of users) {
            await storage.updateUser(u.id, {
              username: `deleted-user-${u.id.slice(0, 8)}`,
              email: `deleted-${u.id.slice(0, 8)}@removed.local`,
              password: "DELETED",
              mfaEnabled: false,
              mfaSecretEncrypted: null,
              mfaBackupCodesHash: null,
              mfaEnabledAt: null,
            });
          }
          await db.execute(sql`UPDATE companies SET name = ${"Deleted Company " + row.company_id.slice(0, 8)}, status = 'deleted' WHERE id = ${row.company_id}`);
          await db.execute(sql`
            UPDATE data_deletion_requests SET status = 'completed', processed_at = NOW()
            WHERE id = ${row.id}
          `);
          await storage.createAuditLog({
            companyId: row.company_id,
            userId: row.requested_by,
            action: "company_deletion_executed",
            entityType: "company",
            entityId: row.company_id,
          });
          processed++;
        }
      } catch (err) {
        console.error(`[GDPR] Deletion processing error for request ${row.id}:`, err);
        await db.execute(sql`
          UPDATE data_deletion_requests SET status = 'failed', error = ${String(err)}
          WHERE id = ${row.id}
        `);
      }
    }
    if (processed > 0) console.log(`[GDPR] Processed ${processed} deletion request(s)`);
    return { processed };
  } catch (e) {
    console.error("[GDPR] Deletion processor error:", e);
    return { error: String(e) };
  }
}

export function getSchedulerStatus() {
  return {
    workerId: WORKER_ID,
    uptime: Date.now() - startTime,
    recurringJobs: recurringJobs.map(j => ({
      jobType: j.jobType,
      intervalMs: j.intervalMs,
      lastRun: j.lastRun ? new Date(j.lastRun).toISOString() : null,
    })),
  };
}

async function dataIntegrityCheckHandler(_payload: any, _companyId: string | null): Promise<any> {
  try {
    const { checkDashboardVsMetrics, checkReportVsDashboard, checkPortfolioVsCompanies } = await import("./integrity-checks");
    const companies = await db.execute(sql`SELECT id FROM companies WHERE status = 'active' LIMIT 50`);
    const rows = (companies as any).rows ?? [];
    let totalDiscrepancies = 0;
    for (const row of rows) {
      const cid = row.id as string;
      const [dashResult, reportResult] = await Promise.all([
        checkDashboardVsMetrics(cid),
        checkReportVsDashboard(cid),
      ]);
      totalDiscrepancies += dashResult.discrepancies.length + reportResult.discrepancies.length;
    }
    const groups = await db.execute(sql`SELECT id FROM groups LIMIT 20`);
    const groupRows = (groups as any).rows ?? [];
    for (const row of groupRows) {
      const gid = row.id as string;
      const companyIdsResult = await db.execute(sql`SELECT company_id FROM group_companies WHERE group_id = ${gid}`);
      const companyIds = ((companyIdsResult as any).rows ?? []).map((r: any) => r.company_id as string);
      if (companyIds.length > 0) {
        const portResult = await checkPortfolioVsCompanies(gid, companyIds);
        totalDiscrepancies += portResult.discrepancies.length;
      }
    }
    const msg = `[integrity] Daily check complete: ${rows.length} companies + ${groupRows.length} groups checked, ${totalDiscrepancies} discrepancies`;
    if (totalDiscrepancies > 0) {
      console.warn(msg);
    } else {
      console.log(msg);
    }
    return { checked: rows.length, groupsChecked: groupRows.length, totalDiscrepancies };
  } catch (e: any) {
    console.error("[integrity] Daily check error:", e?.message ?? e);
    return { error: String(e) };
  }
}

export function startScheduler() {
  registerJobHandler("reminder_check", reminderCheckHandler);
  registerJobHandler("evidence_expiry", evidenceExpiryHandler);
  registerJobHandler("procurement_revalidation", procurementRevalidationHandler);
  registerJobHandler("compliance_recalculation", complianceRecalculationHandler);
  registerJobHandler("activity_cleanup", activityCleanupHandler);
  registerJobHandler("job_cleanup", jobCleanupHandler);
  registerJobHandler("health_event_cleanup", healthEventCleanupHandler);
  registerJobHandler("gdpr_export_cleanup", gdprExportCleanupHandler);
  registerJobHandler("gdpr_deletion_processor", gdprDeletionProcessorHandler);
  registerJobHandler("generated_files_cleanup", generatedFilesCleanupHandler);
  registerJobHandler("data_integrity_check", dataIntegrityCheckHandler);

  tickTimer = setInterval(runRecurringTick, TICK_INTERVAL);
  queueTimer = setInterval(processQueue, QUEUE_POLL_INTERVAL);

  setTimeout(runRecurringTick, 30_000);
  setTimeout(processQueue, 10_000);

  console.log(`[Scheduler] Started with worker ID: ${WORKER_ID}`);
}

export function stopScheduler() {
  if (tickTimer) clearInterval(tickTimer);
  if (queueTimer) clearInterval(queueTimer);
  tickTimer = null;
  queueTimer = null;
}
