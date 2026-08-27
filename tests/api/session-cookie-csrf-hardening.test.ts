/**
 * API regression: session, cookie, and CSRF hardening.
 *
 * Covers cookie attributes, session-id rotation after authentication and
 * step-up, logout invalidation, and origin checks for cookie-authenticated
 * state-changing requests.
 *
 * Run: npx tsx tests/api/session-cookie-csrf-hardening.test.ts
 */

import { apiRequest, seedTestTenants } from "../fixtures/seed.js";
import type { SeededTenants } from "../fixtures/seed.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const TEST_PASSWORD = "Test1234!";

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

function parseJson<T>(res: { status: number; body: string }, context: string): T {
  assert(res.status >= 200 && res.status < 300, `${context} status=${res.status} body=${res.body.slice(0, 500)}`);
  return JSON.parse(res.body) as T;
}

function parseAnyJson<T = any>(res: { body: string }, context: string): T {
  try {
    return JSON.parse(res.body) as T;
  } catch {
    throw new Error(`${context} returned non-JSON body=${res.body.slice(0, 200)}`);
  }
}

function expectStatus(res: { status: number; body: string }, expected: number | number[], context: string) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  assert(allowed.includes(res.status), `${context} expected=${allowed.join("/")} got=${res.status} body=${res.body.slice(0, 500)}`);
}

function getSetCookies(headers: Headers): string[] {
  const getter = (headers as any).getSetCookie?.bind(headers);
  if (typeof getter === "function") return getter();
  const cookie = headers.get("set-cookie");
  return cookie ? [cookie] : [];
}

function getSessionCookie(headers: Headers): string | null {
  return getSetCookies(headers).find((cookie) => cookie.includes("connect.sid=")) ?? null;
}

