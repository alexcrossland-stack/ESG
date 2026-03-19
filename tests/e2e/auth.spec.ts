/**
 * E2E: Auth flow — register, login, logout
 */
import { test, expect } from "@playwright/test";

const SUFFIX = Date.now();

test.describe("Auth flow", () => {
  test("register → login → logout succeeds without raw error text", async ({ request }) => {
    const email = `e2e-auth-${SUFFIX}@test-esg.example`;
    const password = "Test1234!";

    const registerRes = await request.post("/api/auth/register", {
      data: {
        username: `e2eauth${SUFFIX}`,
        email,
        password,
        companyName: `E2E Auth Co ${SUFFIX}`,
        termsAccepted: true,
        privacyAccepted: true,
        termsVersion: "1.0",
        privacyVersion: "1.0",
      },
    });

    if (registerRes.status() === 429) {
      test.skip(true, "Register rate limited (5/hr) — skipping register→login→logout flow");
      return;
    }
    expect(registerRes.status()).toBe(200);
    const regBody = await registerRes.json() as { token?: string; company?: { id?: string } };
    expect(regBody.token).toBeTruthy();
    expect(regBody.company?.id).toBeTruthy();

    const loginRes = await request.post("/api/auth/login", {
      data: { email, password },
    });
    expect(loginRes.status()).toBe(200);
    const loginBody = await loginRes.json() as { token?: string };
    expect(loginBody.token).toBeTruthy();

    const logoutRes = await request.post("/api/auth/logout", {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    expect(logoutRes.status()).toBe(200);
    const logoutBody = await logoutRes.json();
    expect(logoutBody.ok).toBe(true);
  });

  test("login with bad credentials returns 401 and no raw error text", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: {
        email: `nonexistent-${SUFFIX}@nowhere.example`,
        password: "WrongPassword123!",
      },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.error).not.toContain("at ");
    expect(body.error).not.toContain("Error:");
    expect(body.error).not.toContain("stack");
  });

  test("register with missing fields returns 400 or 429 (rate limited)", async ({ request }) => {
    const res = await request.post("/api/auth/register", {
      data: { email: "incomplete@example.com" },
    });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(body.error).toBeTruthy();
    }
  });
});
