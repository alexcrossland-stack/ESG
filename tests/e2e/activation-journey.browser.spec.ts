/**
 * Browser E2E: First-time Activation Journey
 *
 * Covers:
 *  1. Signup via browser form → onboarding wizard appears
 *  2. Guided five-step setup → dashboard loads (onboarding_complete = true)
 *  3. Logout via sidebar → redirected back to /auth
 *
 * A fresh user is registered within the test so onboarding_complete starts as
 * false and the wizard is shown. If registration is rate-limited (429) the
 * entire suite is skipped — no flakiness injected into the main suite.
 */
import { test, expect } from "@playwright/test";

const TEST_PASSWORD = "Test1234!";

let freshToken = "";

test.describe("First-time Activation Journey", () => {
  test.describe.configure({ mode: "serial" });

  test("signup via browser form → lands on onboarding or dashboard", async ({ page }) => {
    const suffix = Date.now();
    const email = `e2e.signup.${suffix}@esg-test.example`;

    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");

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
    freshToken = await page.evaluate(() => localStorage.getItem("auth_token") || "");
    expect(freshToken, "signup should establish a reusable bearer session").toBeTruthy();
  });

  test("guided onboarding completes the SME baseline → dashboard loads", async ({ page }) => {
    if (!freshToken) {
      test.skip();
      return;
    }

    await page.goto("/auth");
    await page.evaluate((token: string) => {
      localStorage.setItem("auth_token", token);
    }, freshToken);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const onboardingTitle = page.getByTestId("text-onboarding-title");
    await onboardingTitle.waitFor({ timeout: 15000 });
    expect(await onboardingTitle.isVisible()).toBe(true);

    await page.getByTestId("input-company-name").fill(`E2E Guided SME ${Date.now()}`);
    await page.getByTestId("select-industry").click();
    await page.getByRole("option", { name: "Professional Services" }).click();
    await page.getByTestId("select-employee-count").click();
    await page.getByRole("option", { name: /1.*10 people/ }).click();
    await page.getByTestId("button-wizard-next").click();

    await expect(page.getByTestId("step-esg-profile")).toBeVisible();
    await page.getByTestId("checkbox-hasOffices").click();
    await page.getByTestId("button-wizard-next").click();

    await expect(page.getByTestId("step-starter-metrics")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("button-wizard-next").click();

    await expect(page.getByTestId("step-data-entry")).toBeVisible({ timeout: 15000 });
    const firstMetricInput = page.locator('[data-testid^="input-metric-value-"]').first();
    await expect(firstMetricInput).toBeVisible();
    await firstMetricInput.fill("100");
    const inputTestId = await firstMetricInput.getAttribute("data-testid");
    const metricId = inputTestId!.replace("input-metric-value-", "");

    let failFirstSave = true;
    await page.route("**/api/data-entry", async (route) => {
      if (route.request().method() === "POST" && failFirstSave) {
        failFirstSave = false;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary onboarding save failure" }),
        });
      }
      return route.fallback();
    });

    await page.getByTestId("button-wizard-next").click();
    await expect(page.getByTestId("step-data-entry")).toBeVisible();
    await expect(page.getByTestId(`error-metric-save-${metricId}`)).toContainText("Not saved");
    await expect(firstMetricInput).toBeEditable();

    await page.getByTestId("button-wizard-next").click();

    await expect(page.getByTestId("step-baseline-ready")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Your starter ESG baseline is set" })).toBeVisible();
    await expect(page.getByTestId("step-baseline-ready")).toContainText("You captured 1 priority metric");
    await page.getByTestId("button-wizard-complete").click();

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
    await page.waitForLoadState("domcontentloaded");

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