class CookieSession {
  cookie = "";
  token = "";
  lastSetCookie = "";
  private forwardedFor = `127.0.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;

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

  async login(email: string, password = TEST_PASSWORD) {
    const res = await this.request("POST", "/api/auth/login", { email, password });
    const body = parseJson<{ token?: string }>(res, `POST /api/auth/login (${email})`);
    assert(body.token, "login response missing token");
    this.token = body.token;
    return res;
  }

  private captureCookie(res: Response) {
    const setCookie = getSessionCookie(res.headers);
    if (!setCookie) return;
    this.lastSetCookie = setCookie;
    this.cookie = setCookie.split(";")[0];
  }
}

let seeded: SeededTenants;

async function main() {
  console.log("Session/cookie/CSRF hardening regression\n");
  seeded = await seedTestTenants();

  await check("login sets HttpOnly and explicit SameSite session cookie", async () => {
    const session = new CookieSession();
    const res = await session.login(seeded.tenantA.adminEmail);
    const cookie = getSessionCookie(res.headers);
    assert(cookie, "login response did not set connect.sid");
    assert(/;\s*HttpOnly/i.test(cookie), `cookie missing HttpOnly: ${cookie}`);
    assert(/;\s*SameSite=(Lax|Strict|None)/i.test(cookie), `cookie missing SameSite: ${cookie}`);
    if (/;\s*Secure/i.test(cookie)) {
      assert(/;\s*SameSite=None/i.test(cookie), `secure cross-site cookie should use SameSite=None: ${cookie}`);
    }
    return cookie.replace(/connect\.sid=[^;]+/, "connect.sid=<redacted>");
  });

  await check("successful login rotates an existing browser session id", async () => {
    const session = new CookieSession();
    await session.login(seeded.tenantA.adminEmail);
    const firstCookie = session.cookie;
    await session.login(seeded.tenantA.adminEmail);
    assert(session.cookie && session.cookie !== firstCookie, "session cookie was not rotated on repeated login");
  });

  await check("step-up rotates the browser session id and remains valid", async () => {
    const session = new CookieSession();
    await session.login(seeded.tenantA.adminEmail);
    const beforeStepUp = session.cookie;
    const stepUp = await session.request("POST", "/api/auth/step-up", { password: TEST_PASSWORD });
    expectStatus(stepUp, 200, "POST /api/auth/step-up");
    assert(session.cookie && session.cookie !== beforeStepUp, "session cookie was not rotated on step-up");
    const status = parseJson<{ stepUpValid?: boolean }>(
      await session.request("GET", "/api/auth/step-up/status"),
      "GET /api/auth/step-up/status",
    );
    assert(status.stepUpValid === true, `step-up status not valid after rotation: ${JSON.stringify(status)}`);
  });

  await check("logout invalidates the browser cookie session", async () => {
    const session = new CookieSession();
    await session.login(seeded.tenantA.adminEmail);
    expectStatus(await session.request("POST", "/api/auth/logout"), 200, "POST /api/auth/logout");
    expectStatus(await session.request("GET", "/api/auth/me"), 401, "GET /api/auth/me after logout");
  });

  await check("cross-origin cookie-authenticated state change is rejected safely", async () => {
    const session = new CookieSession();
    await session.login(seeded.tenantA.adminEmail);
    const res = await session.request(
      "POST",
      "/api/auth/change-password",
      { currentPassword: "wrong-password", newPassword: "NoChange123!" },
      { headers: { Origin: "https://evil.example.test" } },
    );
    expectStatus(res, 403, "cross-origin cookie-authenticated POST");
    const body = parseAnyJson<{ code?: string; error?: string }>(res, "cross-origin cookie-authenticated POST");
    assert(body.code === "CSRF_REJECTED", `unexpected CSRF response: ${res.body}`);
    assert(!/stack|token|secret/i.test(res.body), `CSRF response leaked sensitive detail: ${res.body}`);
  });

  await check("same-origin cookie-authenticated state change reaches the protected handler", async () => {
    const session = new CookieSession();
    await session.login(seeded.tenantA.adminEmail);
    const res = await session.request(
      "POST",
      "/api/auth/change-password",
      { currentPassword: "wrong-password", newPassword: "NoChange123!" },
      { headers: { Origin: new URL(BASE_URL).origin, "X-Forwarded-Proto": "http" } },
    );
    expectStatus(res, 401, "same-origin cookie-authenticated POST should not be CSRF-rejected");
    assert(!res.body.includes("CSRF_REJECTED"), `same-origin request was incorrectly CSRF rejected: ${res.body}`);
  });

  await check("bearer-authenticated state change is not blocked by cookie CSRF guard", async () => {
    const session = new CookieSession();
    await session.login(seeded.tenantA.adminEmail);
    const res = await session.request(
      "POST",
      "/api/auth/change-password",
      { currentPassword: "wrong-password", newPassword: "NoChange123!" },
      { bearer: session.token, headers: { Origin: "https://evil.example.test" } },
    );
    expectStatus(res, 401, "bearer POST should reach protected handler");
    assert(!res.body.includes("CSRF_REJECTED"), `bearer request was incorrectly CSRF rejected: ${res.body}`);
  });

  await check("explicit contributor bearer overrides an admin cookie without taking over its session", async () => {
    const session = new CookieSession();
    await session.login(seeded.tenantA.adminEmail);
    const adminCookie = session.cookie;
    const metrics = parseJson<Array<{ id: string }>>(
      await session.request("GET", "/api/metrics"),
      "GET /api/metrics as cookie admin",
    );
    assert(metrics[0]?.id, "no metric available for mixed-credential authorization check");

    const blocked = await session.request(
      "PUT",
      `/api/metrics/${metrics[0].id}/target`,
      { targetValue: 42, targetYear: 2030 },
      { bearer: seeded.tenantA.contributorToken },
    );
    expectStatus(blocked, 403, "contributor bearer with admin cookie");
    assert(!getSessionCookie(blocked.headers), "mixed bearer request unexpectedly issued a session cookie");
    assert(session.cookie === adminCookie, "mixed bearer request replaced the admin cookie");

    const cookieIdentity = parseJson<{ user?: { role?: string } }>(
      await session.request("GET", "/api/auth/me"),
      "GET /api/auth/me after mixed bearer request",
    );
    assert(cookieIdentity.user?.role === "admin", `cookie identity changed to ${cookieIdentity.user?.role || "unknown"}`);
  });

  await check("invalid explicit bearer returns 401 and cannot fall back to a valid cookie", async () => {
    const session = new CookieSession();
    await session.login(seeded.tenantA.viewerEmail);
    const viewerCookie = session.cookie;
    const rejected = await session.request(
      "GET",
      "/api/metrics",
      undefined,
      { bearer: `invalid-bearer-${Date.now()}` },
    );
    expectStatus(rejected, 401, "invalid bearer with valid viewer cookie");
    assert(!getSessionCookie(rejected.headers), "invalid bearer request unexpectedly issued a session cookie");
    assert(session.cookie === viewerCookie, "invalid bearer request replaced the viewer cookie");

    const cookieIdentity = parseJson<{ user?: { role?: string } }>(
      await session.request("GET", "/api/auth/me"),
      "GET /api/auth/me after invalid bearer request",
    );
    assert(cookieIdentity.user?.role === "viewer", `valid cookie was damaged after invalid bearer request: ${cookieIdentity.user?.role || "unknown"}`);
  });

  await check("bearer step-up cannot inherit an unrelated stepped-up cookie", async () => {
    const session = new CookieSession();
    await session.login(seeded.tenantA.contributorEmail);
    expectStatus(
      await session.request("POST", "/api/auth/step-up", { password: TEST_PASSWORD }),
      200,
      "contributor cookie step-up",
    );

    const mixed = await session.request(
      "PATCH",
      "/api/admin/mfa-policy",
      { policy: "optional" },
      { bearer: seeded.tenantA.viewerToken },
    );
    expectStatus(mixed, 403, "viewer bearer with stepped-up contributor cookie");
    const body = parseAnyJson<{ code?: string }>(mixed, "mixed-credential step-up response");
    assert(body.code === "STEP_UP_REQUIRED", `bearer inherited cookie step-up or reached the wrong guard: ${mixed.body}`);
    assert(!getSessionCookie(mixed.headers), "mixed step-up request unexpectedly issued a session cookie");
  });

  await check("bearer-only request does not create a cookie session", async () => {
    const res = await fetch(new URL("/api/metrics", BASE_URL), {
      headers: { Authorization: `Bearer ${seeded.tenantA.contributorToken}` },
    });
    assert(res.status === 200, `bearer-only GET /api/metrics status=${res.status}`);
    assert(!getSessionCookie(res.headers), "bearer-only request unexpectedly issued a session cookie");
    await res.text();
  });

  await check("bearer step-up grants the bearer session and permits API key creation without a cookie", async () => {
    const token = seeded.tenantB.adminToken;
    const stepUp = await fetch(new URL("/api/auth/step-up", BASE_URL), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    const stepUpBody = await stepUp.text();
    assert(stepUp.status === 200, `bearer step-up status=${stepUp.status} body=${stepUpBody}`);
    assert(!getSessionCookie(stepUp.headers), "bearer step-up unexpectedly issued a session cookie");

    const status = await fetch(new URL("/api/auth/step-up/status", BASE_URL), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const statusBody = await status.text();
    assert(status.status === 200, `bearer step-up status check=${status.status} body=${statusBody}`);
    const statusJson = JSON.parse(statusBody) as { stepUpValid?: boolean };
    assert(statusJson.stepUpValid === true, `bearer session was not marked stepped up: ${statusBody}`);
    assert(!getSessionCookie(status.headers), "bearer step-up status unexpectedly issued a session cookie");

    const label = `Bearer step-up regression ${Date.now()}`;
    const created = await fetch(new URL("/api/company/api-keys", BASE_URL), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ label, scopes: ["read:metrics"] }),
    });
    const createdBody = await created.text();
    assert(created.status === 201, `API key creation after bearer step-up status=${created.status} body=${createdBody}`);
    const createdJson = JSON.parse(createdBody) as { id?: string; key?: string };
    assert(createdJson.id, `created API key response missing id: ${createdBody}`);
    assert(/^esgk_/.test(createdJson.key || ""), `created API key response missing plaintext key: ${createdBody}`);
    assert(!getSessionCookie(created.headers), "bearer API key creation unexpectedly issued a session cookie");

    const revoked = await fetch(new URL(`/api/company/api-keys/${createdJson.id}`, BASE_URL), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(revoked.status === 200, `cleanup API key revoke status=${revoked.status} body=${await revoked.text()}`);
  });

  await check("existing bearer logout regression still invalidates stale token", async () => {
    const token = seeded.tenantB.adminToken;
    expectStatus(await apiRequest("POST", "/api/auth/logout", undefined, token), 200, "bearer logout");
    expectStatus(await apiRequest("GET", "/api/auth/me", undefined, token), 401, "stale bearer after logout");
  });

  const failed = results.filter((r) => !r.passed);
  console.log(`\nSession/cookie/CSRF hardening: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
