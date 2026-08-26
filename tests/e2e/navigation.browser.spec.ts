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

async function openWithMockRole(
  browser: import("@playwright/test").Browser,
  role: "admin" | "super_admin",
  nextBestActions: { url: string }[] = [],
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (path === "/api/auth/me") {
      return json({
        user: { id: `mock-${role}`, username: `${role} smoke`, email: `${role}@example.test`, role, companyId: "mock-company" },
        company: { id: "mock-company", name: "Mock Company", onboardingComplete: true, lifecycleState: "active" },
        defaultLandingContext: "company",
        portfolioGroups: [],
      });
    }
    if (path === "/api/notifications/count") return json({ count: 0 });
    if (path === "/api/programme/status") return json({ nextBestActions });
    if (path === "/api/recommendations") return json({ recommendations: [], total: 0, limited: false });
    if (path === "/api/esg/roadmap") return json({ roadmap: { items: [], generatedAt: null, updatedAt: null } });
    if (path === "/api/sites") return json([]);
    if (path === "/api/admin/impersonation/status") return json({ isImpersonating: false });
    if (path === "/api/activity/track" && method === "POST") return json({ ok: true });
    if (path === "/api/dashboard") return json({});
    return json([]);
  });
  await page.addInitScript(() => localStorage.setItem("auth_token", "mock-token"));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
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

async function expectSidebarSettingsMatchesUtility(page: Page, expectedPath: string) {
  const settingsHref = await page.getByTestId("nav-utility-settings").getAttribute("href");
  await expect(page.getByTestId("nav-settings-console")).toBeVisible();
  await expect(page.getByTestId("nav-settings-console")).toHaveText(/Settings/);
  await expect(page.getByTestId("nav-settings-console")).toHaveAttribute("href", settingsHref ?? "");
  await expect(page.getByTestId("nav-settings-console")).toHaveAttribute("href", expectedPath);
}

