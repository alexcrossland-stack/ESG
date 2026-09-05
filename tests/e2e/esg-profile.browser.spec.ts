import { test, expect } from "@playwright/test";

async function openMockedEsgProfile(page: import("@playwright/test").Page) {
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const period = url.searchParams.get("period") || "2025-12";
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (path === "/api/auth/me") {
      return json({
        user: { id: "mock-admin", username: "Admin", email: "admin@example.test", role: "admin", companyId: "mock-company" },
        company: { id: "mock-company", name: "Mock Company", onboardingComplete: true, lifecycleState: "active" },
        defaultLandingContext: "company",
        portfolioGroups: [],
      });
    }
    if (path === "/api/company/esg-profile") {
      return json({
        company: { name: "Mock Company", industry: "Manufacturing", employeeCount: 42 },
        reporting_period: {
          period,
          label: period,
          source: period === "2025-12" ? "active" : "selected",
          hasActivePeriod: true,
        },
        esg_scores: { environmental: period === "2025-12" ? 100 : 20, social: 0, governance: 0, overall: period === "2025-12" ? 100 : 20 },
        key_metrics: [
          {
            id: "metric-electricity",
            name: "Electricity usage",
            value: period === "2025-12" ? "4990.00" : "100.10",
            hasValue: true,
            unit: "kWh",
            category: "environmental",
          },
        ],
        shareSettings: { enabled: false, token: null, visibleSections: [] },
      });
    }
    if (path === "/api/reporting-periods") {
      return json([
        { id: "period-fy2025", name: "2025-12", status: "open" },
        { id: "period-2025-02", name: "2025-02", status: "closed" },
      ]);
    }
    if (path === "/api/notifications/count") return json({ count: 0 });
    if (path === "/api/programme/status") return json({ nextBestActions: [] });
    if (path === "/api/sites") return json([]);
    if (path === "/api/admin/impersonation/status") return json({ isImpersonating: false });
    if (path === "/api/activity/track" && route.request().method() === "POST") return json({ ok: true });
    if (path === "/api/esg/roadmap") return json({ phases: [] });

    return json([]);
  });

  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "mock-token");
    localStorage.setItem("simplyesg.reporting-month.mock-company", "2025-12");
  });
  await page.goto("/esg-profile");
  await page.waitForLoadState("domcontentloaded");
}

test.describe("ESG Profile reporting period", () => {
  test("shows the shared working month for score cards and key metrics and updates metrics when switched", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMockedEsgProfile(page);

    await expect(page.getByTestId("text-profile-reporting-period")).toHaveText("Reporting Period: 2025-12");
    await expect(page.getByText("Values shown for 2025-12")).toBeVisible();
    await expect(page.getByText("4990.00")).toBeVisible();
    await expect(page.getByTestId("select-profile-reporting-period")).toBeVisible();

    await page.getByTestId("select-profile-reporting-period").click();
    await page.getByRole("option", { name: "2025-02" }).click();
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("text-profile-reporting-period")).toHaveText("Reporting Period: 2025-02");
    await expect(page.getByText("Values shown for 2025-02")).toBeVisible();
    await expect(page.getByText("100.10")).toBeVisible();
    await expect(page.getByText("4990.00")).toHaveCount(0);
  });

  test("keeps the period UI compact at narrower desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await openMockedEsgProfile(page);

    await expect(page.getByTestId("text-profile-title")).toBeVisible();
    await expect(page.getByTestId("text-profile-reporting-period")).toBeVisible();
    await expect(page.getByTestId("select-profile-reporting-period")).toBeVisible();
    await expect(page.getByTestId("metric-card-0")).toBeVisible();
  });
});
