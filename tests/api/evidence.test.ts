/**
 * API tests: Evidence domain
 *
 * Covers: upload metadata, list retrieval, cross-company access control,
 * viewer restriction, and missing-field validation.
 *
 * Run: npx tsx tests/api/evidence.test.ts
 */

import { seedTestTenants, apiMultipartRequest, apiRequest, apiRequestRaw } from "../fixtures/seed.js";
import type { SeededTenants } from "../fixtures/seed.js";

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

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA } = tenants;
  const rowUploadPeriod = "2026-04";

  const metricsRes = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
  if (metricsRes.status !== 200) {
    fail("seed metrics available for evidence tests", `status=${metricsRes.status}`);
    return;
  }
  const metrics = JSON.parse(metricsRes.body) as Array<{
    id: string;
    name: string;
    enabled?: boolean;
    metricType?: string;
  }>;
  const firstMetric = metrics.find((metric) => metric.enabled === true && metric.metricType === "manual");
  if (!firstMetric?.id) {
    fail("seed metrics available for evidence tests", "no enabled manual editable metric");
    return;
  }
  pass("seed metrics available for evidence tests", firstMetric.name);

  // ── 1. GET /api/evidence returns array ───────────────────────────────────
  {
    const name = "GET /api/evidence returns 200 array for admin";
    const res = await apiRequest("GET", "/api/evidence", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body);
      if (!Array.isArray(body)) fail(name, "expected array");
      else pass(name, `${body.length} records`);
    }
  }

  // ── 2. Viewer can list evidence ──────────────────────────────────────────
  {
    const name = "viewer can GET /api/evidence (200)";
    const res = await apiRequest("GET", "/api/evidence", undefined, tenantA.viewerToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 3. Admin can upload evidence record ───────────────────────────────────
  let createdEvidenceId: string | null = null;
  const uniqueFilename = `api-test-evidence-${Date.now()}.txt`;
  {
    const name = "admin POST /api/evidence multipart stores file and links selected metric";
    const form = new FormData();
    form.append("metricId", firstMetric.id);
    form.append("period", rowUploadPeriod);
    form.append("notes", "API domain test evidence");
    form.append("tags", "api,central-upload");
    form.append("file", new Blob(["central evidence upload"], { type: "text/plain" }), uniqueFilename);
    const res = await apiMultipartRequest("POST", "/api/evidence", form, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status} body=${res.body.slice(0,200)}`);
    else {
      const body = JSON.parse(res.body) as { id?: string; filename?: string; metricId?: string; linkedPeriod?: string; fileUrl?: string };
      if (!body.id) fail(name, "missing id");
      else if (body.filename !== uniqueFilename) fail(name, `filename mismatch: ${body.filename}`);
      else if (body.metricId !== firstMetric.id || body.linkedPeriod !== rowUploadPeriod || !body.fileUrl) fail(name, `unexpected linkage ${res.body.slice(0, 300)}`);
      else {
        createdEvidenceId = body.id;
        pass(name, `id=${body.id}`);
      }
    }
  }

  // ── 4. Uploaded record appears in list ────────────────────────────────────
  {
    const name = "uploaded evidence appears in GET /api/evidence list";
    if (!createdEvidenceId) { fail(name, "skipped — upload failed"); }
    else {
      const res = await apiRequest("GET", "/api/evidence", undefined, tenantA.adminToken);
      if (res.status !== 200) fail(name, `list status=${res.status}`);
      else {
        const list = JSON.parse(res.body) as Array<{ id?: string }>;
        const found = list.find(e => e.id === createdEvidenceId);
        if (!found) fail(name, `id=${createdEvidenceId} not in list`);
        else pass(name);
      }
    }
  }

  {
    const name = "central evidence download returns stored file for same tenant";
    if (!createdEvidenceId) { fail(name, "skipped — upload failed"); }
    else {
      const res = await apiRequestRaw("GET", `/api/evidence/${createdEvidenceId}/download`, undefined, tenantA.adminToken);
      if (res.status !== 200) fail(name, `status=${res.status}`);
      else if (!res.body.toString("utf-8").includes("central evidence upload")) fail(name, "download body mismatch");
      else pass(name);
    }
  }

  // ── 5. Contributor can upload evidence ────────────────────────────────────
  {
    const name = "contributor POST /api/evidence returns 200";
    const form = new FormData();
    form.append("metricId", firstMetric.id);
    form.append("period", rowUploadPeriod);
    form.append("file", new Blob(["contributor evidence"], { type: "text/plain" }), `contrib-test-${Date.now()}.txt`);
    const res = await apiMultipartRequest("POST", "/api/evidence", form, tenantA.contributorToken);
    if (res.status >= 500) fail(name, `server error status=${res.status}`);
    else if (![200, 201].includes(res.status)) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 6. Viewer cannot upload evidence → 403 ───────────────────────────────
  {
    const name = "viewer POST /api/evidence returns 403";
    const form = new FormData();
    form.append("metricId", firstMetric.id);
    form.append("period", rowUploadPeriod);
    form.append("file", new Blob(["viewer evidence"], { type: "text/plain" }), "viewer-attempt.txt");
    const res = await apiMultipartRequest("POST", "/api/evidence", form, tenantA.viewerToken);
    if (res.status !== 403) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 7. Missing filename → 400 ─────────────────────────────────────────────
  {
    const name = "POST /api/evidence without file returns 400 (not 500)";
    const form = new FormData();
    form.append("metricId", firstMetric.id);
    form.append("period", rowUploadPeriod);
    const res = await apiMultipartRequest("POST", "/api/evidence", form, tenantA.adminToken);
    if (res.status === 500) fail(name, "server error — must return 400");
    else if (res.status !== 400) fail(name, `status=${res.status}`);
    else pass(name, `status=${res.status}`);
  }

  // ── 8. Unauthenticated → 401 ──────────────────────────────────────────────
  {
    const name = "GET /api/evidence without token returns 401";
    const res = await apiRequest("GET", "/api/evidence");
    if (res.status !== 401) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 9. Evidence coverage endpoint — no 500 ───────────────────────────────
  {
    const name = "GET /api/evidence/coverage returns 200 or 404, never 500";
    const res = await apiRequest("GET", "/api/evidence/coverage", undefined, tenantA.adminToken);
    if (res.status === 500) fail(name, "server error");
    else if (![200, 404].includes(res.status)) fail(name, `status=${res.status}`);
    else pass(name, `status=${res.status}`);
  }

  // ── 10. Company isolation: Tenant A list contains no Tenant B company data ─
  {
    const name = "evidence list is company-scoped (no cross-tenant data leakage)";
    const resA = await apiRequest("GET", "/api/evidence", undefined, tenantA.adminToken);
    if (resA.status !== 200) fail(name, `status=${resA.status}`);
    else {
      const listA = JSON.parse(resA.body) as Array<{ companyId?: string }>;
      const leak = listA.find(e => e.companyId === tenants.tenantB.companyId);
      if (leak) fail(name, "Tenant B companyId found in Tenant A evidence list");
      else pass(name);
    }
  }

  // ── 11. Metric-row upload creates linked evidence via /api/data-entry ─────
  let metricRowEvidenceId = "";
  let metricValueId = "";
  let secondMetricRowEvidenceId = "";
  {
    const name = "multipart metric-row upload stores evidence linked to metric value";
    const form = new FormData();
    form.append("metricId", firstMetric.id);
    form.append("period", rowUploadPeriod);
    form.append("value", "123.45");
    form.append("notes", "Metric row upload evidence test");
    form.append("dataSourceType", "manual");
    form.append("attachments", new Blob(["metric row evidence"], { type: "text/plain" }), "metric-row-evidence.txt");

    const res = await apiMultipartRequest("POST", "/api/data-entry", form, tenantA.adminToken);
    if (![200, 201].includes(res.status)) {
      fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    } else {
      const body = JSON.parse(res.body) as {
        id?: string;
        metricId?: string;
        attachmentMode?: string;
        attachments?: Array<{ id?: string; linkedEntityId?: string; linkedPeriod?: string; filename?: string }>;
        newlyCreatedAttachments?: Array<{ id?: string; linkedEntityId?: string; linkedPeriod?: string; filename?: string }>;
      };
      metricValueId = body.id || "";
      metricRowEvidenceId = body.newlyCreatedAttachments?.[0]?.id || "";
      const attachment = body.newlyCreatedAttachments?.[0];
      if (!metricValueId || !metricRowEvidenceId || body.metricId !== firstMetric.id || body.attachmentMode !== "multiple" || attachment?.linkedEntityId !== metricValueId || attachment?.linkedPeriod !== rowUploadPeriod) {
        fail(name, `unexpected response ${res.body.slice(0, 400)}`);
      } else {
        pass(name, attachment.filename);
      }
    }
  }

  // ── 12. Same metric row accepts multiple attachments ──────────────────────
  {
    const name = "metric-row uploads append multiple attachments instead of replacing";
    const form = new FormData();
    form.append("metricId", firstMetric.id);
    form.append("period", rowUploadPeriod);
    form.append("value", "123.45");
    form.append("notes", "Metric row upload evidence test");
    form.append("attachments", new Blob(["metric row evidence two"], { type: "text/plain" }), "metric-row-evidence-2.txt");

    const res = await apiMultipartRequest("POST", "/api/data-entry", form, tenantA.adminToken);
    if (![200, 201].includes(res.status)) {
      fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    } else {
      const body = JSON.parse(res.body) as {
        id?: string;
        attachmentMode?: string;
        attachments?: Array<{ id?: string; filename?: string }>;
        newlyCreatedAttachments?: Array<{ id?: string; filename?: string }>;
      };
      secondMetricRowEvidenceId = body.newlyCreatedAttachments?.[0]?.id || "";
      if (body.id !== metricValueId || body.attachmentMode !== "multiple" || !secondMetricRowEvidenceId || secondMetricRowEvidenceId === metricRowEvidenceId || (body.attachments?.length || 0) < 2) {
        fail(name, `unexpected response ${res.body.slice(0, 300)}`);
      } else {
        pass(name, body.newlyCreatedAttachments?.[0]?.filename);
      }
    }
  }

  // ── 13. Data entry payload reloads evidence under the correct row ─────────
  {
    const name = "GET /api/data-entry returns uploaded evidence under the matching metric row";
    const res = await apiRequest("GET", `/api/data-entry/${rowUploadPeriod}`, undefined, tenantA.adminToken);
    if (res.status !== 200) {
      fail(name, `status=${res.status}`);
    } else {
      const body = JSON.parse(res.body) as { values?: Array<{ id: string; metricId: string; attachments?: Array<{ id: string }> }> };
      const row = body.values?.find((value) => value.id === metricValueId);
      if (!row) fail(name, `metricValueId=${metricValueId} missing`);
      else if (!row.attachments?.some((attachment) => attachment.id === metricRowEvidenceId) || !row.attachments?.some((attachment) => attachment.id === secondMetricRowEvidenceId)) fail(name, "expected both attachments under row");
      else pass(name);
    }
  }

  // ── 14. Evidence list exposes review context for metric-linked files ──────
  {
    const name = "GET /api/evidence returns metric context, company, period, and orphan=false for metric-linked evidence";
    const res = await apiRequest("GET", `/api/evidence?period=${encodeURIComponent(rowUploadPeriod)}`, undefined, tenantA.adminToken);
    if (res.status !== 200) {
      fail(name, `status=${res.status}`);
    } else {
      const list = JSON.parse(res.body) as Array<{
        id?: string;
        metricId?: string | null;
        metricName?: string | null;
        companyName?: string | null;
        resolvedLinkedPeriod?: string | null;
        isOrphaned?: boolean;
      }>;
      const found = list.find((item) => item.id === metricRowEvidenceId);
      if (!found) fail(name, `id=${metricRowEvidenceId} not found`);
      else if (found.metricId !== firstMetric.id || found.metricName !== firstMetric.name || found.resolvedLinkedPeriod !== rowUploadPeriod || !found.companyName || found.isOrphaned !== false) {
        fail(name, `unexpected payload ${JSON.stringify(found)}`);
      } else {
        pass(name, `${found.metricName} / ${found.resolvedLinkedPeriod}`);
      }
    }
  }

  // ── 15. Central upload rejects missing metric selection ───────────────────
  {
    const name = "central evidence upload requires metric selection";
    const form = new FormData();
    form.append("period", rowUploadPeriod);
    form.append("file", new Blob(["missing metric evidence"], { type: "text/plain" }), "missing-metric.txt");
    const res = await apiMultipartRequest("POST", "/api/evidence", form, tenantA.adminToken);
    if (res.status !== 400) fail(name, `status=${res.status} body=${res.body.slice(0, 160)}`);
    else pass(name);
  }

  {
    const name = "central evidence upload rejects cross-tenant metric linkage";
    const form = new FormData();
    form.append("metricId", tenants.tenantB.metricId);
    form.append("period", rowUploadPeriod);
    form.append("file", new Blob(["cross tenant evidence"], { type: "text/plain" }), "cross-tenant.txt");
    const res = await apiMultipartRequest("POST", "/api/evidence", form, tenantA.adminToken);
    if (res.status !== 404) fail(name, `status=${res.status} body=${res.body.slice(0, 160)}`);
    else pass(name);
  }

  {
    const name = "central evidence upload rejects invalid MIME";
    const form = new FormData();
    form.append("metricId", firstMetric.id);
    form.append("period", rowUploadPeriod);
    form.append("file", new Blob(["json pretending to be text"], { type: "application/json" }), "bad-mime.txt");
    const res = await apiMultipartRequest("POST", "/api/evidence", form, tenantA.adminToken);
    if (res.status !== 400) fail(name, `status=${res.status} body=${res.body.slice(0, 160)}`);
    else pass(name);
  }

  {
    const name = "central evidence upload rejects oversized file";
    const form = new FormData();
    form.append("metricId", firstMetric.id);
    form.append("period", rowUploadPeriod);
    form.append("file", new Blob([new Uint8Array(26 * 1024 * 1024)], { type: "text/plain" }), "too-large.txt");
    const res = await apiMultipartRequest("POST", "/api/evidence", form, tenantA.adminToken);
    if (res.status !== 400) fail(name, `status=${res.status} body=${res.body.slice(0, 160)}`);
    else pass(name);
  }

  // ── 16. Cross-company users cannot download another company's evidence ────
  {
    const name = "cross-company download is rejected";
    const res = await apiRequest("GET", `/api/evidence/${metricRowEvidenceId}/download`, undefined, tenants.tenantB.adminToken);
    if (res.status !== 404) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 17. Cross-company users cannot delete another company's evidence ──────
  {
    const name = "cross-company delete is rejected";
    const res = await apiRequest("DELETE", `/api/evidence/${metricRowEvidenceId}`, undefined, tenants.tenantB.adminToken);
    if (res.status !== 404) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 18. Owner company can delete evidence and row attachment disappears ───
  {
    const name = "deleting evidence removes it from list and metric row attachments";
    const deleteRes = await apiRequest("DELETE", `/api/evidence/${metricRowEvidenceId}`, undefined, tenantA.adminToken);
    if (deleteRes.status !== 200) {
      fail(name, `delete status=${deleteRes.status}`);
    } else {
      const listRes = await apiRequest("GET", `/api/evidence?period=${encodeURIComponent(rowUploadPeriod)}`, undefined, tenantA.adminToken);
      const dataEntryRes = await apiRequest("GET", `/api/data-entry/${rowUploadPeriod}`, undefined, tenantA.adminToken);
      if (listRes.status !== 200 || dataEntryRes.status !== 200) {
        fail(name, `follow-up statuses list=${listRes.status} dataEntry=${dataEntryRes.status}`);
      } else {
        const list = JSON.parse(listRes.body) as Array<{ id?: string }>;
        const dataEntry = JSON.parse(dataEntryRes.body) as { values?: Array<{ id: string; attachments?: Array<{ id: string }> }> };
        const row = dataEntry.values?.find((value) => value.id === metricValueId);
        if (list.some((item) => item.id === metricRowEvidenceId)) fail(name, "evidence still present in list");
        else if (row?.attachments?.some((attachment) => attachment.id === metricRowEvidenceId)) fail(name, "evidence still present under metric row");
        else if (!row?.attachments?.some((attachment) => attachment.id === secondMetricRowEvidenceId)) fail(name, "remaining attachment unexpectedly removed");
        else pass(name);
      }
    }
  }
}

(async () => {
  console.log("\n=== API Tests: Evidence Domain ===\n");
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
  console.log(`\n=== Evidence: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