test.describe("Simplified SME navigation", () => {
  test("sidebar exposes four primary jobs, Advanced, and the existing Settings destination", async ({ browser }) => {
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
    await expect(page.getByTestId("nav-admin-console")).toHaveCount(0);
    await expectSidebarSettingsMatchesUtility(page, "/settings");

    await ensureAdvancedOpen(page);
    await expect(page.getByTestId("nav-team")).toHaveAttribute("href", "/team");

    await page.getByTestId("nav-settings-console").click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/settings$/);

    await context.close();
  });

  test("super admin sidebar Settings matches bottom-left settings destination", async ({ browser }) => {
    const { context, page } = await openWithMockRole(browser, "super_admin");

    await expect(page.getByTestId("nav-admin-console")).toHaveCount(0);
    await expectSidebarSettingsMatchesUtility(page, "/settings");

    await ensureAdvancedOpen(page);
    await expect(page.getByTestId("nav-team")).toHaveAttribute("href", "/team");

    await page.getByTestId("nav-settings-console").click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/settings$/);

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

  test("Advanced progressively exposes specialist deep links with routes and breadcrumbs intact", async ({ browser }) => {
    const { context, page } = await openWithState(browser, ADMIN_STATE_FILE);

    await ensureAdvancedOpen(page);
    const advanced = page.getByTestId("nav-esg-advanced-items");
    await expect(advanced.getByText("Plan and improve", { exact: true })).toBeVisible();
    await expect(advanced.getByText("Measure and assure", { exact: true })).toBeVisible();
    await expect(advanced.getByText("Share and coordinate", { exact: true })).toBeVisible();
    await expect(page.getByTestId("nav-esg-policy")).toBeVisible();
    await expect(page.getByTestId("nav-action-tracker")).toBeVisible();
    await expect(page.getByTestId("nav-roadmap")).toBeVisible();
    await expect(page.getByTestId("nav-policy-generator")).toBeVisible();
    await expect(page.getByTestId("nav-policy-templates")).toBeVisible();
    await expect(page.getByTestId("nav-esg-policy-register")).toBeVisible();
    await expect(page.getByTestId("nav-metrics-library")).toBeVisible();
    await expect(page.getByTestId("nav-frameworks")).toBeVisible();

    await expectNavigation(page, "nav-esg-policy", /\/policy$/, ["Improve", "ESG Policy"]);
    await expectNavigation(page, "nav-action-tracker", /\/actions$/, ["Improve", "Action Tracker"]);
    await expectNavigation(page, "nav-roadmap", /\/roadmap$/, ["Improve", "Roadmap"]);
    await expectNavigation(page, "nav-policy-generator", /\/policy-generator$/, ["Improve", "Policies", "Policy Generator"]);
    await expectNavigation(page, "nav-policy-templates", /\/policy-templates$/, ["Improve", "Policies", "Policy Templates"]);
    await expectNavigation(page, "nav-materiality", /\/materiality$/, ["Improve", "Materiality"]);
    await expectNavigation(page, "nav-targets-and-actions", /\/esg-targets$/, ["Improve", "Targets and Actions"]);
    await expectNavigation(page, "nav-risk-register", /\/esg-risks$/, ["Improve", "Risk Register"]);
    await expectNavigation(page, "nav-metrics-library", /\/metrics-library$/, ["Measure", "Metrics Library"]);
    await expectNavigation(page, "nav-frameworks", /\/framework-readiness$/, ["Share", "Frameworks"]);

    await context.close();
  });

  test("Recommendations remains directly accessible and is discoverable in Advanced", async ({ browser }) => {
    const { context, page } = await openWithMockRole(browser, "admin");

    await ensureAdvancedOpen(page);
    await expectNavigation(page, "nav-recommendations", /\/recommendations$/, ["Improve", "Recommendations"]);
    await expect(page.getByTestId("page-recommendations")).toBeVisible();

    await context.close();
  });

  test("Policy Generator label stays single-line with NEXT badge", async ({ browser }) => {
    const { context, page } = await openWithMockRole(browser, "admin", [{ url: "/policy-generator" }]);
    await page.setViewportSize({ width: 1280, height: 800 });

    await ensureAdvancedOpen(page);

    const policyGenerator = page.getByTestId("nav-policy-generator");
    const label = policyGenerator.getByText("Policy Generator", { exact: true });
    const badge = policyGenerator.getByText("Next", { exact: true });

    await expect(policyGenerator).toHaveCSS("align-items", "center");
    await expect(label).toHaveCSS("white-space", "nowrap");
    await expect(label).toHaveCSS("overflow", "hidden");
    await expect(label).toHaveCSS("text-overflow", "ellipsis");
    await expect.poll(async () => label.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(badge).toBeVisible();

    await context.close();
  });

  test("Advanced retains former Data and Evidence destinations without another nested group", async ({ browser }) => {
    const { context, page } = await openWithState(browser, ADMIN_STATE_FILE);

    await ensureAdvancedOpen(page);

    await expect(page.getByTestId("nav-group-data-and-metrics")).toHaveCount(0);
    await expect(page.getByTestId("nav-metrics")).toBeVisible();
    await expect(page.getByTestId("nav-metrics-library")).toBeVisible();
    await expect(page.getByTestId("nav-evidence")).toBeVisible();
    await expect(page.getByTestId("nav-esg-policy-register")).toBeVisible();
    await expectNavigation(page, "nav-esg-policy-register", /\/esg-policy-register$/, ["Improve", "Policies", "Policy Register"]);
    await expectNavigation(page, "nav-evidence", /\/evidence$/, ["Measure", "Supporting Documents"]);

    await context.close();
  });

  test("viewer keeps Measure access without edit navigation and RBAC links stay hidden", async ({ browser }) => {
    const { context, page } = await openWithState(browser, VIEWER_STATE_FILE);

    await expect(page.getByTestId("nav-measure")).toHaveAttribute("href", "/metrics");
    await expectNavigation(page, "nav-measure", /\/metrics$/, ["Measure", "Metrics"]);
    await expect(page.getByTestId("nav-esg-advanced-items")).not.toBeVisible();
    await ensureAdvancedOpen(page);

    await expect(page.getByTestId("nav-metrics")).toHaveCount(0);
    await expect(page.getByTestId("nav-frameworks")).toBeVisible();
    await expect(page.getByTestId("nav-materiality")).toBeVisible();
    await expect(page.getByTestId("nav-targets-and-actions")).toBeVisible();
    await expect(page.getByTestId("nav-risk-register")).toBeVisible();
    await expect(page.getByTestId("nav-policy-generator")).toBeVisible();
    await expect(page.getByTestId("nav-policy-templates")).toBeVisible();
    await expect(page.getByTestId("nav-roadmap")).toBeVisible();
    await expect(page.getByTestId("nav-recommendations")).toBeVisible();
    await expect(page.getByTestId("nav-esg-policy-register")).toBeVisible();
    await expect(page.getByTestId("nav-metrics-library")).toBeVisible();
    await expect(page.getByTestId("nav-questionnaires")).toBeVisible();
    await expect(page.getByTestId("nav-team")).toHaveCount(0);
    await expect(page.getByTestId("nav-framework-settings")).toHaveCount(0);
    await expect(page.getByTestId("nav-my-approvals")).toHaveCount(0);
    await expect(page.getByTestId("nav-enter-data")).toHaveCount(0);
    await expect(page.getByTestId("nav-admin-console")).toHaveCount(0);
    await expect(page.getByTestId("nav-settings-console")).toHaveCount(0);

    await context.close();
  });
});
