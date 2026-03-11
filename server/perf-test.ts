import { db } from "./storage";
import { sql } from "drizzle-orm";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

interface TimingResult {
  workflow: string;
  runs: number[];
  avg: number;
  p95: number;
  worst: number;
  best: number;
}

async function timeRequest(url: string, options?: RequestInit): Promise<number> {
  const start = performance.now();
  const res = await fetch(url, options);
  const elapsed = performance.now() - start;
  if (!res.ok && res.status !== 401) {
    const body = await res.text().catch(() => "");
    console.warn(`  WARN: ${url} returned ${res.status}: ${body.slice(0, 100)}`);
  }
  await res.text().catch(() => {});
  return elapsed;
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

function calcStats(runs: number[]): { avg: number; p95: number; worst: number; best: number } {
  const sorted = [...runs].sort((a, b) => a - b);
  const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
  const p95Index = Math.ceil(sorted.length * 0.95) - 1;
  return {
    avg: Math.round(avg * 100) / 100,
    p95: Math.round(sorted[Math.min(p95Index, sorted.length - 1)] * 100) / 100,
    worst: Math.round(sorted[sorted.length - 1] * 100) / 100,
    best: Math.round(sorted[0] * 100) / 100,
  };
}

async function runWorkflow(
  name: string,
  fn: () => Promise<number>,
  iterations = 5
): Promise<TimingResult> {
  const runs: number[] = [];
  for (let i = 0; i < iterations; i++) {
    runs.push(await fn());
  }
  const stats = calcStats(runs);
  return { workflow: name, runs, ...stats };
}

async function testQueryPerformance(): Promise<TimingResult[]> {
  const results: TimingResult[] = [];

  const queries: Array<{ name: string; query: any }> = [
    {
      name: "DB: Count companies",
      query: sql`SELECT COUNT(*) FROM companies`,
    },
    {
      name: "DB: Dashboard metrics aggregation",
      query: sql`SELECT m.category, COUNT(*) as count, AVG(CAST(mv.value AS FLOAT)) as avg_val FROM metrics m JOIN metric_values mv ON m.id = mv.metric_id WHERE m.company_id = (SELECT id FROM companies LIMIT 1) GROUP BY m.category`,
    },
    {
      name: "DB: Raw data by company+period",
      query: sql`SELECT * FROM raw_data_inputs WHERE company_id = (SELECT id FROM companies LIMIT 1) ORDER BY created_at DESC LIMIT 100`,
    },
    {
      name: "DB: Notifications unread",
      query: sql`SELECT * FROM notifications WHERE company_id = (SELECT id FROM companies LIMIT 1) AND dismissed = false ORDER BY created_at DESC LIMIT 50`,
    },
    {
      name: "DB: Audit logs recent",
      query: sql`SELECT * FROM audit_logs WHERE company_id = (SELECT id FROM companies LIMIT 1) ORDER BY created_at DESC LIMIT 100`,
    },
    {
      name: "DB: Background jobs status",
      query: sql`SELECT status, COUNT(*) FROM background_jobs GROUP BY status`,
    },
    {
      name: "DB: User activity analytics",
      query: sql`SELECT action, COUNT(*) FROM user_activity WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY action`,
    },
    {
      name: "DB: Evidence files by company",
      query: sql`SELECT * FROM evidence_files WHERE company_id = (SELECT id FROM companies LIMIT 1) ORDER BY uploaded_at DESC LIMIT 50`,
    },
  ];

  for (const q of queries) {
    const result = await runWorkflow(q.name, async () => {
      const start = performance.now();
      await db.execute(q.query);
      return performance.now() - start;
    }, 5);
    results.push(result);
  }

  return results;
}

export async function runPerformanceTests(authToken?: string) {
  console.log("\n=== Performance Test Suite ===\n");

  let token = authToken;
  if (!token) {
    try {
      token = await login("demo@example.com", "password123");
      console.log("Authenticated as demo user\n");
    } catch {
      console.log("Could not authenticate with demo user, testing unauthenticated endpoints only\n");
    }
  }

  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };

  const results: TimingResult[] = [];

  const apiWorkflows: Array<{ name: string; url: string; method?: string; body?: any }> = [
    { name: "API: Dashboard load", url: "/api/dashboard/enhanced" },
    { name: "API: Control centre", url: "/api/control-centre" },
    { name: "API: Data entry", url: "/api/data-entry" },
    { name: "API: Compliance status", url: "/api/compliance/status" },
    { name: "API: Analytics", url: "/api/admin/analytics" },
    { name: "API: Metrics list", url: "/api/metrics" },
    { name: "API: Notifications", url: "/api/notifications" },
    { name: "API: Evidence files", url: "/api/evidence" },
    { name: "API: Questionnaires", url: "/api/questionnaires" },
    { name: "API: Reports list", url: "/api/reports" },
    { name: "API: Audit logs", url: "/api/audit-logs" },
    { name: "API: Benchmarks", url: "/api/benchmarks" },
    { name: "API: Benchmarks comparison", url: "/api/benchmarks/comparison" },
    { name: "API: Admin health", url: "/api/admin/health" },
    { name: "API: Admin health events", url: "/api/admin/health/events" },
    { name: "API: Raw data", url: "/api/raw-data" },
  ];

  console.log("--- API Endpoint Tests ---\n");
  for (const wf of apiWorkflows) {
    const result = await runWorkflow(wf.name, async () => {
      return timeRequest(`${BASE_URL}${wf.url}`, {
        method: wf.method || "GET",
        headers: authHeaders,
        body: wf.body ? JSON.stringify(wf.body) : undefined,
      });
    }, 5);
    results.push(result);
    const status = result.avg > 2000 ? "SLOW" : result.avg > 500 ? "WARN" : "OK";
    console.log(`  [${status}] ${result.workflow}: avg=${result.avg}ms p95=${result.p95}ms worst=${result.worst}ms`);
  }

  console.log("\n--- Database Query Tests ---\n");
  const dbResults = await testQueryPerformance();
  for (const r of dbResults) {
    results.push(r);
    const status = r.avg > 100 ? "SLOW" : r.avg > 50 ? "WARN" : "OK";
    console.log(`  [${status}] ${r.workflow}: avg=${r.avg}ms p95=${r.p95}ms worst=${r.worst}ms`);
  }

  console.log("\n\n=== PERFORMANCE SUMMARY ===\n");

  const slowRoutes = results.filter(r => r.avg > 500).sort((a, b) => b.avg - a.avg);
  if (slowRoutes.length > 0) {
    console.log("SLOW (>500ms avg):");
    for (const r of slowRoutes) {
      console.log(`  ${r.workflow}: avg=${r.avg}ms p95=${r.p95}ms worst=${r.worst}ms`);
    }
  }

  const warnRoutes = results.filter(r => r.avg > 200 && r.avg <= 500).sort((a, b) => b.avg - a.avg);
  if (warnRoutes.length > 0) {
    console.log("\nWARN (200-500ms avg):");
    for (const r of warnRoutes) {
      console.log(`  ${r.workflow}: avg=${r.avg}ms p95=${r.p95}ms worst=${r.worst}ms`);
    }
  }

  const okRoutes = results.filter(r => r.avg <= 200);
  console.log(`\nOK (<=200ms): ${okRoutes.length} workflows`);
  console.log(`Total workflows tested: ${results.length}`);
  console.log(`Slowest overall: ${results.sort((a, b) => b.worst - a.worst)[0]?.workflow} (${results[0]?.worst}ms worst)`);

  return results;
}

const isDirectRun = process.argv[1]?.includes("perf-test");
if (isDirectRun) {
  runPerformanceTests()
    .then(results => {
      console.log("\nDone. Tested", results.length, "workflows.");
      process.exit(0);
    })
    .catch(e => {
      console.error("Perf test failed:", e);
      process.exit(1);
    });
}
