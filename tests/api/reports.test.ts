/**
 * API tests: Reports domain
 *
 * Covers: generation trigger, record creation, list retrieval,
 * unauthorized failure (viewer/unauthenticated), and validation.
 *
 * Run: npx tsx tests/api/reports.test.ts
 */

import { seedTestTenants, apiRequest } from "../fixtures/seed.js";
import type { SeededTenants } from "../fixtures/seed.js";
import { Client } from "pg";
import { inflateSync } from "zlib";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function apiRequestBinary(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = {};
  const bodyStr = body ? JSON.stringify(body) : undefined;
  if (bodyStr) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(new URL(path, BASE_URL), { method, headers, body: bodyStr });
  return {
    status: res.status,
    headers: res.headers,
    body: Buffer.from(await res.arrayBuffer()),
  };
}

function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const pieces: string[] = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of raw.matchAll(streamPattern)) {
    let stream = Buffer.from(match[1], "latin1");
    try {
      stream = inflateSync(stream);
    } catch {
      // Some PDF streams may be uncompressed.
    }
    const content = stream.toString("latin1");
    for (const hex of content.matchAll(/<([0-9a-fA-F\s]+)>/g)) {
      const normalized = hex[1].replace(/\s+/g, "");
      if (!normalized || normalized.length % 2 !== 0) continue;
      pieces.push(Buffer.from(normalized, "hex").toString("utf8"));
    }
    for (const literal of content.matchAll(/\(([^()]*)\)/g)) {
      pieces.push(literal[1].replace(/\\([\\()])/g, "$1"));
    }
  }
  return pieces.join("").replace(/\s+/g, " ").trim();
}

async function insertGeneratedReportFile(companyId: string, reportRunId: string): Promise<string> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const fileData = Buffer.from("%PDF-1.4\n% test tenant report\n").toString("base64");
    const res = await client.query<{ id: string }>(
      `INSERT INTO generated_files (report_run_id, company_id, file_type, filename, file_data, file_size)
       VALUES ($1, $2, 'pdf', 'tenant-b-report.pdf', $3, $4)
       RETURNING id`,
      [reportRunId, companyId, fileData, Buffer.byteLength(fileData)]
    );
    return res.rows[0].id;
  } finally {
    await client.end();
  }
}

async function expireGeneratedReportFile(fileId: string): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query("UPDATE generated_files SET expires_at = TIMESTAMP '2000-01-01 00:00:00' WHERE id = $1", [fileId]);
  } finally {
    await client.end();
  }
}

