/**
 * E2E: Auth flow — login, logout, bad credentials, malformed register
 *
 * Uses the admin credentials seeded by global-setup for the main login→logout
 * journey, avoiding the register rate limit (5/hr). The malformed-register test
 * still calls the register endpoint to verify it returns 400/429 correctly.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")) as {
    tenantA: { adminEmail: string; adminToken: string };
  };
}

test.describe("Auth flow", () => {
  test("login → logout succeeds without raw error text", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const loginRes = await request.post("/api/auth/login", {
      data: { email: tenantA.adminEmail, password: "Test1234!" },
    });
    expect(loginRes.status()).toBe(200);
    const loginBody = await loginRes.json() as { token?: string; user?: object };
    expect(loginBody.token).toBeTruthy();
    const body = JSON.stringify(loginBody);
    expect(body).not.toMatch(/stack|at\s+\w+\s+\(/i);

    const logoutRes = await request.post("/api/auth/logout", {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    expect(logoutRes.status()).toBe(200);
    const logoutBody = await logoutRes.json();
    expect(logoutBody.ok).toBe(true);
  });

  test("login with bad credentials returns 401 and no raw error text", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { email: `nobody-${Date.now()}@nowhere.example`, password: "WrongPass123!" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json() as { error?: string };
    expect(body.error).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/stack|at\s+\w+\s+\(/i);
  });

  test("register with missing fields returns 400 or 429 (rate limited)", async ({ request }) => {
    const res = await request.post("/api/auth/register", {
      data: { username: "incomplete" },
    });
    expect([400, 429]).toContain(res.status());
  });
});
