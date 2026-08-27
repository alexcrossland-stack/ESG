import { test, expect, type Page } from "@playwright/test";

type RoadmapItem = {
  id: string;
  title: string;
  description?: string;
  targetLabel?: string;
  dueDate?: string;
  status: "planned" | "in_progress" | "blocked" | "completed";
  owner?: string;
  category?: string;
};

async function openMockedApp(page: Page, path = "/roadmap") {
  let items: RoadmapItem[] = [
    {
      id: "roadmap-1",
      title: "Set environmental data owners",
      description: "Assign clear accountability for monthly data collection.",
      targetLabel: "Month 1",
      status: "planned",
      owner: "Operations",
      category: "data",
    },
  ];

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
        user: { id: "mock-admin", username: "Admin", email: "admin@example.test", role: "admin", companyId: "mock-company" },
        company: { id: "mock-company", name: "Mock Company", onboardingComplete: true, lifecycleState: "active" },
        defaultLandingContext: "company",
        portfolioGroups: [],
      });
    }
    if (apiPath === "/api/company/esg-profile") {
      return json({
        company: { name: "Mock Company", industry: "Manufacturing", employeeCount: 42 },
        reporting_period: { period: "FY2025", label: "FY2025", source: "active", hasActivePeriod: true },
        esg_scores: { environmental: 80, social: 60, governance: 70, overall: 70 },
        key_metrics: [{ id: "metric-1", name: "Electricity usage", value: "4990.00", hasValue: true, unit: "kWh", category: "environmental" }],
        shareSettings: { enabled: false, token: null, visibleSections: [] },
      });
    }
    if (apiPath === "/api/reporting-periods") return json([{ id: "period-1", name: "FY2025", status: "open" }]);
    if (apiPath === "/api/notifications/count") return json({ count: 0 });
    if (apiPath === "/api/programme/status") return json({ nextBestActions: [] });
    if (apiPath === "/api/sites") return json([]);
    if (apiPath === "/api/admin/impersonation/status") return json({ isImpersonating: false });
    if (apiPath === "/api/activity/track" && method === "POST") return json({ ok: true });

    if (apiPath === "/api/esg/roadmap" && method === "GET") {
      return json({ roadmap: { items, generatedAt: "2026-05-09T09:00:00.000Z", updatedAt: "2026-05-09T09:00:00.000Z" } });
    }
    if (apiPath === "/api/esg/roadmap/items" && method === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      const item = { id: "roadmap-2", ...body };
      items = [...items, item];
      return json({ item, roadmap: { items } }, 201);
    }
    if (apiPath.startsWith("/api/esg/roadmap/items/") && method === "PATCH") {
      const id = apiPath.split("/").pop() || "";
      const body = JSON.parse(route.request().postData() || "{}");
      items = items.map(item => item.id === id ? { ...item, ...body } : item);
      return json({ item: items.find(item => item.id === id), roadmap: { items } });
    }
    if (apiPath.startsWith("/api/esg/roadmap/items/") && method === "DELETE") {
      const id = apiPath.split("/").pop() || "";
      items = items.filter(item => item.id !== id);
      return json({ ok: true, roadmap: { items } });
    }

    return json([]);
  });

  await page.addInitScript(() => localStorage.setItem("auth_token", "mock-token"));
  await page.goto(path);
  await page.waitForLoadState("domcontentloaded");
}

test.describe("ESG Roadmap page", () => {
  test("ESG Profile no longer renders the 12 Month Roadmap section", async ({ page }) => {
    await openMockedApp(page, "/esg-profile");

    await expect(page.getByTestId("text-profile-title")).toBeVisible();
    await expect(page.getByText("12-Month ESG Roadmap")).toHaveCount(0);
    await expect(page.getByTestId("card-roadmap")).toHaveCount(0);
  });

  test("Roadmap page renders items and supports add, edit, and delete", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    page.on("dialog", dialog => dialog.accept());
    await openMockedApp(page);

    await expect(page.getByTestId("page-roadmap")).toBeVisible();
    await expect(page.getByTestId("roadmap-item-roadmap-1")).toContainText("Set environmental data owners");
    await expect(page.getByTestId("roadmap-status-count-planned")).toHaveText("1");

    await page.getByTestId("button-add-roadmap-item").click();
    await page.getByTestId("input-roadmap-title").fill("Complete supplier ESG review");
    await page.getByTestId("textarea-roadmap-description").fill("Review top suppliers against ESG expectations.");
    await page.getByTestId("input-roadmap-target").fill("Q2");
    await page.getByTestId("input-roadmap-owner").fill("Procurement");
    await page.getByTestId("select-roadmap-status").click();
    await page.getByRole("option", { name: "In progress" }).click();
    await page.getByTestId("button-save-roadmap-item").click();

    await expect(page.getByTestId("roadmap-item-roadmap-2")).toContainText("Complete supplier ESG review");
    await expect(page.getByTestId("roadmap-status-count-in_progress")).toHaveText("1");

    await page.getByTestId("button-edit-roadmap-item-roadmap-2").click();
    await page.getByTestId("input-roadmap-title").fill("Complete supplier ESG review and evidence");
    await page.getByTestId("select-roadmap-status").click();
    await page.getByRole("option", { name: "Completed" }).click();
    await page.getByTestId("button-save-roadmap-item").click();

    await expect(page.getByTestId("roadmap-item-roadmap-2")).toContainText("Complete supplier ESG review and evidence");
    await expect(page.getByTestId("roadmap-status-count-completed")).toHaveText("1");

    await page.getByTestId("button-delete-roadmap-item-roadmap-2").click();
    await expect(page.getByTestId("roadmap-item-roadmap-2")).toHaveCount(0);
    await expect(page.getByTestId("roadmap-status-count-completed")).toHaveText("0");
  });
});