async function prepareReportDownloadTenant(companyId: string, token: string): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query("UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1", [companyId]);
  } finally {
    await client.end();
  }

  const metricsRes = await apiRequest("GET", "/api/metrics", undefined, token);
  if (metricsRes.status !== 200) {
    throw new Error(`GET /api/metrics failed before report test: status=${metricsRes.status} body=${metricsRes.body.slice(0, 200)}`);
  }

  const metrics = JSON.parse(metricsRes.body) as Array<{ id: string }>;
  const metricId = Array.isArray(metrics) ? metrics[0]?.id : undefined;
  if (!metricId) {
    throw new Error(`No metrics available before report test: body=${metricsRes.body.slice(0, 200)}`);
  }

  const dataEntryRes = await apiRequest("POST", "/api/data-entry", {
    metricId,
    period: "2024-01",
    value: 10,
    notes: "seed for report API test",
  }, token);
  if (![200, 201].includes(dataEntryRes.status)) {
    throw new Error(`POST /api/data-entry failed before report test: status=${dataEntryRes.status} body=${dataEntryRes.body.slice(0, 200)}`);
  }
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;

  try {
    await prepareReportDownloadTenant(tenantA.companyId, tenantA.adminToken);
  } catch (err) {
    fail("prepare tenant for generated report download tests", err instanceof Error ? err.message : String(err));
  }

  // ── 1. Admin can generate a report ───────────────────────────────────────
  let generatedReportId: string | null = null;
  let generatedFileId: string | null = null;
  {
    const name = "admin POST /api/reports/generate returns 200 with id (no 500)";
    const res = await apiRequest("POST", "/api/reports/generate", {
      reportType: "pdf",
      reportTemplate: "management",
      period: "2024-01",
      includeMetrics: true,
      includePolicy: false,
      includeTopics: false,
    }, tenantA.adminToken);
    if (res.status === 500) fail(name, "server error");
    else if (![200, 201].includes(res.status)) fail(name, `status=${res.status} body=${res.body.slice(0,200)}`);
    else {
      const body = JSON.parse(res.body) as { report?: { id?: string } };
      const id = body.report?.id;
      if (!id) fail(name, `missing report.id — body=${res.body.slice(0,200)}`);
      else {
        generatedReportId = id;
        pass(name, `id=${id}`);
      }
    }
  }

  // ── 2. Generated report appears in list ──────────────────────────────────
  {
    const name = "generated report appears in GET /api/reports list with unavailable file status before file generation";
    const res = await apiRequest("GET", "/api/reports", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body);
      if (!Array.isArray(body)) fail(name, "expected array");
      else if (generatedReportId) {
        const found = body.find((r: { id?: string }) => r.id === generatedReportId) as {
          id?: string;
          fileAvailability?: string;
          latestFileId?: string | null;
          latestDownloadUrl?: string | null;
          fileUnavailableReason?: string | null;
        } | undefined;
        if (!found) fail(name, `reportId=${generatedReportId} not in list`);
        else if (found.fileAvailability !== "unavailable") fail(name, `expected unavailable before file generation, got ${found.fileAvailability}`);
        else if (found.latestFileId !== null) fail(name, `expected latestFileId null, got ${found.latestFileId}`);
        else if (found.latestDownloadUrl !== null) fail(name, `expected latestDownloadUrl null, got ${found.latestDownloadUrl}`);
        else if (!found.fileUnavailableReason) fail(name, "missing fileUnavailableReason");
        else pass(name);
      } else {
        pass(name, "skipped id check — generation skipped");
      }
    }
  }

  // ── 3. File generation enriches report history with download metadata ────
  {
    const name = "generated report exposes latest file metadata in GET /api/reports after file creation";
    if (!generatedReportId) {
      pass(name, "skipped — generated report unavailable");
    } else {
      const fileRes = await apiRequest("POST", `/api/reports/${generatedReportId}/generate-file`, {
        format: "pdf",
      }, tenantA.adminToken);
      if (fileRes.status !== 200) fail(name, `file generation status=${fileRes.status} body=${fileRes.body.slice(0, 200)}`);
      else {
        const fileBody = JSON.parse(fileRes.body) as { fileId?: string; downloadUrl?: string };
        generatedFileId = fileBody.fileId || null;
        const listRes = await apiRequest("GET", "/api/reports", undefined, tenantA.adminToken);
        if (listRes.status !== 200) fail(name, `list status=${listRes.status}`);
        else {
          const listBody = JSON.parse(listRes.body);
          const found = Array.isArray(listBody)
            ? listBody.find((r: { id?: string }) => r.id === generatedReportId) as {
                fileAvailability?: string;
                latestFileId?: string | null;
                latestFilename?: string | null;
                latestDownloadUrl?: string | null;
              } | undefined
            : undefined;
          if (!generatedFileId) fail(name, "missing fileId from generate-file response");
          else if (fileBody.downloadUrl !== `/api/reports/${generatedReportId}/download/${generatedFileId}`) fail(name, `unexpected generate-file downloadUrl=${fileBody.downloadUrl}`);
          else if (!found) fail(name, `reportId=${generatedReportId} missing after file generation`);
          else if (found.fileAvailability !== "available") fail(name, `expected available, got ${found.fileAvailability}`);
          else if (found.latestFileId !== generatedFileId) fail(name, `expected latestFileId=${generatedFileId}, got ${found.latestFileId}`);
          else if (!found.latestFilename) fail(name, "missing latestFilename");
          else if (found.latestDownloadUrl !== `/api/reports/${generatedReportId}/download/${generatedFileId}`) fail(name, `unexpected latestDownloadUrl=${found.latestDownloadUrl}`);
          else pass(name);
        }
      }
    }
  }

  // ── 4. Download route requires auth ───────────────────────────────────────
  {
    const name = "GET /api/reports/:id opens a historical report detail with safe library metadata";
    if (!generatedReportId || !generatedFileId) {
      pass(name, "skipped — generated report unavailable");
    } else {
      const res = await apiRequest("GET", `/api/reports/${generatedReportId}`, undefined, tenantA.adminToken);
      if (res.status !== 200) fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
      else {
        const body = JSON.parse(res.body) as {
          id?: string;
          companyId?: string;
          companyName?: string | null;
          generatedByName?: string | null;
          reportData?: unknown;
          latestFileId?: string | null;
          latestDownloadUrl?: string | null;
          fileAvailability?: string;
        };
        if (body.id !== generatedReportId) fail(name, `expected id=${generatedReportId}, got ${body.id}`);
        else if (body.companyId !== tenantA.companyId) fail(name, `expected tenant companyId, got ${body.companyId}`);
        else if (!body.companyName) fail(name, "missing companyName");
        else if (!body.generatedByName) fail(name, "missing generatedByName");
        else if (!body.reportData) fail(name, "missing immutable reportData snapshot");
        else if (body.fileAvailability !== "available") fail(name, `expected available, got ${body.fileAvailability}`);
        else if (body.latestFileId !== generatedFileId) fail(name, `expected latestFileId=${generatedFileId}, got ${body.latestFileId}`);
        else if (body.latestDownloadUrl !== `/api/reports/${generatedReportId}/download/${generatedFileId}`) fail(name, `unexpected latestDownloadUrl=${body.latestDownloadUrl}`);
        else pass(name);
      }
    }
  }

  {
    const name = "GET /api/reports/:id preserves the selected historical report snapshot";
    if (!generatedReportId) {
      pass(name, "skipped — generated report unavailable");
    } else {
      const metricsRes = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
      if (metricsRes.status !== 200) fail(name, `metrics status=${metricsRes.status} body=${metricsRes.body.slice(0, 200)}`);
      else {
        const metricId = (JSON.parse(metricsRes.body) as Array<{ id: string }>)[0]?.id;
        if (!metricId) fail(name, "missing metric id");
        else {
          const period = "2024-02";
          const dataEntryRes = await apiRequest("POST", "/api/data-entry", {
            metricId,
            period,
            value: 22,
            notes: "seed for historical report snapshot selection",
          }, tenantA.adminToken);
          if (![200, 201].includes(dataEntryRes.status)) fail(name, `data-entry status=${dataEntryRes.status} body=${dataEntryRes.body.slice(0, 200)}`);
          else {
            const secondReportRes = await apiRequest("POST", "/api/reports/generate", {
              reportType: "pdf",
              reportTemplate: "customer",
              period,
              includeMetrics: true,
              includePolicy: false,
              includeTopics: false,
            }, tenantA.adminToken);
            if (![200, 201].includes(secondReportRes.status)) fail(name, `second report status=${secondReportRes.status} body=${secondReportRes.body.slice(0, 200)}`);
            else {
              const secondReportId = (JSON.parse(secondReportRes.body) as { report?: { id?: string } }).report?.id;
              if (!secondReportId) fail(name, "missing second report id");
              else {
                const firstDetail = await apiRequest("GET", `/api/reports/${generatedReportId}`, undefined, tenantA.adminToken);
                const secondDetail = await apiRequest("GET", `/api/reports/${secondReportId}`, undefined, tenantA.adminToken);
                if (firstDetail.status !== 200) fail(name, `first detail status=${firstDetail.status}`);
                else if (secondDetail.status !== 200) fail(name, `second detail status=${secondDetail.status}`);
                else {
                  const first = JSON.parse(firstDetail.body) as { period?: string; reportTemplate?: string; reportData?: { period?: string; reportTemplate?: string } };
                  const second = JSON.parse(secondDetail.body) as { period?: string; reportTemplate?: string; reportData?: { period?: string; reportTemplate?: string; values?: Array<{ value?: string }> } };
                  if (first.period !== "2024-01" || first.reportData?.period !== "2024-01") fail(name, `first snapshot period drifted: ${first.period}/${first.reportData?.period}`);
                  else if (second.period !== period || second.reportData?.period !== period) fail(name, `second snapshot period mismatch: ${second.period}/${second.reportData?.period}`);
                  else if (second.reportTemplate !== "customer" || second.reportData?.reportTemplate !== "customer") fail(name, `second template mismatch: ${second.reportTemplate}/${second.reportData?.reportTemplate}`);
                  else if (!second.reportData?.values?.some((value) => String(value.value).startsWith("22"))) fail(name, "second snapshot missing selected-period metric value");
                  else pass(name);
                }
              }
            }
          }
        }
      }
    }
  }

  {
    const name = "quarterly report includes selected quarter data and excludes outside months";
    const metricsRes = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    if (metricsRes.status !== 200) fail(name, `metrics status=${metricsRes.status} body=${metricsRes.body.slice(0, 200)}`);
    else {
      const metricId = (JSON.parse(metricsRes.body) as Array<{ id: string }>)[0]?.id;
      if (!metricId) fail(name, "missing metric id");
      else {
        const saves = await Promise.all([
          apiRequest("POST", "/api/data-entry", { metricId, period: "2024-12", value: 90, notes: "Q4 comparison" }, tenantA.adminToken),
          apiRequest("POST", "/api/data-entry", { metricId, period: "2025-01", value: 101, notes: "Q1 included" }, tenantA.adminToken),
          apiRequest("POST", "/api/data-entry", { metricId, period: "2025-03", value: 103, notes: "Q1 included" }, tenantA.adminToken),
          apiRequest("POST", "/api/data-entry", { metricId, period: "2025-04", value: 204, notes: "Q2 excluded" }, tenantA.adminToken),
        ]);
        const failedSave = saves.find((res) => ![200, 201].includes(res.status));
        if (failedSave) fail(name, `data-entry status=${failedSave.status} body=${failedSave.body.slice(0, 200)}`);
        else {
          const reportRes = await apiRequest("POST", "/api/reports/generate", {
            reportType: "pdf",
            reportTemplate: "management",
            period: "2025-Q1",
            periodType: "quarterly",
            year: 2025,
            quarter: 1,
            dateFrom: "2025-01-01",
            dateTo: "2025-03-31",
            includeMetrics: true,
            includePolicy: false,
            includeTopics: false,
          }, tenantA.adminToken);
          if (![200, 201].includes(reportRes.status)) fail(name, `report status=${reportRes.status} body=${reportRes.body.slice(0, 200)}`);
          else {
            const body = JSON.parse(reportRes.body) as {
              report?: { id?: string; period?: string };
              data?: { period?: string; periodType?: string | null; dateFrom?: string | null; dateTo?: string | null; values?: Array<{ period?: string; value?: string }>; trendSummary?: { currentPeriod?: string; previousPeriod?: string; metrics?: Array<{ metricId?: string; currentValue?: number | null; previousValue?: number | null }> } };
            };
            const periods = new Set((body.data?.values || []).map((value) => value.period));
            if (body.report?.period !== "2025-Q1" || body.data?.period !== "2025-Q1") fail(name, `period metadata mismatch report=${body.report?.period} data=${body.data?.period}`);
            else if (body.data?.periodType !== "quarterly") fail(name, `expected quarterly periodType, got ${body.data?.periodType}`);
            else if (body.data?.dateFrom !== "2025-01-01" || body.data?.dateTo !== "2025-03-31") fail(name, `date metadata mismatch ${body.data?.dateFrom}/${body.data?.dateTo}`);
            else if (!Array.from(periods).some((period) => period === "2025-01" || period === "2025-02" || period === "2025-03")) fail(name, `missing Q1 values: ${Array.from(periods).join(",")}`);
            else if (periods.has("2025-04")) fail(name, "Q2 value leaked into Q1 report");
            else if (body.data?.trendSummary?.currentPeriod !== "2025-Q1" || body.data.trendSummary.previousPeriod !== "2024-Q4") fail(name, `trend period mismatch ${body.data?.trendSummary?.currentPeriod}/${body.data?.trendSummary?.previousPeriod}`);
            else if (!body.data.trendSummary.metrics?.some((trend) => trend.metricId === metricId && trend.currentValue === 204 && trend.previousValue === 90)) fail(name, "quarterly trend comparison missing expected metric values");
            else pass(name);
          }
        }
      }
    }
  }

  {
    const name = "monthly report includes selected month data and excludes other months";
    const metricsRes = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    if (metricsRes.status !== 200) fail(name, `metrics status=${metricsRes.status} body=${metricsRes.body.slice(0, 200)}`);
    else {
      const metricId = (JSON.parse(metricsRes.body) as Array<{ id: string }>)[0]?.id;
      if (!metricId) fail(name, "missing metric id");
      else {
        const saves = await Promise.all([
          apiRequest("POST", "/api/data-entry", { metricId, period: "2025-04", value: 404, notes: "monthly comparison" }, tenantA.adminToken),
          apiRequest("POST", "/api/data-entry", { metricId, period: "2025-05", value: 505, notes: "monthly included" }, tenantA.adminToken),
          apiRequest("POST", "/api/data-entry", { metricId, period: "2025-06", value: 606, notes: "monthly excluded" }, tenantA.adminToken),
        ]);
        const failedSave = saves.find((res) => ![200, 201].includes(res.status));
        if (failedSave) fail(name, `data-entry status=${failedSave.status} body=${failedSave.body.slice(0, 200)}`);
        else {
          const reportRes = await apiRequest("POST", "/api/reports/generate", {
            reportType: "pdf",
            reportTemplate: "management",
            period: "2025-05",
            periodType: "monthly",
            year: 2025,
            month: 5,
            dateFrom: "2025-05-01",
            dateTo: "2025-05-31",
            includeMetrics: true,
            includePolicy: false,
            includeTopics: false,
          }, tenantA.adminToken);
          const exportRes = await apiRequest("GET", "/api/reports/export-data/esg_metrics_summary?period=2025-05&periodType=monthly&dateFrom=2025-05-01&dateTo=2025-05-31&siteId=__all__", undefined, tenantA.adminToken);
          if (![200, 201].includes(reportRes.status)) fail(name, `report status=${reportRes.status} body=${reportRes.body.slice(0, 200)}`);
          else if (exportRes.status !== 200) fail(name, `export-data status=${exportRes.status} body=${exportRes.body.slice(0, 200)}`);
          else {
            const body = JSON.parse(reportRes.body) as {
              report?: { id?: string; period?: string };
              data?: { period?: string; periodType?: string | null; periodLabel?: string | null; dateFrom?: string | null; dateTo?: string | null; values?: Array<{ period?: string; value?: string }>; trendSummary?: { currentPeriod?: string; previousPeriod?: string; metrics?: Array<{ metricId?: string; currentValue?: number | null; previousValue?: number | null }> } };
            };
            const exportBody = JSON.parse(exportRes.body) as { period?: string; periodType?: string | null; dateFrom?: string | null; dateTo?: string | null; values?: Array<{ period?: string; value?: string }>; trendSummary?: { currentPeriod?: string; previousPeriod?: string; metrics?: Array<{ metricId?: string; currentValue?: number | null; previousValue?: number | null }> } };
            const reportPeriods = new Set((body.data?.values || []).map((value) => value.period));
            const exportPeriods = new Set((exportBody.values || []).map((value) => value.period));
            if (body.report?.period !== "2025-05" || body.data?.period !== "2025-05") fail(name, `period metadata mismatch report=${body.report?.period} data=${body.data?.period}`);
            else if (body.data?.periodType !== "monthly") fail(name, `expected monthly periodType, got ${body.data?.periodType}`);
            else if (body.data?.dateFrom !== "2025-05-01" || body.data?.dateTo !== "2025-05-31") fail(name, `date metadata mismatch ${body.data?.dateFrom}/${body.data?.dateTo}`);
            else if (exportBody.periodType !== "monthly" || exportBody.dateFrom !== "2025-05-01" || exportBody.dateTo !== "2025-05-31") fail(name, `export metadata mismatch ${exportBody.periodType}/${exportBody.dateFrom}/${exportBody.dateTo}`);
            else if (!reportPeriods.has("2025-05") || !exportPeriods.has("2025-05")) fail(name, "selected-month value missing from report/export");
            else if (reportPeriods.has("2025-06") || exportPeriods.has("2025-06")) fail(name, "other-month value leaked into monthly report/export");
            else if (body.data?.trendSummary?.previousPeriod !== "2025-04" || exportBody.trendSummary?.previousPeriod !== "2025-04") fail(name, "monthly trend previous period metadata missing");
            else if (!body.data.trendSummary.metrics?.some((trend) => trend.metricId === metricId && trend.currentValue === 505 && trend.previousValue === 404)) fail(name, "monthly report trend comparison missing expected metric values");
            else if (!exportBody.trendSummary.metrics?.some((trend) => trend.metricId === metricId && trend.currentValue === 505 && trend.previousValue === 404)) fail(name, "monthly export trend comparison missing expected metric values");
            else {
              const detailRes = await apiRequest("GET", `/api/reports/${body.report?.id}`, undefined, tenantA.adminToken);
              if (detailRes.status !== 200) fail(name, `detail status=${detailRes.status} body=${detailRes.body.slice(0, 200)}`);
              else {
                const detail = JSON.parse(detailRes.body) as { periodType?: string | null; periodLabel?: string | null; dateFrom?: string | null; dateTo?: string | null; trendMetadata?: { previousPeriod?: string | null } | null; reportData?: { trendSummary?: { comparisonLabel?: string | null; previousPeriod?: string | null; metrics?: unknown[]; unavailable?: unknown[]; notes?: string[] } } };
                if (detail.periodType !== "monthly") fail(name, `library detail periodType mismatch ${detail.periodType}`);
                else if (!detail.periodLabel || detail.dateFrom !== "2025-05-01" || detail.dateTo !== "2025-05-31") fail(name, `library metadata mismatch ${detail.periodLabel}/${detail.dateFrom}/${detail.dateTo}`);
                else if (detail.trendMetadata?.previousPeriod !== "2025-04") fail(name, `library trend metadata mismatch ${detail.trendMetadata?.previousPeriod}`);
                else if (detail.reportData?.trendSummary?.previousPeriod !== "2025-04" || !detail.reportData.trendSummary.comparisonLabel) fail(name, "library report body missing trend summary for preview rendering");
                else {
                  const fileRes = await apiRequest("POST", `/api/reports/${body.report?.id}/generate-file`, { format: "pdf" }, tenantA.adminToken);
                  if (fileRes.status !== 200) fail(name, `snapshot file generation status=${fileRes.status} body=${fileRes.body.slice(0, 200)}`);
                  else {
                    const fileBody = JSON.parse(fileRes.body) as { fileId?: string; downloadUrl?: string };
                    if (!fileBody.fileId || !fileBody.downloadUrl) fail(name, "snapshot file generation missing file metadata");
                    else {
                      const downloadRes = await apiRequestBinary("GET", fileBody.downloadUrl, undefined, tenantA.adminToken);
                      const text = extractPdfText(downloadRes.body);
                      if (downloadRes.status !== 200) fail(name, `snapshot file download status=${downloadRes.status}`);
                      else if (!text.includes("Trend Summary")) fail(name, `snapshot file missing Trend Summary: ${text.slice(0, 500)}`);
                      else if (!text.includes("Metric Trends")) fail(name, `snapshot file missing Metric Trends: ${text.slice(0, 500)}`);
                      else if (!text.includes("Compared with previous month")) fail(name, `snapshot file missing comparison label: ${text.slice(0, 500)}`);
                      else pass(name);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  {
    const name = "annual report and export-data include selected year only";
    const metricsRes = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    if (metricsRes.status !== 200) fail(name, `metrics status=${metricsRes.status} body=${metricsRes.body.slice(0, 200)}`);
    else {
      const metricId = (JSON.parse(metricsRes.body) as Array<{ id: string }>)[0]?.id;
      if (!metricId) fail(name, "missing metric id");
      else {
        const saves = await Promise.all([
          apiRequest("POST", "/api/data-entry", { metricId, period: "2024-12", value: 412, notes: "prior-year excluded" }, tenantA.adminToken),
          apiRequest("POST", "/api/data-entry", { metricId, period: "2025-05", value: 505, notes: "annual included" }, tenantA.adminToken),
        ]);
        const failedSave = saves.find((res) => ![200, 201].includes(res.status));
        if (failedSave) fail(name, `data-entry status=${failedSave.status} body=${failedSave.body.slice(0, 200)}`);
        else {
          const reportRes = await apiRequest("POST", "/api/reports/generate", {
            reportType: "pdf",
            reportTemplate: "annual",
            period: "2025",
            periodType: "annual",
            year: 2025,
            dateFrom: "2025-01-01",
            dateTo: "2025-12-31",
            includeMetrics: true,
            includePolicy: false,
            includeTopics: false,
          }, tenantA.adminToken);
          const exportRes = await apiRequest("GET", "/api/reports/export-data/esg_metrics_summary?period=2025&periodType=annual&dateFrom=2025-01-01&dateTo=2025-12-31&siteId=__all__", undefined, tenantA.adminToken);
          if (![200, 201].includes(reportRes.status)) fail(name, `report status=${reportRes.status} body=${reportRes.body.slice(0, 200)}`);
          else if (exportRes.status !== 200) fail(name, `export-data status=${exportRes.status} body=${exportRes.body.slice(0, 200)}`);
          else {
            const reportBody = JSON.parse(reportRes.body) as { data?: { period?: string; periodType?: string | null; values?: Array<{ period?: string; value?: string }>; trendSummary?: { previousPeriod?: string; metrics?: Array<{ metricId?: string; currentValue?: number | null; previousValue?: number | null }> } } };
            const exportBody = JSON.parse(exportRes.body) as { period?: string; periodType?: string | null; dateFrom?: string | null; dateTo?: string | null; values?: Array<{ period?: string; value?: string }>; trendSummary?: { previousPeriod?: string; metrics?: Array<{ metricId?: string; currentValue?: number | null; previousValue?: number | null }> } };
            const reportPeriods = new Set((reportBody.data?.values || []).map((value) => value.period));
            const exportPeriods = new Set((exportBody.values || []).map((value) => value.period));
            if (reportBody.data?.period !== "2025" || reportBody.data?.periodType !== "annual") fail(name, `report metadata mismatch ${reportBody.data?.period}/${reportBody.data?.periodType}`);
            else if (exportBody.period !== "2025" || exportBody.periodType !== "annual") fail(name, `export metadata mismatch ${exportBody.period}/${exportBody.periodType}`);
            else if (Array.from(reportPeriods).some((period) => period?.startsWith("2024")) || Array.from(exportPeriods).some((period) => period?.startsWith("2024"))) fail(name, "prior-year value leaked into annual report/export");
            else if (!Array.from(reportPeriods).some((period) => period?.startsWith("2025")) || !Array.from(exportPeriods).some((period) => period?.startsWith("2025"))) fail(name, "selected-year value missing from annual report/export");
            else if (reportBody.data?.trendSummary?.previousPeriod !== "2024" || exportBody.trendSummary?.previousPeriod !== "2024") fail(name, "annual trend previous period metadata missing");
            else if (!reportBody.data.trendSummary.metrics?.some((trend) => typeof trend.currentValue === "number" && trend.currentValue > 0 && typeof trend.previousValue === "number")) fail(name, "annual report trend comparison missing expected metric values");
            else pass(name);
          }
        }
      }
    }
  }

  {
    const name = "viewer and contributor can browse own-tenant report detail but not generate reports";
    if (!generatedReportId) {
      pass(name, "skipped — generated report unavailable");
    } else {
      const viewerRes = await apiRequest("GET", `/api/reports/${generatedReportId}`, undefined, tenantA.viewerToken);
      const contributorRes = await apiRequest("GET", `/api/reports/${generatedReportId}`, undefined, tenantA.contributorToken);
      if (viewerRes.status !== 200) fail(name, `viewer status=${viewerRes.status} body=${viewerRes.body.slice(0, 200)}`);
      else if (contributorRes.status !== 200) fail(name, `contributor status=${contributorRes.status} body=${contributorRes.body.slice(0, 200)}`);
      else pass(name);
    }
  }

  {
    const name = "expired generated files remain unavailable from library detail and download";
    const expiredReportRes = await apiRequest("POST", "/api/reports/generate", {
      reportType: "pdf",
      reportTemplate: "management",
      period: "2024-01",
      includeMetrics: true,
      includePolicy: false,
      includeTopics: false,
    }, tenantA.adminToken);
    if (![200, 201].includes(expiredReportRes.status)) {
      pass(name, `skipped — report generation status=${expiredReportRes.status}`);
    } else {
      const expiredReportId = (JSON.parse(expiredReportRes.body) as { report?: { id?: string } }).report?.id;
      if (!expiredReportId) fail(name, "missing expired report id");
      else {
        const fileRes = await apiRequest("POST", `/api/reports/${expiredReportId}/generate-file`, { format: "pdf" }, tenantA.adminToken);
        if (fileRes.status !== 200) fail(name, `file generation status=${fileRes.status} body=${fileRes.body.slice(0, 200)}`);
        else {
          const fileId = (JSON.parse(fileRes.body) as { fileId?: string }).fileId;
          if (!fileId) fail(name, "missing generated file id");
          else {
            await expireGeneratedReportFile(fileId);
            const detailRes = await apiRequest("GET", `/api/reports/${expiredReportId}`, undefined, tenantA.adminToken);
            if (detailRes.status !== 200) fail(name, `detail status=${detailRes.status} body=${detailRes.body.slice(0, 200)}`);
            else {
              const detail = JSON.parse(detailRes.body) as { fileAvailability?: string; fileUnavailableReason?: string; latestFileId?: string | null; latestDownloadUrl?: string | null };
              const downloadRes = await apiRequest("GET", `/api/reports/${expiredReportId}/download/${fileId}`, undefined, tenantA.adminToken);
              if (detail.fileAvailability !== "unavailable") fail(name, `expected unavailable, got ${detail.fileAvailability}`);
              else if (detail.fileUnavailableReason !== "expired") fail(name, `expected expired reason, got ${detail.fileUnavailableReason}`);
              else if (detail.latestFileId !== null) fail(name, `expected latestFileId null, got ${detail.latestFileId}`);
              else if (detail.latestDownloadUrl !== null) fail(name, `expected latestDownloadUrl null, got ${detail.latestDownloadUrl}`);
              else if (downloadRes.status !== 404) fail(name, `expired download expected 404 got ${downloadRes.status}`);
              else pass(name);
            }
          }
        }
      }
    }
  }

  {
    const name = "GET generated report download route without token returns 401";
    if (!generatedReportId || !generatedFileId) {
      pass(name, "skipped — generated file unavailable");
    } else {
      const res = await apiRequest("GET", `/api/reports/${generatedReportId}/download/${generatedFileId}`);
      if (res.status !== 401) fail(name, `status=${res.status}`);
      else pass(name);
    }
  }

  {
    const name = "GET generated report download route returns file for matching report/file IDs";
    if (!generatedReportId || !generatedFileId) {
      pass(name, "skipped — generated file unavailable");
    } else {
      const res = await apiRequestBinary("GET", `/api/reports/${generatedReportId}/download/${generatedFileId}`, undefined, tenantA.adminToken);
      const contentType = res.headers.get("content-type") || "";
      if (res.status !== 200) fail(name, `status=${res.status} body=${res.body.toString("utf8").slice(0, 200)}`);
      else if (!contentType.includes("application/pdf")) fail(name, `unexpected content-type=${contentType}`);
      else if (res.body.length === 0) fail(name, "empty report download body");
      else pass(name, `${res.body.length} bytes`);
    }
  }

  {
    const name = "GET generated report download rejects a fileId from a different report";
    if (!generatedFileId) {
      pass(name, "skipped — generated file unavailable");
    } else {
      const secondReportRes = await apiRequest("POST", "/api/reports/generate", {
        reportType: "pdf",
        reportTemplate: "management",
        period: "2024-01",
        includeMetrics: true,
        includePolicy: false,
        includeTopics: false,
      }, tenantA.adminToken);
      if (![200, 201].includes(secondReportRes.status)) {
        pass(name, `skipped — second report generation status=${secondReportRes.status}`);
      } else {
        const secondReportId = (JSON.parse(secondReportRes.body) as { report?: { id?: string } }).report?.id;
        if (!secondReportId) fail(name, "missing second report id");
        else {
          const res = await apiRequest("GET", `/api/reports/${secondReportId}/download/${generatedFileId}`, undefined, tenantA.adminToken);
          if (res.status !== 404) fail(name, `expected 404 got ${res.status}`);
          else pass(name);
        }
      }
    }
  }

  // ── 5. Viewer blocked from generating reports → 403 ──────────────────────
  {
    const name = "viewer POST /api/reports/generate returns 403";
    const res = await apiRequest("POST", "/api/reports/generate", {
      reportType: "pdf",
      reportTemplate: "management",
      period: "2024-01",
    }, tenantA.viewerToken);
    if (res.status !== 403) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 6. Contributor blocked from generating reports → 403 ─────────────────
  {
    const name = "contributor POST /api/reports/generate returns 403";
    const res = await apiRequest("POST", "/api/reports/generate", {
      reportType: "pdf",
      reportTemplate: "management",
      period: "2024-01",
    }, tenantA.contributorToken);
    if (res.status !== 403) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 7. Unauthenticated → 401 ─────────────────────────────────────────────
  {
    const name = "POST /api/reports/generate without token returns 401";
    const res = await apiRequest("POST", "/api/reports/generate", {
      reportType: "pdf",
      reportTemplate: "management",
      period: "2024-01",
    });
    if (res.status !== 401) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 8. Invalid reportType enum value → 400 ───────────────────────────────
  {
    const name = "POST /api/reports/generate with invalid reportType returns 400";
    const res = await apiRequest("POST", "/api/reports/generate", {
      reportType: "invalid-type",
      period: "2024-01",
    }, tenantA.adminToken);
    if (res.status !== 400) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body) as { error?: string };
      if (!body.error) fail(name, "missing error field");
      else pass(name);
    }
  }

  // ── 9. Invalid period format → 400 ───────────────────────────────────────
  {
    const name = "POST /api/reports/generate with invalid period returns 400";
    const res = await apiRequest("POST", "/api/reports/generate", {
      reportType: "pdf",
      reportTemplate: "management",
      period: "not-a-period",
    }, tenantA.adminToken);
    if (res.status !== 400) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 10. Cross-company: Tenant A cannot access Tenant B report files ───────
  {
    const name = "Tenant A cannot GET Tenant B report files (403 or 404)";
    if (!tenantB.reportId) {
      pass(name, "skipped — Tenant B reportId unavailable");
    } else {
      const res = await apiRequest("GET", `/api/reports/${tenantB.reportId}/files`, undefined, tenantA.adminToken);
      if (![403, 404].includes(res.status)) fail(name, `expected 403/404 got ${res.status}`);
      else pass(name, `status=${res.status}`);
    }
  }

  {
    const name = "Tenant A cannot open Tenant B report detail";
    if (!tenantB.reportId) {
      pass(name, "skipped — Tenant B reportId unavailable");
    } else {
      const res = await apiRequest("GET", `/api/reports/${tenantB.reportId}`, undefined, tenantA.adminToken);
      if (res.status !== 404) fail(name, `expected 404 got ${res.status}`);
      else pass(name);
    }
  }

  {
    const name = "Tenant A cannot download Tenant B generated report file";
    if (!tenantB.reportId) {
      pass(name, "skipped — Tenant B reportId unavailable");
    } else {
      const tenantBFileId = await insertGeneratedReportFile(tenantB.companyId, tenantB.reportId);
      const res = await apiRequest("GET", `/api/reports/${tenantB.reportId}/download/${tenantBFileId}`, undefined, tenantA.adminToken);
      if (res.status !== 404) fail(name, `expected 404 got ${res.status}`);
      else pass(name);
    }
  }

  // ── 11. List is company-scoped (Tenant B data absent from Tenant A list) ───
  {
    const name = "GET /api/reports is company-scoped (Tenant B companyId absent from Tenant A list)";
    const res = await apiRequest("GET", "/api/reports", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      if (res.body.includes(tenantB.companyId)) fail(name, "Tenant B companyId found in Tenant A report list");
      else pass(name);
    }
  }

  {
    const name = "GET /api/reports/library filters, sorts, and paginates within tenant scope";
    const pagedRes = await apiRequest("GET", "/api/reports/library?limit=2&offset=0&sort=generated_desc", undefined, tenantA.adminToken);
    const customerRes = await apiRequest("GET", "/api/reports/library?reportTemplate=customer", undefined, tenantA.adminToken);
    const availableRes = await apiRequest("GET", "/api/reports/library?status=available", undefined, tenantA.adminToken);
    const searchRes = await apiRequest("GET", "/api/reports/library?search=customer", undefined, tenantA.adminToken);
    const boundedRes = await apiRequest("GET", "/api/reports/library?limit=500", undefined, tenantA.adminToken);
    const invalidDateRes = await apiRequest("GET", "/api/reports/library?dateFrom=not-a-date", undefined, tenantA.adminToken);
    if (pagedRes.status !== 200) fail(name, `paged status=${pagedRes.status} body=${pagedRes.body.slice(0, 200)}`);
    else if (customerRes.status !== 200) fail(name, `customer status=${customerRes.status} body=${customerRes.body.slice(0, 200)}`);
    else if (availableRes.status !== 200) fail(name, `available status=${availableRes.status} body=${availableRes.body.slice(0, 200)}`);
    else if (searchRes.status !== 200) fail(name, `search status=${searchRes.status} body=${searchRes.body.slice(0, 200)}`);
    else if (boundedRes.status !== 200) fail(name, `bounded status=${boundedRes.status} body=${boundedRes.body.slice(0, 200)}`);
    else if (invalidDateRes.status !== 400) fail(name, `invalid date expected 400 got ${invalidDateRes.status}`);
    else {
      const paged = JSON.parse(pagedRes.body) as { reports?: Array<{ companyId?: string; generatedAt?: string; reportTemplate?: string }>; total?: number; limit?: number; offset?: number; hasMore?: boolean };
      const customer = JSON.parse(customerRes.body) as { reports?: Array<{ companyId?: string; reportTemplate?: string }> };
      const available = JSON.parse(availableRes.body) as { reports?: Array<{ companyId?: string; fileAvailability?: string }> };
      const search = JSON.parse(searchRes.body) as { reports?: Array<{ companyId?: string; reportTemplate?: string; reportData?: { reportTitle?: string } }> };
      const bounded = JSON.parse(boundedRes.body) as { limit?: number };
      const reports = paged.reports || [];
      const hasTenantBLeak = JSON.stringify([paged, customer, available, search]).includes(tenantB.companyId);
      const sortedDescending = reports.length < 2 || new Date(reports[0].generatedAt || 0).getTime() >= new Date(reports[1].generatedAt || 0).getTime();
      if (!Array.isArray(paged.reports)) fail(name, "paged response missing reports array");
      else if (paged.limit !== 2 || paged.offset !== 0) fail(name, `unexpected pagination metadata limit=${paged.limit} offset=${paged.offset}`);
      else if (reports.length > 2) fail(name, `expected at most 2 reports, got ${reports.length}`);
      else if (!sortedDescending) fail(name, "reports not sorted newest first");
      else if (hasTenantBLeak) fail(name, "Tenant B data leaked into Tenant A library response");
      else if ((customer.reports || []).some((report) => report.reportTemplate !== "customer")) fail(name, "customer filter returned another template");
      else if ((available.reports || []).some((report) => report.fileAvailability !== "available")) fail(name, "available filter returned unavailable file");
      else if (!(search.reports || []).some((report) => report.reportTemplate === "customer" || report.reportData?.reportTitle?.toLowerCase().includes("customer"))) fail(name, "search did not return expected customer report");
      else if (bounded.limit !== 100) fail(name, `expected bounded max limit 100, got ${bounded.limit}`);
      else pass(name, `total=${paged.total} hasMore=${Boolean(paged.hasMore)}`);
    }
  }

  // ── 12. GET /api/reports returns 200 array ────────────────────────────────
  {
    const name = "GET /api/reports returns 200 array for admin";
    const res = await apiRequest("GET", "/api/reports", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body);
      if (!Array.isArray(body)) fail(name, "expected array");
      else pass(name, `${body.length} reports`);
    }
  }

  // ── 13. Readiness detail returns structured report-readiness payload ─────
  {
    const name = "GET /api/reports/readiness-detail returns 200 with readiness detail";
    const res = await apiRequest("GET", "/api/reports/readiness-detail", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    else {
      const body = JSON.parse(res.body) as {
        esgState?: string;
        stateLabel?: string;
        stateExplanation?: string;
        blockingFactors?: unknown;
        missingCategories?: unknown;
      };
      if (!body.esgState) fail(name, "missing esgState");
      else if (!body.stateLabel) fail(name, "missing stateLabel");
      else if (!body.stateExplanation) fail(name, "missing stateExplanation");
      else if (!Array.isArray(body.blockingFactors)) fail(name, "blockingFactors is not an array");
      else if (!body.missingCategories || typeof body.missingCategories !== "object") fail(name, "missingCategories is not an object");
      else pass(name, `state=${body.esgState}`);
    }
  }
}

(async () => {
  console.log("\n=== API Tests: Reports Domain ===\n");
  let tenants: SeededTenants;
  try {
    console.log("Seeding test tenants…");
    tenants = await seedTestTenants();
    console.log("Seed complete.\n");
  } catch (err) {
    console.error("SEED FAILED:", err);
    process.exit(1);
  }

  await run(tenants);

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n=== Reports: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
