/**
 * API regression: XLSX parser remediation
 *
 * The production dependency on `xlsx` was removed. Spreadsheet import paths
 * should accept CSV/text only and reject XLS/XLSX formats without attempting
 * server-side spreadsheet parsing.
 *
 * Run: npx tsx tests/api/xlsx-import-remediation.test.ts
 */

import { Client } from "pg";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => Promise<string | void> | string | void) {
  try {
    const detail = await fn();
    pass(name, typeof detail === "string" ? detail : undefined);
  } catch (error: any) {
    fail(name, error?.message || String(error));
  }
}

function encoded(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

function parseJson<T>(res: { status: number; body: string }, context: string): T {
  assert(res.status >= 200 && res.status < 300, `${context} status=${res.status} body=${res.body.slice(0, 500)}`);
  return JSON.parse(res.body) as T;
}

function expectStatus(res: { status: number; body: string }, expected: number, context: string) {
  assert(res.status === expected, `${context} expected=${expected} got=${res.status} body=${res.body.slice(0, 500)}`);
}

async function makeTenantPro(companyId: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query("UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1", [companyId]);
  } finally {
    await client.end();
  }
}

async function main() {
  console.log("\n=== API Regression: XLSX Import Remediation ===\n");
  const { tenantA } = await seedTestTenants();
  await makeTenantPro(tenantA.companyId);

  await check("questionnaire CSV import still works", async () => {
    const res = await apiRequest("POST", "/api/questionnaires/import", {
      format: "csv",
      title: `CSV questionnaire ${Date.now()}`,
      content: encoded("question\nDo you track energy use?\nDo you have an ESG owner?\n"),
    }, tenantA.adminToken);
    const body = parseJson<{ totalQuestions?: number }>(res, "POST /api/questionnaires/import csv");
    assert(body.totalQuestions === 2, `expected 2 questions, got ${JSON.stringify(body)}`);
  });

  await check("questionnaire XLSX format is rejected safely", async () => {
    const res = await apiRequest("POST", "/api/questionnaires/import", {
      format: "xlsx",
      title: `XLSX questionnaire ${Date.now()}`,
      content: encoded("not a spreadsheet"),
    }, tenantA.adminToken);
    expectStatus(res, 400, "POST /api/questionnaires/import xlsx");
    assert(res.body.includes("Format must be text or csv"), `unexpected body ${res.body.slice(0, 200)}`);
    assert(!/stack|xlsx|prototype|pollution/i.test(res.body), `unsafe error detail leaked ${res.body.slice(0, 200)}`);
  });

  await check("raw-data CSV parse still works", async () => {
    const res = await apiRequest("POST", "/api/raw-data/import/parse", {
      format: "csv",
      content: encoded("electricity_kwh,gas_kwh\n123.45,67.89\n"),
    }, tenantA.adminToken);
    const body = parseJson<{ columns?: string[]; rows?: Array<Record<string, string>> }>(res, "POST /api/raw-data/import/parse csv");
    assert(body.columns?.includes("electricity_kwh"), `columns missing electricity_kwh ${JSON.stringify(body)}`);
    assert(body.rows?.[0]?.electricity_kwh === "123.45", `row value mismatch ${JSON.stringify(body)}`);
  });

  await check("raw-data XLSX format is rejected safely", async () => {
    const res = await apiRequest("POST", "/api/raw-data/import/parse", {
      format: "xlsx",
      content: encoded("not a spreadsheet"),
    }, tenantA.adminToken);
    expectStatus(res, 400, "POST /api/raw-data/import/parse xlsx");
    assert(res.body.includes("Format must be csv"), `unexpected body ${res.body.slice(0, 200)}`);
    assert(!/stack|xlsx|prototype|pollution/i.test(res.body), `unsafe error detail leaked ${res.body.slice(0, 200)}`);
  });

  const failed = results.filter(r => !r.passed);
  console.log(`\n=== XLSX Import Remediation: ${results.length - failed.length}/${results.length} passed ===\n`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
