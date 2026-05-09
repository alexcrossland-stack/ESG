import { test, expect, type Page } from "@playwright/test";
import { ADMIN_STATE_FILE, VIEWER_STATE_FILE } from "./global-setup.js";

async function openWithState(browser: import("@playwright/test").Browser, storageState: string) {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/auth") || page.url().includes("/onboarding")) {
    test.skip(true, "Auth state not fully persisted — skip navigation browser check");
  }
  return { context, page };
}

async function ensureGroupOpen(page: Page, groupTestId: string, visibleItemText: string) {
  const visibleItem = page.getByText(visibleItemText, { exact: true }).first();
  if (!(await visibleItem.isVisible().catch(() => false))) {
    await page.getByTestId(groupTestId).click();
  }
}

async function expectMovedItemNavigation(page: Page, testId: string, expectedPath: RegExp, breadcrumbLabels: string[]) {
  await page.getByTestId(testId).click();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(expectedPath);
  await expect(page.getByTestId("app-breadcrumbs")).toBeVisible();
  for (const label of breadcrumbLabels) {
    await expect(page.getByTestId(`breadcrumb-${label.toLowerCase().replace(/\s+/g, "-")}`)).toBeVisible();
  }
  await expect(page.getByTestId(testId)).toHaveAttribute("aria-current", "page");
}

