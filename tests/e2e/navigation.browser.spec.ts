import { expect, test } from "@playwright/test";

type MockRole = "admin" | "super_admin" | "viewer";

async function openWithMockRole(
  browser: import("@playwright/test").Browser,
  role: MockRole,
  path = "/",
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname;
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (apiPath === "/api/auth/me") {
      return json({
        user: { id: `mock-${role}`, username: `${role} user`, email: `${role}@example.test`, role, companyId: "mock-company" },
        company: { id: "mock-company", name: "Mock Company", onboardingComplete: true, lifecycleState: "active" },
        defaultLandingContext: "company",
        portfolioGroups: [],
      });
    }
    if (apiPath === "/api/sites") return json([]);
    if (apiPath === "/api/billing/status") return json({ planTier: "pro", subscriptionStatus: "active" });
    if (apiPath.startsWith("/api/data-entry/")) return json({ metrics: [], values: [], periodLocked: false });
    if (apiPath === "/api/reports/readiness-detail") {
      return json({
        esgState: "IN_PROGRESS",
        stateLabel: "In progress",
        stateExplanation: "Add your first figures to establish your ESG baseline.",
        completenessPercent: 0,
        evidenceCoveragePercent: 0,
        measuredCount: 0,
        derivedCount: 0,
        estimateCount: 0,
        missingCount: 0,
        totalMetrics: 0,
        filledMetrics: 0,
        nextAction: "Add data",
        minViableThresholdMet: false,
        blockingFactors: [],
        missingCategories: { missingMetrics: [], missingEvidenceCount: 0, highEstimateLoad: false, estimatedPercent: 0, policyNotPublished: false, overdueActions: 0 },
        canGenerateConfirmed: false,
      });
    }
    if (apiPath === "/api/admin/impersonation/status") return json({ isImpersonating: false });
    if (apiPath === "/api/activity/track" && method === "POST") return json({ ok: true });
    if (apiPath === "/api/dashboard") return json({});
    if (apiPath === "/api/control-centre") {
      return json({
        summary: { overdueActions: 0, missingData: 0, expiredEvidence: 0, lowQuality: 0, unmetCompliance: 0, pendingApprovals: 0, unapprovedPolicies: 0 },
        overdueActions: [], missingData: [], expiredEvidence: [], lowQuality: [], unmetCompliance: [], pendingApprovals: [], unapprovedPolicies: [], gapScore: 0,
      });
    }
    return json([]);
  });
  await page.addInitScript(() => localStorage.setItem("auth_token", "mock-token"));
  await page.goto(path);
  await expect(page.getByTestId("primary-navigation")).toBeVisible();
  return { context, page };
}

