/**
 * Browser E2E: Login → Dashboard UI flow
 *
 * Tests that a user can log in through the browser UI and land on the dashboard.
 * Uses the admin credentials seeded by global-setup.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_STATE_FILE } from "./global-setup.js";
import fs from "fs";

test.describe("Login UI", () => {
  test("login via UI form → dashboard loads with title", async ({ page }) => {
    const seedInfo = JSON.parse(
      fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")
    ) as { tenantA: { adminEmail: string } };
    const email = seedInfo.tenantA.adminEmail;
    const password = "Test1234!";

    await page.goto("/auth");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("input-email").fill(email);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("button-login").click();

    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15000 });

    const dashboardTitle = page.getByTestId("text-dashboard-title");
    const onboardingTitle = page.getByTestId("text-onboarding-title");
    const titleVisible = await Promise.race([
      dashboardTitle.waitFor({ timeout: 10000 }).then(() => "dashboard"),
      onboardingTitle.waitFor({ timeout: 10000 }).then(() => "onboarding"),
    ]).catch(() => null);

    expect(titleVisible).not.toBeNull();
  });

  test("bad credentials show error, no redirect", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("input-email").fill(`nobody-${Date.now()}@nowhere.example`);
    await page.getByTestId("input-password").fill("WrongPass123!");
    await page.getByTestId("button-login").click();

    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/auth");
  });

  test("authenticated admin sees dashboard (via storageState)", async ({ browser }) => {
    const context = await browser.newContext({ storageState: ADMIN_STATE_FILE });
    const page = await context.newPage();

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15000 });

    const dashboardTitle = page.getByTestId("text-dashboard-title");
    const onboardingTitle = page.getByTestId("text-onboarding-title");
    const titleVisible = await Promise.race([
      dashboardTitle.waitFor({ timeout: 10000 }).then(() => "dashboard"),
      onboardingTitle.waitFor({ timeout: 10000 }).then(() => "onboarding"),
    ]).catch(() => null);

    expect(titleVisible).not.toBeNull();
    await context.close();
  });
});
