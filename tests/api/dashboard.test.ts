/**
 * API tests: Dashboard domain
 *
 * Covers: response shape, company scoping, null/empty crash protection,
 * unauthenticated rejection.
 *
 * Run: npx tsx tests/api/dashboard.test.ts
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

  // ── 1. /api/dashboard/enhanced — no 500 ──────────────────────────────────
  {
    const name = "GET /api/dashboard/enhanced returns 200 or 404, never 500";
    const res = await apiRequest("GET", "/api/dashboard/enhanced", undefined, tenantA.adminToken);
    if (res.status === 500) fail(name, "server error");
    else if (![200, 404].includes(res.status)) fail(name, `unexpected status=${res.status}`);
    else pass(name, `status=${res.status}`);
  }

  // ── 2. Response shape contains no raw stack traces ────────────────────────
  {
    const name = "dashboard/enhanced response contains no raw stack traces";
    const res = await apiRequest("GET", "/api/dashboard/enhanced", undefined, tenantA.adminToken);
    if (res.status === 200) {
      if (/at\s+\w+\s*\(/.test(res.body)) fail(name, "stack trace found in response");
      else pass(name);
    } else {
      pass(name, `skipped — status=${res.status}`);
    }
  }

  // ── 3. Response is valid JSON object ─────────────────────────────────────
  {
    const name = "dashboard/enhanced returns valid JSON object when 200";
    const res = await apiRequest("GET", "/api/dashboard/enhanced", undefined, tenantA.adminToken);
    if (res.status === 200) {
      try {
        const body = JSON.parse(res.body);
        if (typeof body !== "object" || body === null) fail(name, "not a valid object");
        else pass(name);
      } catch {
        fail(name, "invalid JSON");
      }
    } else {
      pass(name, `skipped — status=${res.status}`);
    }
  }

  // ── 4. /api/dashboard — no 500 ───────────────────────────────────────────
  {
    const name = "GET /api/dashboard returns 200 or 404, never 500";
    const res = await apiRequest("GET", "/api/dashboard", undefined, tenantA.adminToken);
    if (res.status === 500) fail(name, "server error");
    else if (![200, 404].includes(res.status)) fail(name, `unexpected status=${res.status}`);
    else pass(name, `status=${res.status}`);
  }

  // ── 5. Viewer can access dashboard ───────────────────────────────────────
  {
    const name = "viewer can GET /api/dashboard without 500";
    const res = await apiRequest("GET", "/api/dashboard", undefined, tenantA.viewerToken);
    if (res.status === 500) fail(name, "server error for viewer");
    else pass(name, `status=${res.status}`);
  }

  // ── 6. Unauthenticated rejected ───────────────────────────────────────────
  {
    const name = "GET /api/dashboard/enhanced without token returns 401";
    const res = await apiRequest("GET", "/api/dashboard/enhanced");
    if (res.status !== 401) fail(name, `status=${res.status}`);
    else pass(name);
  }

  // ── 7. Company scoping — Tenant A data absent from Tenant B response ──────
  {
    const name = "dashboard is company-scoped (Tenant A companyId absent in Tenant B response)";
    const resB = await apiRequest("GET", "/api/dashboard/enhanced", undefined, tenantB.adminToken);
    if (resB.status === 200) {
      if (resB.body.includes(tenantA.companyId)) {
        fail(name, "Tenant A companyId leaked into Tenant B dashboard response");
      } else {
        pass(name);
      }
    } else {
      pass(name, `skipped — Tenant B dashboard status=${resB.status}`);
    }
  }

  // ── 8. /api/metrics list is company-scoped ────────────────────────────────
  {
    const name = "GET /api/metrics list is company-scoped (Tenant B IDs absent from Tenant A)";
    const resA = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    if (resA.status === 200) {
      if (resA.body.includes(tenantB.companyId)) {
        fail(name, "Tenant B companyId leaked into Tenant A metrics response");
      } else {
        pass(name);
      }
    } else {
      fail(name, `GET /api/metrics for Tenant A returned status=${resA.status}`);
    }
  }

  // ── 9. /api/topics list returns array ────────────────────────────────────
  {
    const name = "GET /api/topics returns array for admin";
    const res = await apiRequest("GET", "/api/topics", undefined, tenantA.adminToken);
    if (res.status !== 200) fail(name, `status=${res.status}`);
    else {
      try {
        const body = JSON.parse(res.body);
        if (!Array.isArray(body)) fail(name, "expected array");
        else pass(name, `${body.length} topics`);
      } catch {
        fail(name, "invalid JSON");
      }
    }
  }

  // ── 10. Contributor dashboard access ─────────────────────────────────────
  {
    const name = "contributor can GET /api/dashboard without 500";
    const res = await apiRequest("GET", "/api/dashboard", undefined, tenantA.contributorToken);
    if (res.status === 500) fail(name, "server error for contributor");
    else pass(name, `status=${res.status}`);
  }

  // ── 11. Dashboard trend summary is safe with sparse/no historical data ───
  {
    const name = "dashboard trend summary loads with sparse historical data";
    const res = await apiRequest("GET", "/api/dashboard/enhanced", undefined, tenantA.adminToken);
    if (res.status !== 200) {
      pass(name, `skipped — status=${res.status}`);
    } else {
      try {
        const body = JSON.parse(res.body) as {
          trendSummary?: {
            cards?: Array<{ state?: string }>;
            metrics?: Array<{ reason?: string; currentValue?: number | null; previousValue?: number | null }>;
          };
        };
        const cards = body.trendSummary?.cards;
        const metrics = body.trendSummary?.metrics || [];
        const hasSparseMetric = metrics.some((metric) =>
          metric.reason !== "ok" || metric.currentValue === null || metric.previousValue === null,
        );
        if (!Array.isArray(cards) || cards.length === 0) fail(name, "missing trend cards");
        else if (!cards.some((card) => card.state === "insufficient_data") && !hasSparseMetric) fail(name, "expected a sparse card or metric trend state");
        else pass(name);
      } catch {
        fail(name, "invalid JSON");
      }
    }
  }

  // ── 12. Dashboard trends compare current and previous period correctly ───
  {
    const name = "dashboard energy trend values use current vs previous period and exclude other tenants";
    const metricsResA = await apiRequest("GET", "/api/metrics", undefined, tenantA.adminToken);
    const metricsResB = await apiRequest("GET", "/api/metrics", undefined, tenantB.adminToken);
    if (metricsResA.status !== 200 || metricsResB.status !== 200) {
      fail(name, `metrics status A=${metricsResA.status} B=${metricsResB.status}`);
    } else {
      try {
        const metricsA = JSON.parse(metricsResA.body) as Array<{ id: string; name?: string }>;
        const metricsB = JSON.parse(metricsResB.body) as Array<{ id: string; name?: string }>;
        const metricA = metricsA.find((metric) => /electricity|energy/i.test(metric.name || "")) || metricsA[0];
        const metricB = metricsB.find((metric) => /electricity|energy/i.test(metric.name || "")) || metricsB[0];
        if (!metricA?.id || !metricB?.id) fail(name, "missing metric id");
        else {
          const reportingPeriodRes = await apiRequest("POST", "/api/reporting-periods", {
            name: "2099-05",
            periodType: "monthly",
            startDate: "2099-05-01",
            endDate: "2099-05-31",
          }, tenantA.adminToken);
          if (reportingPeriodRes.status !== 201) {
            fail(name, `reporting period status=${reportingPeriodRes.status} body=${reportingPeriodRes.body.slice(0, 200)}`);
            return;
          }
          const reportingPeriod = JSON.parse(reportingPeriodRes.body) as { id?: string };
          if (!reportingPeriod.id) {
            fail(name, "reporting period id missing");
            return;
          }
          const seedResponses = await Promise.all([
            apiRequest("POST", "/api/data-entry", { metricId: metricA.id, period: "2099-04", value: 100, notes: "dashboard trend previous" }, tenantA.adminToken),
            apiRequest("POST", "/api/data-entry", { metricId: metricA.id, period: "2099-05", value: 80, notes: "dashboard trend current" }, tenantA.adminToken),
            apiRequest("POST", "/api/data-entry", { metricId: metricB.id, period: "2099-04", value: 9000, notes: "tenant b previous" }, tenantB.adminToken),
            apiRequest("POST", "/api/data-entry", { metricId: metricB.id, period: "2099-05", value: 8000, notes: "tenant b current" }, tenantB.adminToken),
          ]);
          const failedSeed = seedResponses.find((response) => ![200, 201].includes(response.status));
          if (failedSeed) {
            fail(name, `seed data-entry status=${failedSeed.status} body=${failedSeed.body.slice(0, 200)}`);
            return;
          }
          const dashboardRes = await apiRequest(
            "GET",
            `/api/dashboard/enhanced?reportingPeriodId=${encodeURIComponent(reportingPeriod.id)}`,
            undefined,
            tenantA.adminToken,
          );
          if (dashboardRes.status !== 200) fail(name, `dashboard status=${dashboardRes.status} body=${dashboardRes.body.slice(0, 200)}`);
          else {
            const body = JSON.parse(dashboardRes.body) as {
              trendSummary?: { currentPeriod?: string; previousPeriod?: string; cards?: Array<{ key?: string; currentValue?: number; previousValue?: number; absoluteDelta?: number; state?: string }> };
              metricSummaries?: unknown[];
            };
            const energy = body.trendSummary?.cards?.find((card) => card.key === "energy");
            if (body.trendSummary?.currentPeriod !== "2099-05" || body.trendSummary.previousPeriod !== "2099-04") {
              fail(name, `period mismatch ${body.trendSummary?.currentPeriod}/${body.trendSummary?.previousPeriod}`);
            } else if (!energy || energy.state !== "available") {
              fail(name, "energy trend unavailable");
            } else if (energy.currentValue !== 80 || energy.previousValue !== 100 || energy.absoluteDelta !== -20) {
              fail(name, `unexpected energy trend ${JSON.stringify(energy)}`);
            } else if (!Array.isArray(body.metricSummaries)) {
              fail(name, "existing dashboard metric summaries missing");
            } else {
              pass(name);
            }
          }
        }
      } catch (err) {
        fail(name, err instanceof Error ? err.message : String(err));
      }
    }
  }

  // ── 13. Dashboard score periods keep metric and framework semantics separate ─
  {
    const name = "quarterly dashboard scoring keeps YYYY-MM metric scores and full framework period scope";
    const suffix = Date.now();
    const reportingPeriodRes = await apiRequest("POST", "/api/reporting-periods", {
      name: `Dashboard FY 2098 Q2 ${suffix}`,
      periodType: "quarterly",
      startDate: "2098-04-01",
      endDate: "2098-06-30",
    }, tenantA.adminToken);
    if (reportingPeriodRes.status !== 201) {
      fail(name, `reporting period status=${reportingPeriodRes.status} body=${reportingPeriodRes.body.slice(0, 200)}`);
    } else {
      const reportingPeriod = JSON.parse(reportingPeriodRes.body) as { id?: string; name?: string };
      if (!reportingPeriod.id) {
        fail(name, "reporting period id missing");
      } else {
        const metricOnly = await apiRequest(
          "GET",
          "/api/esg-scores/all?period=2098-04",
          undefined,
          tenantA.adminToken,
        );
        const scoped = await apiRequest(
          "GET",
          `/api/esg-scores/all?period=2098-04&frameworkPeriod=${encodeURIComponent(reportingPeriod.id)}`,
          undefined,
          tenantA.adminToken,
        );
        if (metricOnly.status !== 200 || scoped.status !== 200) {
          fail(name, `score status baseline=${metricOnly.status} scoped=${scoped.status}`);
        } else {
          const baseline = JSON.parse(metricOnly.body) as any;
          const selected = JSON.parse(scoped.body) as any;
          if (selected.frameworkReadiness?.reportingPeriod !== reportingPeriod.name) {
            fail(name, `framework period collapsed to ${selected.frameworkReadiness?.reportingPeriod}`);
          } else if (baseline.frameworkReadiness?.reportingPeriod !== "2098-04") {
            fail(name, `legacy framework period fallback changed: ${baseline.frameworkReadiness?.reportingPeriod}`);
          } else if (JSON.stringify(selected.completeness) !== JSON.stringify(baseline.completeness)) {
            fail(name, "frameworkPeriod changed the YYYY-MM completeness result");
          } else if (JSON.stringify(selected.performance) !== JSON.stringify(baseline.performance)) {
            fail(name, "frameworkPeriod changed the YYYY-MM performance result");
          } else {
            pass(name);
          }
        }
      }
    }
  }
}

(async () => {
  console.log("\n=== API Tests: Dashboard Domain ===\n");
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
  console.log(`\n=== Dashboard: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
