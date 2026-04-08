/**
 * API tests: Metrics domain
 *
 * Covers: valid create (data-entry), validation failure, company scoping,
 * persistence (submit then retrieve), and target setting.
 *
 * Run: npx tsx tests/api/metrics.test.ts
 */

import { seedTestTenants, apiRequest } from "../fixtures/seed.js";
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
  const { tenantA, tenantB } = tenants;
  const PERIOD = "2024-Q1";
  const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

  async function uploadMetricValueWithAttachment(opts: {
    token: string;
    metricId: string;
    period: string;
    value: string;
    notes?: string;
    filename: string;
    fileBody?: string;
    fileType?: string;
  }) {
    const form = new FormData();
    form.append("metricId", opts.metricId);
    form.append("period", opts.period);
    form.append("value", opts.value);
    form.append("notes", opts.notes || "");
    form.append("dataSourceType", "evidenced");
    form.append("attachments", new Blob([opts.fileBody || "test evidence body"], { type: opts.fileType || "text/plain" }), opts.filename);

    return fetch(`${BASE_URL}/api/data-entry`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.token}`,
      },
      body: form,
    });
  }

  // ── 1. GET /api/metrics returns array ────────────────────────────────────
  {
    const name = "GET /api/metrics returns 200 array for admin";
    const res = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      const body = JSON.parse(res.body);
      if (!Array.isArray(body) || body.length === 0) fail(name, "empty or non-array");
      else pass(name, `${body.length} metrics`);
    }
  }

  // ── 2. Contributor can list metrics ──────────────────────────────────────
  {
    const name = "contributor can GET /api/metrics";
    const res = await apiRequest("GET", "/api/metrics", undefined, tenantA.contributorToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 3. Valid data-entry creates record ────────────────────────────────────
  let createdEntryId: string | null = null;
  let testMetricId: string | null = null;
  {
    const name = "POST /api/data-entry with valid payload returns 200/201 with id";
    const metricRes = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    const metrics = JSON.parse(metricRes.body) as Array<{ id: string }>;
    testMetricId = metrics[0]?.id ?? null;
    if (!testMetricId) { fail(name, "no metric id available"); }
    else {
      const res = await apiRequest("POST", "/api/data-entry", {
        metricId: testMetricId,
        period: PERIOD,
        value: 42.5,
        notes: "API test entry",
      }, tenantA.adminToken);
      if (![200, 201].includes(res.status)) fail(name, `status=${res.status} body=${res.body.slice(0,200)}`);
      else {
        const body = JSON.parse(res.body) as { id?: string };
        if (!body.id) fail(name, "missing id in response");
        else {
          createdEntryId = body.id;
          pass(name, `id=${body.id}`);
        }
      }
    }
  }

  // ── 4. Submitted value is retrievable ────────────────────────────────────
  {
    const name = "submitted metric value is retrievable via /api/metrics/:id/values";
    if (!testMetricId) {
      fail(name, "skipped — no metricId");
    } else {
      const res = await apiRequest("GET", `/api/metrics/${testMetricId}/values`, undefined, tenantA.adminToken);
      if (res.status !== 200) fail(name, `status=${res.status}`);
      else {
        const values = JSON.parse(res.body) as Array<{ period: string }>;
        const found = values.find(v => v.period === PERIOD);
        if (!found) fail(name, `period ${PERIOD} not found in values`);
        else pass(name);
      }
    }
  }

  // ── 4b. Multipart metric save can attach evidence ───────────────────────
  let multipartMetricValueId: string | null = null;
  let firstEvidenceId: string | null = null;
  let firstEvidenceUrl: string | null = null;
  let survivingEvidenceUrl: string | null = null;
  {
    const name = "POST /api/data-entry multipart persists evidence attachments for a metric value";
    if (!testMetricId) {
      fail(name, "skipped — no metricId");
    } else {
      const saveRes = await uploadMetricValueWithAttachment({
        token: tenantA.adminToken,
        metricId: testMetricId,
        period: "2024-Q2",
        value: "51.25",
        notes: "Multipart evidence upload test",
        filename: "metric-evidence.txt",
      });

      if (![200, 201].includes(saveRes.status)) {
        fail(name, `save status=${saveRes.status}`);
      } else {
        const saved = await saveRes.json() as { id?: string; attachments?: Array<{ id?: string; filename?: string; fileUrl?: string | null }> };
        if (!saved.id) {
          fail(name, "missing metric value id");
        } else if (!saved.attachments?.length) {
          fail(name, "missing attachment metadata in save response");
        } else {
          multipartMetricValueId = saved.id;
          firstEvidenceId = saved.attachments[0]?.id || null;
          firstEvidenceUrl = saved.attachments[0]?.fileUrl || null;
          const evidenceRes = await apiRequest("GET", `/api/evidence/entity/metric_value/${saved.id}`, undefined, tenantA.adminToken);
          if (evidenceRes.status !== 200) {
            fail(name, `evidence fetch status=${evidenceRes.status}`);
          } else {
            const evidence = JSON.parse(evidenceRes.body) as Array<{ filename?: string; fileUrl?: string | null }>;
            const linked = evidence.find((file) => file.filename === "metric-evidence.txt");
            if (!linked) fail(name, "uploaded evidence not linked to metric value");
            else if (!linked.fileUrl) fail(name, "missing stable download URL");
            else pass(name, `metricValueId=${saved.id}`);
          }
        }
      }
    }
  }

  // ── 4c. Failed multipart save does not leave partial metric state ───────
  {
    const name = "multipart metric save rolls back the metric value when attachment validation fails";
    if (!testMetricId) {
      fail(name, "skipped — no metricId");
    } else {
      const failedSave = await uploadMetricValueWithAttachment({
        token: tenantA.adminToken,
        metricId: testMetricId,
        period: "2024-Q3",
        value: "61.00",
        notes: "Should fail",
        filename: "blocked-script.sh",
      });

      if (failedSave.status !== 500 && failedSave.status !== 400) {
        fail(name, `expected failure status, got ${failedSave.status}`);
      } else {
        const valuesRes = await apiRequest("GET", `/api/metrics/${testMetricId}/values`, undefined, tenantA.adminToken);
        if (valuesRes.status !== 200) {
          fail(name, `values status=${valuesRes.status}`);
        } else {
          const values = JSON.parse(valuesRes.body) as Array<{ period: string }>;
          const leaked = values.find((row) => row.period === "2024-Q3");
          if (leaked) fail(name, "metric value persisted despite attachment failure");
          else pass(name);
        }
      }
    }
  }

  // ── 4d. Attachment metadata is present on normal reload path ─────────────
  {
    const name = "GET /api/data-entry/:period includes attachment metadata on reload";
    const period = "2024-Q2";
    if (!multipartMetricValueId) {
      fail(name, "skipped — no multipart metric value id");
    } else {
      const reloadRes = await apiRequest("GET", `/api/data-entry/${period}`, undefined, tenantA.adminToken);
      if (reloadRes.status !== 200) {
        fail(name, `status=${reloadRes.status}`);
      } else {
        const body = JSON.parse(reloadRes.body) as { values?: Array<{ id: string; attachments?: Array<{ id?: string; filename?: string }> }> };
        const row = body.values?.find((value) => value.id === multipartMetricValueId);
        if (!row) fail(name, "metric value missing from reload response");
        else if (!row.attachments?.some((attachment) => attachment.filename === "metric-evidence.txt")) fail(name, "attachments missing from reload response");
        else pass(name);
      }
    }
  }

  // ── 4e. Repeated multipart save appends evidence, delete removes one ─────
  {
    const name = "repeat multipart save appends evidence and delete removes only the targeted attachment";
    if (!testMetricId || !multipartMetricValueId || !firstEvidenceId) {
      fail(name, "skipped — missing multipart setup");
    } else {
      const appendRes = await uploadMetricValueWithAttachment({
        token: tenantA.adminToken,
        metricId: testMetricId,
        period: "2024-Q2",
        value: "52.00",
        notes: "Second attachment",
        filename: "metric-evidence-2.txt",
      });

      if (![200, 201].includes(appendRes.status)) {
        fail(name, `append status=${appendRes.status}`);
      } else {
        const evidenceBeforeDeleteRes = await apiRequest("GET", `/api/evidence/entity/metric_value/${multipartMetricValueId}`, undefined, tenantA.adminToken);
        if (evidenceBeforeDeleteRes.status !== 200) {
          fail(name, `evidence status=${evidenceBeforeDeleteRes.status}`);
        } else {
          const beforeDelete = JSON.parse(evidenceBeforeDeleteRes.body) as Array<{ id: string; filename: string; fileUrl?: string | null }>;
          const second = beforeDelete.find((file) => file.filename === "metric-evidence-2.txt");
          if (beforeDelete.length < 2 || !second) {
            fail(name, "append did not create a second attachment");
          } else {
            survivingEvidenceUrl = second.fileUrl || null;
            const deleteRes = await apiRequest("DELETE", `/api/evidence/${firstEvidenceId}`, undefined, tenantA.adminToken);
            if (deleteRes.status !== 200) {
              fail(name, `delete status=${deleteRes.status}`);
            } else {
              const evidenceAfterDeleteRes = await apiRequest("GET", `/api/evidence/entity/metric_value/${multipartMetricValueId}`, undefined, tenantA.adminToken);
              if (evidenceAfterDeleteRes.status !== 200) {
                fail(name, `after delete status=${evidenceAfterDeleteRes.status}`);
              } else {
                const afterDelete = JSON.parse(evidenceAfterDeleteRes.body) as Array<{ id: string; filename: string; fileUrl?: string | null }>;
                const removedStillPresent = afterDelete.some((file) => file.id === firstEvidenceId);
                const secondStillPresent = afterDelete.some((file) => file.id === second.id);
                if (removedStillPresent) fail(name, "deleted attachment still returned");
                else if (!secondStillPresent) fail(name, "delete removed surviving attachment");
                else pass(name);
              }
            }
          }
        }
      }
    }
  }

  // ── 4f. Download endpoint is tenant-scoped and readable in-tenant ────────
  {
    const name = "download endpoint allows same-tenant access and blocks cross-tenant access";
    const downloadUrl = survivingEvidenceUrl || firstEvidenceUrl;
    if (!downloadUrl) {
      fail(name, "skipped — missing evidence download url");
    } else {
      const ownRes = await fetch(`${BASE_URL}${downloadUrl}`, {
        headers: { Authorization: `Bearer ${tenantA.viewerToken}` },
      });
      const crossTenantRes = await fetch(`${BASE_URL}${downloadUrl}`, {
        headers: { Authorization: `Bearer ${tenantB.adminToken}` },
      });

      if (ownRes.status !== 200) fail(name, `same-tenant status=${ownRes.status}`);
      else if (crossTenantRes.status !== 404) fail(name, `cross-tenant status=${crossTenantRes.status}`);
      else pass(name);
    }
  }

  // ── 5. Validation: missing period → 400 ──────────────────────────────────
  {
    const name = "POST /api/data-entry without period returns 400";
    if (!testMetricId) { fail(name, "skipped — no metricId"); }
    else {
      const res = await apiRequest("POST", "/api/data-entry", {
        metricId: testMetricId,
        value: 1,
      }, tenantA.adminToken);
      if (res.status !== 400) fail(name, `status=${res.status}`);
      else {
        const body = JSON.parse(res.body) as { error?: string };
        if (!body.error) fail(name, "missing error field");
        else pass(name);
      }
    }
  }

  // ── 6. Validation: non-numeric value → 400 ───────────────────────────────
  {
    const name = "POST /api/data-entry with non-numeric value returns 400";
    if (!testMetricId) { fail(name, "skipped — no metricId"); }
    else {
      const res = await apiRequest("POST", "/api/data-entry", {
        metricId: testMetricId,
        period: PERIOD,
        value: "not-a-number",
      }, tenantA.adminToken);
      if (res.status !== 400) fail(name, `status=${res.status}`);
      else pass(name);
    }
  }

  // ── 7. Cross-company scoping: Tenant A cannot read Tenant B metric values ─
  {
    const name = "Tenant A cannot GET Tenant B metric values (403 or 404)";
    const res = await apiRequest("GET", `/api/metrics/${tenantB.metricId}/values`, undefined, tenantA.adminToken);
    if (![403, 404].includes(res.status)) fail(name, `expected 403/404 got ${res.status}`);
    else pass(name, `status=${res.status}`);
  }

  // ── 8. Viewer can read own-company metric values ──────────────────────────
  {
    const name = "viewer can GET /api/metrics/:id/values for own company";
    if (!testMetricId) { fail(name, "skipped — no metricId"); }
    else {
      const res = await apiRequest("GET", `/api/metrics/${testMetricId}/values`, undefined, tenantA.viewerToken);
      if (res.status !== 200) fail(name, `status=${res.status}`);
      else pass(name);
    }
  }

  // ── 9. Admin can set metric target ────────────────────────────────────────
  {
    const name = "admin can PUT /api/metrics/:id/target (200)";
    if (!testMetricId) { fail(name, "skipped — no metricId"); }
    else {
      const res = await apiRequest("PUT", `/api/metrics/${testMetricId}/target`, {
        targetValue: 100,
        targetYear: 2025,
        targetType: "reduction",
      }, tenantA.adminToken);
      if (res.status >= 500) fail(name, `server error status=${res.status}`);
      else if (![200, 201].includes(res.status)) fail(name, `status=${res.status} body=${res.body.slice(0,200)}`);
      else pass(name);
    }
  }

  // ── 10. Contributor blocked from target setting ───────────────────────────
  {
    const name = "contributor PUT /api/metrics/:id/target returns 403";
    if (!testMetricId) { fail(name, "skipped — no metricId"); }
    else {
      const res = await apiRequest("PUT", `/api/metrics/${testMetricId}/target`, {
        targetValue: 50,
        targetYear: 2025,
        targetType: "absolute",
      }, tenantA.contributorToken);
      if (res.status !== 403) fail(name, `status=${res.status}`);
      else pass(name);
    }
  }

  // ── 11. Unauthenticated blocked ───────────────────────────────────────────
  {
    const name = "POST /api/data-entry without token returns 401";
    if (!testMetricId) { fail(name, "skipped — no metricId"); }
    else {
      const res = await apiRequest("POST", "/api/data-entry", {
        metricId: testMetricId,
        period: PERIOD,
        value: 1,
      });
      if (res.status !== 401) fail(name, `status=${res.status}`);
      else pass(name);
    }
  }

  // ── 12. Custom metric appears in active metric and data-entry views ──────
  {
    const name = "POST /api/metrics creates a custom manual metric that appears in Metrics and Enter Data";
    const customName = `QA Custom Metric ${Date.now()}`;
    const createRes = await apiRequest("POST", "/api/metrics", {
      name: customName,
      description: "Custom manual metric created from Metrics Library flow",
      category: "environmental",
      unit: "kg",
      frequency: "monthly",
      dataOwner: "QA Owner",
    }, tenantA.adminToken);

    if (![200, 201].includes(createRes.status)) {
      fail(name, `create status=${createRes.status} body=${createRes.body.slice(0, 200)}`);
    } else {
      const metricsRes = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
      const metrics = JSON.parse(metricsRes.body) as Array<{ name: string; enabled: boolean }>;
      const inMetrics = metrics.some((metric) => metric.name === customName && metric.enabled);

      const dataEntryRes = await apiRequest("GET", "/api/data-entry/2024-01", undefined, tenantA.adminToken);
      const dataEntry = JSON.parse(dataEntryRes.body) as { metrics: Array<{ name: string }> };
      const inDataEntry = dataEntry.metrics.some((metric) => metric.name === customName);

      if (!inMetrics) fail(name, "created metric missing from /api/metrics enabled view");
      else if (!inDataEntry) fail(name, "created metric missing from /api/data-entry enabled metrics");
      else pass(name);
    }
  }
}

(async () => {
  console.log("\n=== API Tests: Metrics Domain ===\n");
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
  console.log(`\n=== Metrics: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
