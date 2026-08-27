import { expect, test, type Page } from "@playwright/test";

type SharingScenario = {
  role: "admin" | "viewer";
  planTier: "free" | "pro";
  token?: string;
};

async function openMockedPassport(page: Page, scenario: SharingScenario) {
  const sharingRequests: string[] = [];
  const failedResponses: string[] = [];

  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (path === "/api/auth/me") {
      return json({
        user: {
          id: `mock-${scenario.role}`,
          username: scenario.role,
          email: `${scenario.role}@example.test`,
          role: scenario.role,
          companyId: "mock-company",
        },
        company: { id: "mock-company", name: "Mock Company", onboardingComplete: true, lifecycleState: "active" },
        defaultLandingContext: "company",
        portfolioGroups: [],
      });
    }
    if (path === "/api/billing/status") {
      return json({ planTier: scenario.planTier, planStatus: "active" });
    }
    if (path === "/api/company/esg-profile" && request.method() === "GET") {
      return json({
        company: { name: "Mock Company", industry: "Manufacturing", employeeCount: 42 },
        reporting_period: { period: "FY2025", label: "FY2025", source: "active", hasActivePeriod: true },
        passport: {
          completion: { percentage: 50, reportedMetrics: 1, totalMetrics: 2 },
          evidenceConfidence: { label: "Source linked", description: "1 of 2 metrics has source evidence." },
          reportingBoundary: { label: "Legal entity: Mock Company" },
        },
        key_metrics: [{ id: "electricity", name: "Electricity", value: "100.00", hasValue: true, unit: "kWh", category: "environmental" }],
        shareSettings: {
          enabled: true,
          token: scenario.token ?? "legacy-token-that-must-not-render",
          expiresAt: "2027-01-01T00:00:00.000Z",
          visibleSections: ["passport_summary", "evidence_confidence"],
        },
      });
    }
    if (path === "/api/company/esg-profile/share" && request.method() === "POST") {
      sharingRequests.push(`${request.method()} ${path}`);
      return json({
        enabled: true,
        token: scenario.token ?? "admin-pro-token",
        visibleSections: ["passport_summary", "evidence_confidence"],
      });
    }
    if (path === "/api/company/esg-profile/rotate-token" && request.method() === "POST") {
      sharingRequests.push(`${request.method()} ${path}`);
      return json({ token: "rotated-admin-pro-token" });
    }
    if (path === "/api/reporting-periods") return json([{ id: "fy2025", name: "FY2025", status: "open" }]);
    if (path === "/api/notifications/count") return json({ count: 0 });
    if (path === "/api/programme/status") return json({ nextBestActions: [] });
    if (path === "/api/admin/impersonation/status") return json({ isImpersonating: false });
    if (path === "/api/activity/track" && request.method() === "POST") return json({ ok: true });
    if (path === "/api/sites") return json([]);
    if (path === "/api/esg/roadmap") return json({ phases: [] });
    return json([]);
  });

  await page.addInitScript(() => localStorage.setItem("auth_token", "mock-token"));
  await page.goto("/esg-profile");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("text-profile-title")).toBeVisible();

  return { sharingRequests, failedResponses };
}

test.describe("ESG Passport sharing access", () => {
  test("viewer gets a read-only passport without controls or live-token visibility", async ({ page }) => {
    const token = "viewer-must-never-see-this-token";
    const traffic = await openMockedPassport(page, { role: "viewer", planTier: "pro", token });

    await expect(page.getByTestId("passport-fact-summary")).toBeVisible();
    await expect(page.getByTestId("passport-share-read-only")).toContainText("read-only for your role");
    await expect(page.getByTestId("passport-share-admin-controls")).toHaveCount(0);
    await expect(page.getByTestId("switch-share-enabled")).toHaveCount(0);
    await expect(page.getByTestId("input-share-url")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(token);
    expect(traffic.sharingRequests).toEqual([]);
    expect(traffic.failedResponses).toEqual([]);
  });

  test("free admin gets an upgrade message without calling protected sharing endpoints", async ({ page }) => {
    const token = "free-admin-must-never-see-this-token";
    const traffic = await openMockedPassport(page, { role: "admin", planTier: "free", token });

    await expect(page.getByTestId("passport-share-upgrade")).toContainText("available on Pro");
    await expect(page.getByTestId("button-upgrade-passport-sharing")).toBeVisible();
    await expect(page.getByTestId("passport-share-admin-controls")).toHaveCount(0);
    await expect(page.getByTestId("switch-share-enabled")).toHaveCount(0);
    await expect(page.getByTestId("input-share-url")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(token);
    expect(traffic.sharingRequests).toEqual([]);
    expect(traffic.failedResponses).toEqual([]);
  });

  test("Pro admin can see and manage the live Passport link", async ({ page }) => {
    const token = "admin-pro-live-token";
    const traffic = await openMockedPassport(page, { role: "admin", planTier: "pro", token });

    await expect(page.getByTestId("passport-share-admin-controls")).toBeVisible();
    await expect(page.getByTestId("switch-share-enabled")).toBeChecked();
    await expect(page.getByTestId("input-share-url")).toHaveValue(new RegExp(`/public/esg/${token}$`));

    await page.getByTestId("button-update-share").click();
    await expect.poll(() => traffic.sharingRequests).toContain("POST /api/company/esg-profile/share");

    await page.getByTestId("button-rotate-token").click();
    await expect.poll(() => traffic.sharingRequests).toContain("POST /api/company/esg-profile/rotate-token");
    expect(traffic.failedResponses).toEqual([]);
  });
});