test.describe("Simplified SME workspace navigation", () => {
  test("shows exactly six permanent workspaces with one Help and Settings area", async ({ browser }) => {
    const { context, page } = await openWithMockRole(browser, "admin");

    await expect(page.getByTestId("primary-navigation").getByRole("link")).toHaveText([
      "Overview",
      "Data & evidence",
      "Action plan",
      "Reports",
      "Questionnaires",
      "More tools",
    ]);
    await expect(page.getByTestId("nav-group-esg-advanced")).toHaveCount(0);
    await expect(page.getByText("Next", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("utility-navigation").getByRole("link", { name: "Help", exact: true })).toHaveCount(1);
    await expect(page.getByTestId("utility-navigation").getByRole("link", { name: "Settings", exact: true })).toHaveCount(1);
    await expect(page.getByTestId("button-open-assistant")).toHaveCount(0);
    await expect(page.getByText("Terms of Service", { exact: true })).toHaveCount(0);

    await context.close();
  });

  test("primary links retain canonical routes and top-level pages avoid redundant breadcrumbs", async ({ browser }) => {
    const { context, page } = await openWithMockRole(browser, "admin");
    const destinations: Array<[string, string]> = [
      ["nav-measure", "/data-entry"],
      ["nav-control-centre", "/control-centre"],
      ["nav-reports", "/reports"],
      ["nav-questionnaires", "/questionnaire"],
      ["nav-more-tools", "/more-tools"],
      ["nav-dashboard", "/"],
    ];

    for (const [testId, path] of destinations) {
      await page.getByTestId(testId).click();
      await expect(page).toHaveURL(new RegExp(path === "/" ? "/$" : `${path}$`));
      await expect(page.getByTestId(testId)).toHaveAttribute("aria-current", "page");
      await expect(page.getByTestId("app-breadcrumbs")).toHaveCount(0);
    }

    await context.close();
  });

  test("related deep pages keep the correct workspace highlighted", async ({ browser }) => {
    const { context, page } = await openWithMockRole(browser, "admin", "/evidence");
    await expect(page.getByTestId("nav-measure")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("breadcrumb-data-&-evidence")).toBeVisible();
    await expect(page.getByTestId("breadcrumb-documents")).toBeVisible();

    await page.goto("/esg-targets");
    await expect(page.getByTestId("nav-control-centre")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("breadcrumb-action-plan")).toBeVisible();

    await page.goto("/answer-library");
    await expect(page.getByTestId("nav-questionnaires")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("breadcrumb-questionnaires")).toBeVisible();

    await page.goto("/framework-readiness");
    await expect(page.getByTestId("nav-more-tools")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("breadcrumb-more-tools")).toBeVisible();

    await context.close();
  });

  test("More Tools is a grouped hub and preserves admin-only visibility", async ({ browser }) => {
    const { context, page } = await openWithMockRole(browser, "admin", "/more-tools");

    await expect(page.getByTestId("page-more-tools")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Frameworks & assurance" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Company & governance" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Analysis & coordination" })).toBeVisible();
    await expect(page.getByTestId("more-tools-framework-settings")).toBeVisible();
    await expect(page.getByTestId("more-tools-team")).toBeVisible();
    await expect(page.getByTestId("more-tools-my-approvals")).toBeVisible();

    await context.close();
  });

  test("viewer gets read-only data routing and does not see restricted tools", async ({ browser }) => {
    const { context, page } = await openWithMockRole(browser, "viewer", "/more-tools");

    await expect(page.getByTestId("nav-measure")).toHaveAttribute("href", "/metrics");
    await expect(page.getByTestId("nav-enter-data")).toHaveCount(0);
    await expect(page.getByTestId("more-tools-framework-settings")).toHaveCount(0);
    await expect(page.getByTestId("more-tools-team")).toHaveCount(0);
    await expect(page.getByTestId("more-tools-my-approvals")).toHaveCount(0);
    await expect(page.getByTestId("nav-utility-settings")).toBeVisible();

    await context.close();
  });

  test("workspace tabs expose the main jobs before specialist detail", async ({ browser }) => {
    const { context, page } = await openWithMockRole(browser, "admin", "/data-entry");

    await expect(page.getByRole("heading", { name: "Data & evidence" })).toBeVisible();
    await expect(page.getByTestId("tab-raw-data")).toBeVisible();
    await expect(page.getByTestId("tab-manual-entry")).toBeVisible();
    await expect(page.getByTestId("tab-documents")).toBeVisible();
    await expect(page.getByTestId("tab-paste-excel")).toBeVisible();
    await page.getByTestId("tab-documents").click();
    await expect(page).toHaveURL(/\/evidence$/);

    await page.goto("/reports");
    await expect(page.getByTestId("tab-reports-create")).toHaveAttribute("data-state", "active");
    await page.getByTestId("tab-reports-library").click();
    await expect(page.getByTestId("heading-report-library")).toBeVisible();
    await page.getByTestId("tab-reports-exports").click();
    await expect(page.getByText("Export Packs", { exact: true })).toBeVisible();

    await page.goto("/questionnaire");
    await expect(page.getByRole("heading", { name: "Questionnaires", exact: true })).toBeVisible();
    await expect(page.getByTestId("tab-previous-questionnaires")).toHaveAttribute("data-state", "active");
    await expect(page.getByTestId("button-new-questionnaire")).toBeVisible();
    await expect(page.getByTestId("button-open-answer-library")).toBeVisible();

    await context.close();
  });

  test("desktop and mobile layouts keep all core choices usable without horizontal overflow", async ({ browser }) => {
    const { context, page } = await openWithMockRole(browser, "admin", "/more-tools");
    await page.setViewportSize({ width: 1280, height: 720 });

    for (const testId of ["nav-dashboard", "nav-measure", "nav-control-centre", "nav-reports", "nav-questionnaires", "nav-more-tools", "nav-utility-help", "nav-utility-settings", "button-logout"]) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.setViewportSize({ width: 360, height: 740 });
    await page.getByTestId("button-sidebar-toggle").click();
    await expect(page.getByTestId("primary-navigation")).toBeVisible();
    await expect(page.getByTestId("nav-more-tools")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await context.close();
  });
});
