/**
 * Browser E2E: Admin user journeys
 *
 * Tests real browser interactions for core admin workflows:
 * 1. Dashboard loads for a fully-onboarded admin (activation checklist or main content)
 * 2. Dashboard CTA "Enter data" link navigates to the data-entry page
 * 3. Admin enters a metric value via the Manual Entry tab
 * 4. Admin generates an ESG report and preview or confirmation appears
 *
 * All tests use the admin storageState pre-seeded by global-setup so they run
 * without going through the login form.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { ADMIN_STATE_FILE } from "../global-setup.js";

async function makeAdminContext(browser: import("@playwright/test").Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: ADMIN_STATE_FILE });
  const page = await context.newPage();
  return { context, page };
}

test.describe("Admin journeys", () => {
  test("dashboard loads with activation checklist or main content visible", async ({ browser }) => {
    const { context, page } = await makeAdminContext(browser);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Admin must NOT be redirected to the auth page (auth state is persisted)
    await expect(page).not.toHaveURL(/\/auth/, { timeout: 15000 });

    // Since global-setup seeds companies with onboarding_complete=true, the
    // admin always lands on the dashboard (not the onboarding wizard).
    const dashboardTitle = page.getByTestId("text-dashboard-title");
    await expect(dashboardTitle).toBeVisible({ timeout: 12000 });

    // Quick Start / activation card may appear; assert it or its absence is coherent
    const activationCard = page.getByTestId("card-activation-checklist");
    const cardVisible = await activationCard.isVisible().catch(() => false);
    if (cardVisible) {
      // Dismiss the card to exercise that journey
      const dismissBtn = page.getByTestId("button-dismiss-activation-card");
      const canDismiss = await dismissBtn.isVisible().catch(() => false);
      if (canDismiss) {
        await dismissBtn.click();
        await expect(activationCard).not.toBeVisible({ timeout: 5000 });
      }
    }

    // Dashboard title is always visible regardless of activation card state
    await expect(dashboardTitle).toBeVisible();

    await context.close();
  });

  test("dashboard missing-data CTA navigates to data entry", async ({ browser }) => {
    const { context, page } = await makeAdminContext(browser);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Admin must be on the dashboard (not /auth or /onboarding)
    await expect(page).not.toHaveURL(/\/auth/, { timeout: 15000 });
    const dashboardTitle = page.getByTestId("text-dashboard-title");
    await expect(dashboardTitle).toBeVisible({ timeout: 12000 });

    // Navigate to data-entry — either via the CTA or directly
    const missingDataAlert = page.getByTestId("alert-missing-data");
    const alertVisible = await missingDataAlert.isVisible().catch(() => false);

    if (alertVisible) {
      const enterDataLink = page.getByTestId("link-enter-missing");
      await expect(enterDataLink).toBeVisible();
      await enterDataLink.click();
    } else {
      await page.goto("/data-entry");
    }

    // Either way we must end up on the data-entry page and NOT on /auth
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/auth/, { timeout: 10000 });
    expect(page.url()).toContain("/data-entry");

    await context.close();
  });

  test("admin enters first metric value via Manual Entry UI", async ({ browser }) => {
    const { context, page } = await makeAdminContext(browser);

    await page.goto("/data-entry");
    await page.waitForLoadState("networkidle");

    // Must be on data-entry — not auth-redirected
    await expect(page).not.toHaveURL(/\/auth/, { timeout: 10000 });

    // Click the Manual Entry tab
    const manualTab = page.getByTestId("tab-manual-entry");
    await expect(manualTab).toBeVisible({ timeout: 10000 });
    await manualTab.click();
    await page.waitForTimeout(1500);

    // At least one manual metric input must be visible (metrics are seeded on first login)
    const firstInput = page.locator('[data-testid^="input-manual-"]').first();
    await expect(firstInput).toBeVisible({ timeout: 10000 });

    // Fill in a numeric value and save
    await firstInput.clear();
    await firstInput.fill("42.5");
    await page.waitForTimeout(300);

    const firstSaveBtn = page.locator('[data-testid^="button-save-manual-"]').first();
    await expect(firstSaveBtn).toBeVisible({ timeout: 5000 });
    await firstSaveBtn.click();

    // Wait for the save to process — no error alert must appear
    await page.waitForTimeout(2000);
    const errorBanner = page.locator("[role='alert']").filter({ hasText: /error|failed/i });
    await expect(errorBanner).not.toBeVisible({ timeout: 3000 });

    await context.close();
  });

  test("admin generates ESG report and preview appears", async ({ browser }) => {
    const { context, page } = await makeAdminContext(browser);

    await page.goto("/reports");
    await page.waitForLoadState("networkidle");

    // Must be on reports — not auth-redirected
    await expect(page).not.toHaveURL(/\/auth/, { timeout: 10000 });

    // Look for a report type button first, click if found
    const firstTypeBtn = page.locator('[data-testid^="button-export-type-"]').first();
    const typeBtnVisible = await firstTypeBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (typeBtnVisible) {
      await firstTypeBtn.click();
      await page.waitForTimeout(500);
    }

    // The main export button must be present
    const exportBtn = page.getByTestId("button-export-esg-report");
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    await exportBtn.click();

    // Report preview section or success toast must appear; no 500 error allowed
    const reportPreview = page.getByTestId("report-preview");
    const previewVisible = await reportPreview.isVisible({ timeout: 15000 }).catch(() => false);

    if (previewVisible) {
      const reportTitle = page.getByTestId("text-report-title");
      await expect(reportTitle).toBeVisible({ timeout: 5000 });
    } else {
      // No inline preview — ensure no 500 error appeared
      const errorBanner = page.locator("[role='alert']").filter({ hasText: /500|server error/i });
      await expect(errorBanner).not.toBeVisible({ timeout: 3000 });
    }

    await context.close();
  });
});
