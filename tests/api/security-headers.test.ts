/**
 * API regression: security headers and browser hardening.
 *
 * Covers baseline app/API response headers, no-store cache behavior for
 * sensitive API responses, and production HSTS compatibility when enabled.
 *
 * Run: npx tsx tests/api/security-headers.test.ts
 */

import { apiRequestRaw, seedTestTenants } from "../fixtures/seed.js";
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

function header(headers: Headers, name: string): string {
  return headers.get(name) || "";
}

function assertBrowserHardeningHeaders(headers: Headers, context: string) {
  const csp = header(headers, "content-security-policy");
  assert(csp.includes("default-src 'self'"), `${context} missing default-src CSP: ${csp}`);
  assert(csp.includes("object-src 'none'"), `${context} missing object-src CSP: ${csp}`);
  assert(csp.includes("frame-ancestors 'none'"), `${context} missing frame-ancestors CSP: ${csp}`);

  assert(header(headers, "x-content-type-options").toLowerCase() === "nosniff", `${context} missing nosniff`);
  assert(header(headers, "x-frame-options").toUpperCase() === "DENY", `${context} missing frame denial`);
  assert(
    header(headers, "referrer-policy").toLowerCase() === "strict-origin-when-cross-origin",
    `${context} missing referrer policy`,
  );

  const permissions = header(headers, "permissions-policy").toLowerCase();
  for (const directive of ["camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()"]) {
    assert(permissions.includes(directive), `${context} missing Permissions-Policy directive ${directive}: ${permissions}`);
  }

  const hsts = header(headers, "strict-transport-security");
  if (process.env.EXPECT_HSTS === "true") {
    assert(hsts, `${context} missing production HSTS header`);
  }
  if (hsts) {
    assert(/max-age=\d+/i.test(hsts), `${context} malformed HSTS header: ${hsts}`);
    assert(/includesubdomains/i.test(hsts), `${context} HSTS missing includeSubDomains: ${hsts}`);
  }
}

function assertApiNoStore(headers: Headers, context: string) {
  const cacheControl = header(headers, "cache-control").toLowerCase();
  assert(cacheControl.includes("no-store"), `${context} missing API no-store cache control: ${cacheControl}`);
}

let seeded: SeededTenants;

async function main() {
  console.log("Security headers regression\n");
  seeded = await seedTestTenants();

  await check("unauthenticated API response carries browser hardening headers and no-store", async () => {
    const res = await apiRequestRaw("GET", "/api/auth/me");
    assert(res.status === 401, `expected unauthenticated /api/auth/me to return 401, got ${res.status}`);
    assertBrowserHardeningHeaders(res.headers, "GET /api/auth/me unauthenticated");
    assertApiNoStore(res.headers, "GET /api/auth/me unauthenticated");
  });

  await check("authenticated API response carries browser hardening headers and no-store", async () => {
    const res = await apiRequestRaw("GET", "/api/auth/me", undefined, seeded.tenantA.adminToken);
    assert(res.status === 200, `expected authenticated /api/auth/me to return 200, got ${res.status}`);
    assertBrowserHardeningHeaders(res.headers, "GET /api/auth/me authenticated");
    assertApiNoStore(res.headers, "GET /api/auth/me authenticated");
  });

  await check("API fallback responses keep safe browser hardening headers", async () => {
    const res = await apiRequestRaw("GET", `/api/not-a-real-route-${Date.now()}`);
    assert([200, 404].includes(res.status), `expected missing API route to return app fallback or 404, got ${res.status}`);
    assertBrowserHardeningHeaders(res.headers, "GET API fallback route");
    assertApiNoStore(res.headers, "GET API fallback route");
  });

  const failed = results.filter((r) => !r.passed);
  console.log(`\nSecurity headers: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
