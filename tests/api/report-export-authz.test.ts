/**
 * API regression: report export authorization boundaries
 *
 * Covers standalone PDF/DOCX exports and JSON export-data preview permissions,
 * tenant isolation, and revoked credential rejection.
 *
 * Run: npx tsx tests/api/report-export-authz.test.ts
 */

import { inflateRawSync } from "zlib";
import { Client } from "pg";
import { apiRequest, apiRequestRaw, seedTestTenants } from "../fixtures/seed.js";
import type { SeededTenants } from "../fixtures/seed.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const TEST_PASSWORD = "Test1234!";

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

function parseJson<T>(res: { status: number; body: string }, context: string): T {
  assert(res.status >= 200 && res.status < 300, `${context} status=${res.status} body=${res.body.slice(0, 500)}`);
  return JSON.parse(res.body) as T;
}

function expectStatus(res: { status: number; body: string } | { status: number; body: Buffer }, expected: number | number[], context: string) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  const body = Buffer.isBuffer(res.body) ? res.body.toString("utf8") : res.body;
  assert(allowed.includes(res.status), `${context} expected=${allowed.join("/")} got=${res.status} body=${body.slice(0, 500)}`);
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function prepareTenantForExport(companyId: string) {
  await withDb(async (client) => {
    await client.query("UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1", [companyId]);
    await client.query("UPDATE metrics SET enabled = false WHERE company_id = $1", [companyId]);
  });
}

async function createMetric(token: string, name: string): Promise<string> {
  const res = await apiRequest("POST", "/api/metrics", {
    name,
    category: "environmental",
    unit: "kWh",
    enabled: true,
    metricType: "manual",
    direction: "higher_is_better",
    displayOrder: 9900,
  }, token);
  const body = parseJson<{ id?: string }>(res, "POST /api/metrics");
  assert(body.id, "metric id missing");
  return body.id;
}

async function createSite(token: string, name: string): Promise<string> {
  const res = await apiRequest("POST", "/api/sites", { name, type: "office", country: "United Kingdom" }, token);
  const body = parseJson<{ id?: string }>(res, "POST /api/sites");
  assert(body.id, "site id missing");
  return body.id;
}

async function saveMetricValue(opts: {
  token: string;
  metricId: string;
  period: string;
  value: number;
  siteId: string | null;
}) {
  const res = await apiRequest("POST", "/api/data-entry", {
    metricId: opts.metricId,
    period: opts.period,
    value: opts.value,
    notes: `report export authz value ${opts.value}`,
    dataSourceType: "manual",
    siteId: opts.siteId,
  }, opts.token);
  parseJson(res, "POST /api/data-entry");
}

async function rawRequest(opts: {
  method: string;
  path: string;
  body?: object;
  token?: string;
  headers?: Record<string, string>;
}) {
  const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (bodyStr) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(new URL(opts.path, BASE_URL), {
    method: opts.method,
    headers,
    body: bodyStr,
  });
  return {
    status: res.status,
    headers: res.headers,
    body: Buffer.from(await res.arrayBuffer()),
  };
}