test.describe("Navigation structure", () => {
  test("primary sidebar has only the four required top-level menu items", async ({ browser }) => {
    const { context, page } = await openWithState(browser, ADMIN_STATE_FILE);

    const topLevelLabels = await Promise.all([
      page.getByTestId("nav-dashboard").textContent(),
      page.getByTestId("nav-group-esg-setup").textContent(),
      page.getByTestId("nav-group-data-evidence").textContent(),
      page.getByTestId("nav-reports").textContent(),
    ]);

    expect(topLevelLabels.map(label => (label ?? "").trim())).toEqual([
      "Dashboard",
      "ESG Setup",
      "Data and Evidence",
      "Reports",
    ]);

    await context.close();
  });

  test("moved ESG Setup advanced items navigate, highlight, and breadcrumb correctly", async ({ browser }) => {
    const { context, page } = await openWithState(browser, ADMIN_STATE_FILE);

    await ensureGroupOpen(page, "nav-group-esg-setup", "Advanced");
    await ensureGroupOpen(page, "nav-group-esg-advanced", "Frameworks");

    await expect(page.getByTestId("nav-esg-advanced-items").getByText("Frameworks", { exact: true })).toBeVisible();
    await expect(page.getByTestId("nav-esg-advanced-items").getByText("Materiality", { exact: true })).toBeVisible();
    await expect(page.getByTestId("nav-esg-advanced-items").getByText("Targets and Actions", { exact: true })).toBeVisible();
    await expect(page.getByTestId("nav-esg-advanced-items").getByText("Risk Register", { exact: true })).toBeVisible();

    await expectMovedItemNavigation(page, "nav-frameworks", /\/framework-readiness$/, ["ESG Setup", "Advanced", "Frameworks"]);
    await expectMovedItemNavigation(page, "nav-materiality", /\/materiality$/, ["ESG Setup", "Advanced", "Materiality"]);
    await expectMovedItemNavigation(page, "nav-targets-and-actions", /\/esg-targets$/, ["ESG Setup", "Advanced", "Targets and Actions"]);
    await expectMovedItemNavigation(page, "nav-risk-register", /\/esg-risks$/, ["ESG Setup", "Advanced", "Risk Register"]);

    await context.close();
  });

  test("policy and control items sit directly under ESG Setup", async ({ browser }) => {
    const { context, page } = await openWithState(browser, ADMIN_STATE_FILE);

    await ensureGroupOpen(page, "nav-group-esg-setup", "Policy Generator");

    const setupItems = page.getByTestId("nav-esg-setup-items");
    await expect(setupItems.getByText("Policy Generator", { exact: true })).toBeVisible();
    await expect(setupItems.getByText("Policy Templates", { exact: true })).toBeVisible();
    await expect(setupItems.getByText("Control Centre", { exact: true })).toBeVisible();
    await expect(setupItems.getByText("Recommendations", { exact: true })).toBeVisible();
    await expect(setupItems.getByText("Policies", { exact: true })).toHaveCount(0);

    await ensureGroupOpen(page, "nav-group-esg-advanced", "Frameworks");
    const advancedItems = page.getByTestId("nav-esg-advanced-items");
    await expect(advancedItems.getByText("Policy Generator", { exact: true })).toHaveCount(0);
    await expect(advancedItems.getByText("Policy Templates", { exact: true })).toHaveCount(0);
    await expect(advancedItems.getByText("Control Centre", { exact: true })).toHaveCount(0);
    await expect(advancedItems.getByText("Recommendations", { exact: true })).toHaveCount(0);

    await expectMovedItemNavigation(page, "nav-policy-generator", /\/policy-generator$/, ["ESG Setup", "Policy Generator"]);
    await expectMovedItemNavigation(page, "nav-policy-templates", /\/policy-templates$/, ["ESG Setup", "Policy Templates"]);
    await expectMovedItemNavigation(page, "nav-control-centre", /\/control-centre$/, ["ESG Setup", "Control Centre"]);
    await expectMovedItemNavigation(page, "nav-recommendations", /\/recommendations$/, ["ESG Setup", "Recommendations"]);

    await context.close();
  });

  test("Policy Register is under Data and Evidence, then Data and Metrics", async ({ browser }) => {
    const { context, page } = await openWithState(browser, ADMIN_STATE_FILE);

    await ensureGroupOpen(page, "nav-group-data-evidence", "Data and Metrics");
    await ensureGroupOpen(page, "nav-group-data-and-metrics", "Policy Register");

    await expect(page.getByTestId("nav-data-and-metrics-items").getByText("Policy Register", { exact: true })).toBeVisible();
    await expectMovedItemNavigation(page, "nav-esg-policy-register", /\/esg-policy-register$/, [
      "Data and Evidence",
      "Data and Metrics",
      "Policy Register",
    ]);

    await context.close();
  });

  test("moved item permission gates are preserved for viewer navigation", async ({ browser }) => {
    const { context, page } = await openWithState(browser, VIEWER_STATE_FILE);

    await ensureGroupOpen(page, "nav-group-esg-setup", "Advanced");
    await ensureGroupOpen(page, "nav-group-esg-advanced", "Frameworks");
    await ensureGroupOpen(page, "nav-group-data-evidence", "Data and Metrics");
    await ensureGroupOpen(page, "nav-group-data-and-metrics", "Policy Register");

    await expect(page.getByTestId("nav-frameworks")).toBeVisible();
    await expect(page.getByTestId("nav-materiality")).toBeVisible();
    await expect(page.getByTestId("nav-targets-and-actions")).toBeVisible();
    await expect(page.getByTestId("nav-risk-register")).toBeVisible();
    await expect(page.getByTestId("nav-policy-generator")).toBeVisible();
    await expect(page.getByTestId("nav-policy-templates")).toBeVisible();
    await expect(page.getByTestId("nav-control-centre")).toBeVisible();
    await expect(page.getByTestId("nav-recommendations")).toBeVisible();
    await expect(page.getByTestId("nav-esg-policy-register")).toBeVisible();

    await expect(page.getByTestId("nav-policies")).toHaveCount(0);
    await expect(page.getByTestId("nav-team")).toHaveCount(0);
    await expect(page.getByTestId("nav-framework-settings")).toHaveCount(0);
    await expect(page.getByTestId("nav-enter-data")).toHaveCount(0);
    await expect(page.getByTestId("nav-my-approvals")).toHaveCount(0);

    await context.close();
  });
});
