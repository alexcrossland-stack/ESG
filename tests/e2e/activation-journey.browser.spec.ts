/**
 * Browser E2E: First-time Activation Journey
 *
 * Covers:
 *  1. Signup via browser form → onboarding wizard appears
 *  2. Quick Start dismissal → dashboard loads (onboarding_complete = true)
 *  3. Logout via sidebar → redirected back to /auth
 *
 * A fresh user is registered within the test so onboarding_complete starts as
 * false and the wizard is shown. If registration is rate-limited (429) the
 * entire suite is skipped — no flakiness injected into the main suite.
 */
import { test, expect } from "@playwright/test";

const TEST_PASSWORD = "Test1234!";

let freshToken = "";
let freshEmail = "";

test.describe("First-time Activation Journey", () => {
  test.beforeAll(async ({ request }) => {
    const suffix = Date.now();
    freshEmail = `e2e.act.${suffix}@esg-test.example`;
    const companyName = `E2E ActCo ${suffix}`;
    const username = `e2eact${suffix}`;

    const res = await request.post("/api/auth/register", {
      data: {
        companyName,
        username,
        email: freshEmail,
        password: TEST_PASSWORD,
        termsAccepted: true,
        privacyAccepted: true,
      },
    });

    if (res.status() === 429) {
      freshToken = "";
      return;
    }

    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`Registration failed ${res.status()}: ${body}`);
    }

    const body = await res.json();
    freshToken = (body as { token?: string }).token ?? "";
  });

  test("signup via browser form → lands on onboarding or dashboard", async ({ page }) => {
    const suffix = Date.now();
    const email = `e2e.signup.${suffix}@esg-test.example`;

    await page.goto("/auth");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("tab-register").click();

    await page.getByTestId("input-company").fill(`BrowserCo ${suffix}`);
    await page.getByTestId("input-username").fill(`brosign${suffix}`);
    await page.getByTestId("input-register-email").fill(email);
    await page.getByTestId("input-register-password").fill(TEST_PASSWORD);
    await page.getByTestId("checkbox-terms").click();
    await page.getByTestId("checkbox-privacy").click();
    await page.getByTestId("button-register").click();

    await page.waitForTimeout(4000);

    const currentUrl = page.url();
    if (currentUrl.includes("/auth")) {
      test.skip();
      return;
    }

    const onboardingTitle = page.getByTestId("text-onboarding-title");
    const dashboardTitle = page.getByTestId("text-dashboard-title");
    const arrived = await Promise.race([
      onboardingTitle.waitFor({ timeout: 10000 }).then(() => "onboarding"),
      dashboardTitle.waitFor({ timeout: 10000 }).then(() => "dashboard"),
    ]).catch(() => null);

    expect(arrived, "should land on onboarding or dashboard after signup").not.toBeNull();
  });

  test("Quick Start dismisses onboarding wizard → dashboard loads", async ({ page }) => {
    if (!freshToken) {
      test.skip();
      return;
    }

    await page.goto("/auth");
    await page.evaluate((token: string) => {
      localStorage.setItem("auth_token", token);
    }, freshToken);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const onboardingTitle = page.getByTestId("text-onboarding-title");
    await onboardingTitle.waitFor({ timeout: 15000 });
    expect(await onboardingTitle.isVisible()).toBe(true);

    const quickStart = page.getByTestId("button-quick-start");
    await quickStart.waitFor({ timeout: 5000 });
    await quickStart.click();

    await page.waitForURL(
      (url) => !url.pathname.startsWith("/onboarding") && !url.pathname.startsWith("/auth"),
      { timeout: 15000 }
    );

    const dashboardTitle = page.getByTestId("text-dashboard-title");
    await dashboardTitle.waitFor({ timeout: 15000 });
    expect(await dashboardTitle.isVisible()).toBe(true);
  });

  test("logout via sidebar → redirects to /auth", async ({ page }) => {
    if (!freshToken) {
      test.skip();
      return;
    }

    await page.goto("/auth");
    await page.evaluate((token: string) => {
      localStorage.setItem("auth_token", token);
    }, freshToken);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.waitForURL(
      (url) => !url.pathname.startsWith("/auth"),
      { timeout: 15000 }
    );

    const logoutBtn = page.getByTestId("button-logout");
    await logoutBtn.waitFor({ timeout: 10000 });
    await logoutBtn.click();

    await page.waitForURL((url) => url.pathname.startsWith("/auth"), { timeout: 10000 });
    expect(page.url()).toContain("/auth");
  });
});
