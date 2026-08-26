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

async function ensureAdvancedOpen(page: Page) {
  const planSection = page.getByText("Plan and improve", { exact: true });
  if (!(await planSection.isVisible().catch(() => false))) {
    await page.getByTestId("nav-group-esg-advanced").click();
  }
}

function breadcrumbTestId(label: string) {
  return "breadcrumb-" + label.toLowerCase().replace(/\s+/g, "-");
}

async function expectNavigation(page: Page, testId: string, expectedPath: RegExp, breadcrumbLabels: string[]) {
  await page.getByTestId(testId).click();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(expectedPath);
  await expect(page.getByTestId(testId)).toHaveAttribute("aria-current", "page");
  for (const label of breadcrumbLabels) {
    await expect(page.getByTestId(breadcrumbTestId(label))).toBeVisible();
  }
}

test.describe("Simplified SME navigation", () => {
  test("sidebar exposes four primary jobs and one Advanced group", async ({ browser }) => {
    const { context, page } = await openWithState(browser, ADMIN_STATE_FILE);

    const topLevelLabels = await Promise.all([
      page.getByTestId("nav-dashboard").locator("span").first().textContent(),
      page.getByTestId("nav-measure").locator("span").first().textContent(),
      page.getByTestId("nav-control-centre").locator("span").first().textContent(),
      page.getByTestId("nav-reports").locator("span").first().textContent(),
      page.getByTestId("nav-group-esg-advanced").locator("span").first().textContent(),
    ]);

    expect(topLevelLabels.map(label => (label ?? "").trim())).toEqual([
      "Home",
      "Measure",
      "Improve",
      "Share",
      "Advanced",
    ]);
    await expect(page.getByTestId("nav-group-esg-setup")).toHaveCount(0);
    await expect(page.getByTestId("nav-group-data-evidence")).toHaveCount(0);

    await context.close();
  });

  test("primary jobs retain their existing routes and breadcrumbs", async ({ browser }) => {
    const { context, page } = await openWithState(browser, ADMIN_STATE_FILE);

    await expectNavigation(page, "nav-measure", /\/data-entry$/, ["Measure"]);
    await expectNavigation(page, "nav-control-centre", /\/control-centre$/, ["Improve"]);
    await expectNavigation(page, "nav-reports", /\/reports$/, ["Share"]);
    await expectNavigation(page, "nav-dashboard", /\/$/, ["Home"]);

    await context.close();
  });

  test("Advanced progressively exposes specialist deep links", async ({ browser }) => {
    const { context, page } = await openWithState(browser, ADMIN_STATE_FILE);

    await ensureAdvancedOpen(page);
    const advanced = page.getByTestId("nav-esg-advanced-items");
    await expect(advanced.getByText("Plan and improve", { exact: true })).toBeVisible();
    await expect(advanced.getByText("Measure and assure", { exact: true })).toBeVisible();
    await expect(advanced.getByText("Share and coordinate", { exact: true })).toBeVisible();
    await expect(page.getByTestId("nav-esg-policy")).toBeVisible();
    await expect(page.getByTestId("nav-action-tracker")).toBeVisible();
    await expect(page.getByTestId("nav-metrics-library")).toBeVisible();
    await expect(page.getByTestId("nav-frameworks")).toBeVisible();

    await expectNavigation(page, "nav-esg-policy", /\/policy$/, ["Improve", "ESG Policy"]);
    await expectNavigation(page, "nav-action-tracker", /\/actions$/, ["Improve", "Action Tracker"]);
    await expectNavigation(page, "nav-metrics-library", /\/metrics-library$/, ["Measure", "Metrics Library"]);
    await expectNavigation(page, "nav-frameworks", /\/framework-readiness$/, ["Share", "Frameworks"]);

    await context.close();
  });

  test("viewer keeps Measure access without edit navigation and RBAC links stay hidden", async ({ browser }) => {
    const { context, page } = await openWithState(browser, VIEWER_STATE_FILE);

    await expect(page.getByTestId("nav-measure")).toHaveAttribute("href", "/metrics");
    await expectNavigation(page, "nav-measure", /\/metrics$/, ["Measure", "Metrics"]);
    await expect(page.getByTestId("nav-esg-advanced-items")).not.toBeVisible();
    await ensureAdvancedOpen(page);

    await expect(page.getByTestId("nav-metrics")).toHaveCount(0);
    await expect(page.getByTestId("nav-policy-generator")).toBeVisible();
    await expect(page.getByTestId("nav-metrics-library")).toBeVisible();
    await expect(page.getByTestId("nav-questionnaires")).toBeVisible();
    await expect(page.getByTestId("nav-team")).toHaveCount(0);
    await expect(page.getByTestId("nav-framework-settings")).toHaveCount(0);
    await expect(page.getByTestId("nav-my-approvals")).toHaveCount(0);

    await context.close();
  });
});
