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
