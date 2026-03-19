/**
 * E2E: Onboarding flow — minimum path + Quick Start dismissal
 */
import { test, expect } from "@playwright/test";

const SUFFIX = `${Date.now()}ob`;

test.describe("Onboarding flow", () => {
  test("new user login triggers seedDatabase and metrics are available", async ({ request }) => {
    const email = `e2e-onboard-${SUFFIX}@test-esg.example`;
    const password = "Test1234!";

    const registerRes = await request.post("/api/auth/register", {
      data: {
        username: `e2eonboard${SUFFIX}`,
        email,
        password,
        companyName: `E2E Onboard Co ${SUFFIX}`,
        termsAccepted: true,
        privacyAccepted: true,
        termsVersion: "1.0",
        privacyVersion: "1.0",
      },
    });
    if (registerRes.status() === 429) {
      test.skip(true, "Register rate limited — skipping test");
      return;
    }
    expect(registerRes.status()).toBe(200);

    const loginRes = await request.post("/api/auth/login", {
      data: { email, password },
    });
    expect(loginRes.status()).toBe(200);
    const { token } = await loginRes.json();
    expect(token).toBeTruthy();

    const metricsRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(metricsRes.status()).toBe(200);
    const metrics = await metricsRes.json();
    expect(Array.isArray(metrics)).toBe(true);
    expect(metrics.length).toBeGreaterThan(0);
  });

  test("onboarding step PUT does not return 500", async ({ request }) => {
    const email = `e2e-onboard2-${SUFFIX}@test-esg.example`;
    const password = "Test1234!";

    const registerRes = await request.post("/api/auth/register", {
      data: {
        username: `e2eonboard2${SUFFIX}`,
        email,
        password,
        companyName: `E2E Onboard2 Co ${SUFFIX}`,
        termsAccepted: true,
        privacyAccepted: true,
        termsVersion: "1.0",
        privacyVersion: "1.0",
      },
    });
    if (registerRes.status() === 429) {
      test.skip(true, "Register rate limited — skipping test");
      return;
    }
    expect(registerRes.status()).toBe(200);

    const loginRes = await request.post("/api/auth/login", {
      data: { email, password },
    });
    expect(loginRes.status()).toBe(200);
    const { token } = await loginRes.json();

    const stepRes = await request.put("/api/onboarding/step", {
      data: {
        step: 1,
        path: "/onboarding",
        esgMaturity: "beginner",
      },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(stepRes.status()).not.toBe(500);
  });
});
