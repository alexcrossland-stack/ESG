/**
 * Browser E2E: Viewer role — write UI is absent
 *
 * Uses a viewer storageState (pre-seeded by global-setup) to verify that
 * data-entry write buttons are not rendered in the browser for the viewer role.
 */
import { test, expect } from "@playwright/test";
import { VIEWER_STATE_FILE, ADMIN_STATE_FILE } from "./global-setup.js";

test.describe("Viewer UI restrictions", () => {
  test("viewer navigates to data entry — manual save buttons are absent", async ({ browser }) => {
    const context = await browser.newContext({ storageState: VIEWER_STATE_FILE });
    const page = await context.newPage();

    await page.goto("/data-entry");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (url.includes("/auth") || url.includes("/onboarding")) {
      test.skip(true, "Viewer auth state not fully persisted — skip browser UI check");
      await context.close();
      return;
    }

    const manualTab = page.getByTestId("tab-manual-entry");
    if (await manualTab.isVisible()) {
      await manualTab.click();
      await page.waitForTimeout(1500);
    }

    const saveButtons = page.locator('[data-testid^="button-save-manual-"]');
    const count = await saveButtons.count();
    expect(count).toBe(0);

    const readOnlyBadge = page.getByTestId("badge-read-only");
    await expect(readOnlyBadge).toBeVisible({ timeout: 5000 });

    await context.close();
  });

  test("admin navigates to data entry — manual save buttons ARE present", async ({ browser }) => {
    const context = await browser.newContext({ storageState: ADMIN_STATE_FILE });
    const page = await context.newPage();

    await page.goto("/data-entry");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (url.includes("/auth") || url.includes("/onboarding")) {
      test.skip(true, "Admin auth state not fully persisted — skip browser UI check");
      await context.close();
      return;
    }

    const manualTab = page.getByTestId("tab-manual-entry");
    await expect(manualTab).toBeVisible({ timeout: 10000 });
    await manualTab.click();

    await page.waitForSelector('[data-testid^="button-save-manual-"]', { timeout: 10000 });

    const saveButtons = page.locator('[data-testid^="button-save-manual-"]');
    const count = await saveButtons.count();
    expect(count).toBeGreaterThan(0);

    await context.close();
  });

  test("viewer lands on dashboard or onboarding (authenticated, not /auth)", async ({ browser }) => {
    const context = await browser.newContext({ storageState: VIEWER_STATE_FILE });
    const page = await context.newPage();

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 10000 });

    const dashboardTitle = page.getByTestId("text-dashboard-title");
    const onboardingTitle = page.getByTestId("text-onboarding-title");

    const landed = await Promise.race([
      dashboardTitle.waitFor({ timeout: 8000 }).then(() => "dashboard"),
      onboardingTitle.waitFor({ timeout: 8000 }).then(() => "onboarding"),
    ]).catch(() => null);

    expect(landed, "Expected viewer to land on dashboard or onboarding, not /auth").not.toBeNull();

    await context.close();
  });
});