class CookieSession {
  private cookie = "";
  private forwardedFor = `127.0.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
  token = "";

  async request(method: string, path: string, body?: object, opts: { bearer?: string; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = {
      "X-Forwarded-Proto": "https",
      "X-Forwarded-For": this.forwardedFor,
      ...(opts.headers ?? {}),
    };
    if (this.cookie) headers.Cookie = this.cookie;
    if (opts.bearer) headers.Authorization = `Bearer ${opts.bearer}`;
    let payload: string | undefined;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(new URL(path, BASE_URL), { method, headers, body: payload });
    this.captureCookie(res);
    return { status: res.status, headers: res.headers, body: await res.text() };
  }

  async login(email: string) {
    const res = await this.request("POST", "/api/auth/login", { email, password: TEST_PASSWORD });
    const body = parseJson<{ token?: string }>(res, `POST /api/auth/login (${email})`);
    assert(body.token, "login response missing token");
    this.token = body.token;
    return body.token;
  }

  async stepUp() {
    return this.request("POST", "/api/auth/step-up", { password: TEST_PASSWORD });
  }

  private captureCookie(res: Response) {
    const getSetCookie = (res.headers as any).getSetCookie?.bind(res.headers);
    const cookies: string[] = typeof getSetCookie === "function"
      ? getSetCookie()
      : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);
    const sessionCookie = cookies.find((cookie) => cookie.includes("connect.sid="));
    if (sessionCookie) this.cookie = sessionCookie.split(";")[0];
  }
}

function getZipEntry(buffer: Buffer, entryName: string): Buffer {
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }
  assert(eocdOffset >= 0, "ZIP end-of-central-directory not found");

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);

  for (let i = 0; i < totalEntries; i++) {
    assert(buffer.readUInt32LE(centralOffset) === 0x02014b50, "invalid ZIP central directory header");
    const compressionMethod = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const fileNameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(centralOffset + 42);
    const fileName = buffer.subarray(centralOffset + 46, centralOffset + 46 + fileNameLength).toString("utf8");

    if (fileName === entryName) {
      assert(buffer.readUInt32LE(localHeaderOffset) === 0x04034b50, `invalid ZIP local header for ${entryName}`);
      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      if (compressionMethod === 0) return compressed;
      if (compressionMethod === 8) return inflateRawSync(compressed);
      throw new Error(`unsupported ZIP compression method ${compressionMethod} for ${entryName}`);
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(`ZIP entry not found: ${entryName}`);
}

function docxText(buffer: Buffer): string {
  const xml = getZipEntry(buffer, "word/document.xml").toString("utf8");
  return xml
    .replace(/<w:tab\/>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function exportData(token: string, period: string, siteId: string | null | "__all__" = null) {
  const qs = new URLSearchParams({ period, siteId: siteId === null ? "null" : siteId });
  const res = await apiRequest("GET", `/api/reports/export-data/esg_metrics_summary?${qs.toString()}`, undefined, token);
  return parseJson<{ values?: Array<{ metricId: string; value: string | null }>; metrics?: Array<{ id: string; name: string }> }>(
    res,
    "GET /api/reports/export-data/esg_metrics_summary",
  );
}

async function exportReport(token: string, body: Record<string, unknown>) {
  return apiRequestRaw("POST", "/api/reports/export/esg_metrics_summary", body, token);
}

async function run(tenants: SeededTenants): Promise<void> {
  const { tenantA, tenantB } = tenants;
  const suffix = Date.now().toString();
  const period = "2099-12";
  const tenantAMetricName = `Tenant A Export Authz Sentinel ${suffix}`;
  const tenantBMetricName = `Tenant B Export Authz Sentinel ${suffix}`;

  await prepareTenantForExport(tenantA.companyId);
  await prepareTenantForExport(tenantB.companyId);

  const tenantAMetricId = await createMetric(tenantA.adminToken, tenantAMetricName);
  const tenantBMetricId = await createMetric(tenantB.adminToken, tenantBMetricName);
  const tenantBSiteId = await createSite(tenantB.adminToken, `Tenant B Export Authz Site ${suffix}`);
  await saveMetricValue({ token: tenantA.adminToken, metricId: tenantAMetricId, period, value: 123.45, siteId: null });
  await saveMetricValue({ token: tenantB.adminToken, metricId: tenantBMetricId, period, value: 9876.54, siteId: tenantBSiteId });

  await check("admin can export JSON, PDF, and DOCX without cross-tenant content leakage", async () => {
    const json = await exportData(tenantA.adminToken, period, null);
    assert((json.metrics ?? []).some((metric) => metric.id === tenantAMetricId), "Tenant A metric missing from JSON export data");
    assert(!(json.metrics ?? []).some((metric) => metric.id === tenantBMetricId || metric.name === tenantBMetricName), "Tenant B metric leaked into JSON export data");
    assert((json.values ?? []).some((value) => value.metricId === tenantAMetricId && Number(value.value) === 123.45), "Tenant A value missing from JSON export data");
    assert(!(json.values ?? []).some((value) => value.metricId === tenantBMetricId || Number(value.value) === 9876.54), "Tenant B value leaked into JSON export data");

    const pdf = await exportReport(tenantA.adminToken, { format: "pdf", period, siteId: "__org__" });
    const pdfType = pdf.headers.get("content-type") || "";
    expectStatus(pdf, 200, "admin PDF export");
    assert(pdfType.includes("application/pdf"), `unexpected PDF content-type ${pdfType}`);
    assert(pdf.body.length > 100, "PDF export body too small");

    const docx = await exportReport(tenantA.adminToken, { format: "docx", period, siteId: "__org__" });
    const docxType = docx.headers.get("content-type") || "";
    expectStatus(docx, 200, "admin DOCX export");
    assert(docxType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), `unexpected DOCX content-type ${docxType}`);
    const text = docxText(docx.body);
    assert(text.includes(tenantAMetricName), "Tenant A metric missing from DOCX export");
    assert(text.includes("123.45"), "Tenant A value missing from DOCX export");
    assert(!text.includes(tenantBMetricName), "Tenant B metric leaked into DOCX export");
    assert(!text.includes("9,876.54") && !text.includes("9876.54"), "Tenant B value leaked into DOCX export");
  });

  await check("viewer and contributor cannot access report export endpoints", async () => {
    const viewerJson = await apiRequest("GET", `/api/reports/export-data/esg_metrics_summary?period=${encodeURIComponent(period)}&siteId=null`, undefined, tenantA.viewerToken);
    expectStatus(viewerJson, 403, "viewer JSON export-data");
    const viewerPdf = await exportReport(tenantA.viewerToken, { format: "pdf", period, siteId: "__org__" });
    expectStatus(viewerPdf, 403, "viewer PDF export");

    const contributorJson = await apiRequest("GET", `/api/reports/export-data/esg_metrics_summary?period=${encodeURIComponent(period)}&siteId=null`, undefined, tenantA.contributorToken);
    expectStatus(contributorJson, 403, "contributor JSON export-data");
    const contributorPdf = await exportReport(tenantA.contributorToken, { format: "pdf", period, siteId: "__org__" });
    expectStatus(contributorPdf, 403, "contributor PDF export");
  });

  await check("cross-tenant site scope is rejected for JSON, PDF, and DOCX exports", async () => {
    const jsonQs = new URLSearchParams({ period, siteId: tenantBSiteId });
    const json = await apiRequest("GET", `/api/reports/export-data/esg_metrics_summary?${jsonQs.toString()}`, undefined, tenantA.adminToken);
    expectStatus(json, [403, 404], "cross-tenant JSON export-data");

    const pdf = await exportReport(tenantA.adminToken, { format: "pdf", period, siteId: tenantBSiteId });
    expectStatus(pdf, [403, 404], "cross-tenant PDF export");

    const docx = await exportReport(tenantA.adminToken, { format: "docx", period, siteId: tenantBSiteId });
    expectStatus(docx, [403, 404], "cross-tenant DOCX export");
  });

  await check("revoked user sessions cannot export", async () => {
    const session = new CookieSession();
    await session.login(tenantA.adminEmail);

    const before = await rawRequest({
      method: "GET",
      path: `/api/reports/export-data/esg_metrics_summary?period=${encodeURIComponent(period)}&siteId=null`,
      token: session.token,
    });
    expectStatus(before, 200, "session token export-data before logout");

    expectStatus(await session.request("POST", "/api/auth/logout", undefined, { bearer: session.token }), 200, "logout bearer token");

    const afterJson = await rawRequest({
      method: "GET",
      path: `/api/reports/export-data/esg_metrics_summary?period=${encodeURIComponent(period)}&siteId=null`,
      token: session.token,
    });
    expectStatus(afterJson, 401, "revoked session JSON export-data");

    const afterPdf = await rawRequest({
      method: "POST",
      path: "/api/reports/export/esg_metrics_summary",
      token: session.token,
      body: { format: "pdf", period, siteId: "__org__" },
    });
    expectStatus(afterPdf, 401, "revoked session PDF export");
  });

  await check("company API keys cannot authenticate report exports before or after revocation", async () => {
    const admin = new CookieSession();
    await admin.login(tenantA.adminEmail);
    parseJson(await admin.stepUp(), "POST /api/auth/step-up");
    const created = parseJson<{ id: string; key: string }>(
      await admin.request("POST", "/api/company/api-keys", {
        label: `Report export authz ${suffix}`,
        scopes: ["read:reports"],
      }),
      "POST /api/company/api-keys",
    );
    assert(created.id && created.key, "API key create response missing id/key");

    const bearerBefore = await rawRequest({
      method: "GET",
      path: `/api/reports/export-data/esg_metrics_summary?period=${encodeURIComponent(period)}&siteId=null`,
      token: created.key,
    });
    expectStatus(bearerBefore, 401, "API key as bearer export-data before revoke");

    const headerBefore = await rawRequest({
      method: "POST",
      path: "/api/reports/export/esg_metrics_summary",
      body: { format: "pdf", period, siteId: "__org__" },
      headers: { "X-Agent-API-Key": created.key },
    });
    expectStatus(headerBefore, 401, "API key header PDF export before revoke");

    expectStatus(await admin.request("DELETE", `/api/company/api-keys/${created.id}`), 200, "DELETE /api/company/api-keys/:id");

    const bearerAfter = await rawRequest({
      method: "GET",
      path: `/api/reports/export-data/esg_metrics_summary?period=${encodeURIComponent(period)}&siteId=null`,
      token: created.key,
    });
    expectStatus(bearerAfter, 401, "revoked API key as bearer export-data");

    const headerAfter = await rawRequest({
      method: "POST",
      path: "/api/reports/export/esg_metrics_summary",
      body: { format: "pdf", period, siteId: "__org__" },
      headers: { "X-Agent-API-Key": created.key },
    });
    expectStatus(headerAfter, 401, "revoked API key header PDF export");
  });

  await check("unsupported server-side CSV report export format is rejected", async () => {
    const csv = await exportReport(tenantA.adminToken, { format: "csv", period, siteId: "__org__" });
    expectStatus(csv, 400, "CSV standalone report export");
    assert(csv.body.toString("utf8").includes("Format must be pdf or docx"), `unexpected CSV rejection body ${csv.body.toString("utf8").slice(0, 300)}`);
  });
}

(async () => {
  console.log("\n=== API Regression: Report Export Authorization ===\n");
  try {
    const tenants = await seedTestTenants();
    await run(tenants);
  } catch (error: any) {
    fail("report export authorization setup", error?.message || String(error));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Report Export Authorization: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
