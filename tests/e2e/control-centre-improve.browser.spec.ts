import { expect, test, type Page } from "@playwright/test";

type MockRole = "admin" | "viewer";

const populatedPlan = {
  gapScore: 42,
  overdueActions: [
    { id: "action-later", name: "Finish supplier review", dueDate: "2026-08-20T00:00:00.000Z", owner: "Procurement", linkUrl: "/actions" },
    { id: "action-oldest", name: "Complete energy audit", dueDate: "2026-08-01T00:00:00.000Z", owner: "Operations", linkUrl: "/actions" },
  ],
  missingData: [
    { id: "metric-missing", name: "Water use", category: "environmental", owner: "Facilities", linkUrl: "/data-entry" },
  ],
  expiredEvidence: [
    { id: "evidence-expired", name: "Electricity invoice.pdf", expiryDate: "2026-07-31T00:00:00.000Z", linkedModule: "metric_value", linkUrl: "/evidence" },
  ],
  lowQuality: [
    { id: "metric-quality", name: "Business travel", category: "environmental", score: 15, owner: null, linkUrl: "/data-entry" },
  ],
  unmetCompliance: [
    { id: "requirement-open", code: "VSME B3", title: "Energy and emissions", framework: "VSME", linkUrl: "/framework-readiness?requirement=requirement-open" },
  ],
  pendingApprovals: [
    { id: "approval-open", name: "Waste diverted", entityType: "metric_value", period: "2026-08", linkUrl: "/my-approvals" },
  ],
  unapprovedPolicies: [
    { id: "policy-draft", name: "Responsible sourcing policy", status: "pending_review", linkUrl: "/policy-templates" },
  ],
  summary: {
    overdueActions: 2,
    missingData: 1,
    expiredEvidence: 1,
    lowQuality: 1,
    unmetCompliance: 1,
    pendingApprovals: 1,
    unapprovedPolicies: 1,
  },
};

const emptyPlan = {
  gapScore: 0,
  overdueActions: [],
  missingData: [],
  expiredEvidence: [],
  lowQuality: [],
  unmetCompliance: [],
  pendingApprovals: [],
  unapprovedPolicies: [],
  summary: {
    overdueActions: 0,
    missingData: 0,
    expiredEvidence: 0,
    lowQuality: 0,
    unmetCompliance: 0,
    pendingApprovals: 0,
    unapprovedPolicies: 0,
  },
};

async function openMockedImprove(page: Page, role: MockRole, controlCentreData: typeof populatedPlan | typeof emptyPlan) {
  const unexpectedWrites: string[] = [];

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (method !== "GET" && path !== "/api/activity/track") unexpectedWrites.push(`${method} ${path}`);

    if (path === "/api/auth/me") {
      return json({
        user: { id: `mock-${role}`, username: role, email: `${role}@example.test`, role, companyId: "mock-company" },
        company: { id: "mock-company", name: "Mock Company", onboardingComplete: true, lifecycleState: "active" },
        defaultLandingContext: "company",
        portfolioGroups: [],
      });
    }
    if (path === "/api/control-centre") return json(controlCentreData);
    if (path === "/api/notifications/count") return json({ count: 0 });
    if (path === "/api/programme/status") return json({ nextBestActions: [] });
    if (path === "/api/recommendations") return json({ recommendations: [], total: 0, limited: false });
    if (path === "/api/esg/roadmap") return json({ roadmap: { items: [], generatedAt: null, updatedAt: null } });
    if (path === "/api/sites") return json([]);
    if (path === "/api/admin/impersonation/status") return json({ isImpersonating: false });
    if (path === "/api/activity/track" && method === "POST") return json({ ok: true });
    return json([]);
  });

  await page.addInitScript(() => localStorage.setItem("auth_token", "mock-token"));
  await page.goto("/control-centre");
  await page.waitForLoadState("domcontentloaded");
  return unexpectedWrites;
}

test.describe("Simple SME Improve plan", () => {
  test("leads with five ranked actions and progressively discloses the full workload and specialist tools", async ({ page }) => {
    const unexpectedWrites = await openMockedImprove(page, "admin", populatedPlan);

    await expect(page.getByTestId("text-improve-title")).toHaveText("Improve");
    await expect(page.getByTestId("improve-plan-summary")).toContainText("Organisation-wide");
    await expect(page.getByTestId("improve-plan-summary")).toContainText("42/100");

    const planItems = page.locator('[data-testid^="improvement-plan-item-"]');
    await expect(planItems).toHaveCount(5);
    await expect(planItems.nth(0)).toContainText("Complete energy audit");
    await expect(planItems.nth(1)).toContainText("Finish supplier review");
    await expect(planItems.nth(2)).toContainText("Add Water use");
    await expect(planItems.nth(3)).toContainText("Replace Electricity invoice.pdf");
    await expect(planItems.nth(4)).toContainText("Strengthen Business travel");

    await expect(planItems.nth(0)).toContainText("Why this matters:");
    await expect(planItems.nth(0)).toContainText("Owner");
    await expect(planItems.nth(0)).toContainText("Operations");
    await expect(planItems.nth(0)).toContainText("Due date");
    await expect(planItems.nth(0)).toContainText("1 Aug 2026");
    await expect(planItems.nth(0)).toContainText("Overdue");
    await expect(planItems.nth(0)).toContainText("Evidence or result");
    await expect(planItems.nth(0)).toContainText("Result not yet recorded");
    await expect(planItems.nth(4)).toContainText("Unassigned");
    await expect(planItems.nth(4)).toContainText("Quality score: 15/100");

    await expect(page.getByTestId("button-bulk-complete-actions")).toHaveCount(0);
    expect(unexpectedWrites).toEqual([]);

    const openWork = page.getByTestId("disclosure-open-work");
    const specialistTools = page.getByTestId("disclosure-specialist-tools");
    await expect(openWork).not.toHaveAttribute("open", "");
    await expect(specialistTools).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("open-work-area-overdueActions")).toBeHidden();
    await expect(page.getByTestId("specialist-tool-actions")).toBeHidden();

    await openWork.locator("summary").click();
    await expect(page.getByTestId("open-work-area-overdueActions")).toBeVisible();
    await expect(page.getByTestId("open-work-area-unapprovedPolicies")).toBeVisible();
    await expect(page.getByTestId("open-work-area-unmetCompliance")).toHaveAttribute("href", "/framework-readiness");

    await specialistTools.locator("summary").click();
    await expect(page.getByRole("link", { name: /Action tracker/ })).toHaveAttribute("href", "/actions");
    await expect(page.getByRole("link", { name: /Targets and actions/ })).toHaveAttribute("href", "/esg-targets");
    await expect(page.getByRole("link", { name: /Risk register/ })).toHaveAttribute("href", "/esg-risks");
    await expect(page.getByRole("link", { name: /Roadmap/ })).toHaveAttribute("href", "/roadmap");
  });

  test("shows a read-only empty-state route for viewers", async ({ page }) => {
    const unexpectedWrites = await openMockedImprove(page, "viewer", emptyPlan);

    await expect(page.getByTestId("empty-improvement-plan")).toContainText("Your improvement plan is clear");
    await expect(page.getByRole("link", { name: /View action tracker/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Plan a new action/ })).toHaveCount(0);
    expect(unexpectedWrites).toEqual([]);
  });
});
