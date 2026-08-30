import { test, expect } from "@playwright/test";
import fs from "fs";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")) as {
    tenantA: { adminToken: string };
  };
}

test.describe("Metrics surface alignment", () => {
  test("bare metrics and library routes resolve to the unified workspace while a metric query opens history", async ({ page }) => {
    const { tenantA } = readSeedInfo();

    await page.goto("/auth");
    await page.evaluate((token: string) => {
      localStorage.setItem("auth_token", token);
    }, tenantA.adminToken);

    await page.goto("/metrics");
    await expect(page).toHaveURL(/\/data-entry$/);
    await expect(page.getByRole("heading", { name: "Metrics & data", exact: true })).toBeVisible();
    const metricId = await page.evaluate(async () => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch("/api/metrics", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error(`metrics status ${response.status}`);
      const metrics = await response.json() as Array<{ id: string; enabled?: boolean }>;
      const metric = metrics.find((candidate) => candidate.enabled !== false);
      if (!metric) throw new Error("expected at least one enabled metric");
      return metric.id;
    });

    await page.goto(`/metrics?metric=${encodeURIComponent(metricId)}&period=2026-08&metricPeriod=2026-08&siteId=__org__`);
    await expect(page).toHaveURL(new RegExp(`/metrics\\?metric=${metricId}`));
    await expect(page.locator("h1").filter({ hasText: /^Metrics$/ })).toBeVisible();
    await expect(page.getByText("Metrics — what this page does")).toBeVisible();
    await expect(page.getByTestId("button-back-to-metrics-data-history")).toBeVisible();
    await expect(page.getByTestId("badge-metric-count")).toBeVisible();
    await expect.poll(async () => page.locator("[data-testid^='metric-row-']").count()).toBeGreaterThan(0);
    await expect(page.getByTestId("panel-manage-metrics")).toHaveCount(0);
    await expect(page.getByTestId("button-library-add-metric")).toHaveCount(0);

    await page.goto("/metrics-library");
    await expect(page).toHaveURL(/\/data-entry\?manage=metrics$/);
    await expect(page.getByTestId("panel-manage-metrics")).toBeVisible();
    await expect(page.getByTestId("button-back-to-metrics-data")).toBeVisible();
    await expect(page.getByTestId("heading-metrics-library")).toHaveCount(0);
    await expect(page.getByTestId("button-library-add-metric")).toHaveCount(1);
    await expect(page.locator("[data-testid^='button-enter-value-']")).toHaveCount(0);

    await page.getByTestId("button-expand-all-metric-categories").click();
    const alignmentResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/framework-alignment"),
    );
    await page.locator("[data-testid^='button-framework-alignment-']").first().click();
    const alignmentResponse = await alignmentResponsePromise;
    expect(alignmentResponse.status()).toBe(200);
    await expect(page.getByText("Framework alignment could not be loaded. Try again.")).toHaveCount(0);
  });

  test("custom metric dialog blocks a whitespace-only name and reports a server rejection", async ({ page }) => {
    const { tenantA } = readSeedInfo();

    await page.goto("/auth");
    await page.evaluate((token: string) => localStorage.setItem("auth_token", token), tenantA.adminToken);
    await page.goto("/metrics-library");
    await expect(page).toHaveURL(/\/data-entry\?manage=metrics$/);
    await expect(page.getByTestId("panel-manage-metrics")).toBeVisible();

    await page.getByTestId("button-library-add-metric").click();
    await page.getByTestId("input-metric-name").fill("   ");
    await page.getByTestId("button-add-metric").click();

    await expect(page.getByText("Metric name is required", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.route("**/api/metrics", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "A metric with this name already exists" }),
      });
    });
    await page.getByTestId("input-metric-name").fill("Duplicate metric");
    await page.getByTestId("button-add-metric").click();
    await expect(page.getByTestId("error-add-metric")).toHaveText("A metric with this name already exists");
    await expect(page.getByText("Metric not added", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("same-name calculated company metrics retain their classification in the library", async ({ page, request }) => {
    const { tenantA } = readSeedInfo();
    const headers = { Authorization: `Bearer ${tenantA.adminToken}` };
    const [metricsResponse, definitionsResponse] = await Promise.all([
      request.get("/api/metrics", { headers }),
      request.get("/api/metric-definitions", { headers }),
    ]);
    expect(metricsResponse.status()).toBe(200);
    expect(definitionsResponse.status()).toBe(200);

    const metrics = await metricsResponse.json() as Array<{ name: string; metricType?: string | null; formulaText?: string | null }>;
    const definitions = await definitionsResponse.json() as Array<{ name: string }>;
    const definitionNames = new Set(definitions.map((definition) => definition.name.trim().toLowerCase()));
    const calculatedMetric = metrics.find((metric) =>
      metric.metricType === "calculated" && definitionNames.has(metric.name.trim().toLowerCase()),
    );
    expect(calculatedMetric, "expected a calculated company metric matching a library definition").toBeTruthy();

    await page.goto("/auth");
    await page.evaluate((token: string) => localStorage.setItem("auth_token", token), tenantA.adminToken);
    await page.goto("/metrics-library");
    await expect(page).toHaveURL(/\/data-entry\?manage=metrics$/);
    await expect(page.getByTestId("panel-manage-metrics")).toBeVisible();
    await page.getByTestId("button-expand-all-metric-categories").click();

    const metricCard = page.locator("[data-testid^='card-metric-']").filter({
      has: page.getByText(calculatedMetric!.name, { exact: true }),
    }).first();
    await expect(metricCard).toBeVisible();
    await expect(metricCard.locator("[data-testid^='badge-metric-classification-']")).toHaveText("Calculated");
    if (calculatedMetric!.formulaText) {
      await expect(metricCard.locator("[data-testid^='text-metric-formula-']")).toContainText(calculatedMetric!.formulaText);
    }
  });

  test("enabled metric count matches scoped history rows and Enter Data denominator", async ({ page }) => {
    const { tenantA } = readSeedInfo();

    await page.goto("/auth");
    await page.evaluate((token: string) => {
      localStorage.setItem("auth_token", token);
    }, tenantA.adminToken);

    await page.goto("/metrics-library");
    await expect(page).toHaveURL(/\/data-entry\?manage=metrics$/);
    await expect(page.getByTestId("panel-manage-metrics")).toBeVisible();
    await expect(page.locator("[data-testid='stat-active']")).toBeVisible();
    const enabledLibraryCount = Number((await page.locator("[data-testid='stat-active']").textContent()) || "0");
    const { editableMetricCount, historyMetricId } = await page.evaluate(async () => {
      const token = localStorage.getItem("auth_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [entryResponse, metricsResponse] = await Promise.all([
        fetch("/api/data-entry/2024-01", { headers }),
        fetch("/api/metrics", { headers }),
      ]);
      if (!entryResponse.ok) throw new Error(`data-entry status ${entryResponse.status}`);
      if (!metricsResponse.ok) throw new Error(`metrics status ${metricsResponse.status}`);
      const body = await entryResponse.json() as { metrics?: Array<{ metricType?: string | null; enabled?: boolean | null }> };
      const metrics = await metricsResponse.json() as Array<{ id: string; enabled?: boolean | null }>;
      const enabledMetric = metrics.find((metric) => metric.enabled !== false);
      if (!enabledMetric) throw new Error("expected an enabled metric for history routing");
      return {
        editableMetricCount: (body.metrics || []).filter((metric) => metric.enabled !== false && (!metric.metricType || metric.metricType === "manual")).length,
        historyMetricId: enabledMetric.id,
      };
    });

    await page.goto(`/metrics?metric=${encodeURIComponent(historyMetricId)}&period=2024-01&metricPeriod=2024-01&siteId=__org__`);
    await expect(page).toHaveURL(new RegExp(`/metrics\\?metric=${historyMetricId}`));
    await expect(page.locator("h1").filter({ hasText: /^Metrics$/ })).toBeVisible();
    await expect(page.getByTestId("button-back-to-metrics-data-history")).toBeVisible();
    await expect(page.getByTestId("badge-metric-count")).toBeVisible();
    const metricsBadgeText = (await page.getByTestId("badge-metric-count").textContent()) || "";
    const metricsBadgeCount = Number(metricsBadgeText.split(" ")[0] || "0");
    expect(metricsBadgeCount).toBe(enabledLibraryCount);
    await expect(page.locator("[data-testid^='metric-row-']")).toHaveCount(enabledLibraryCount);
    const metricNames = await page.locator("[data-testid^='metric-row-'] p.truncate.font-medium").allTextContents();
    expect(new Set(metricNames).size).toBe(metricNames.length);

    await page.goto("/data-entry?mode=manual");
    await expect(page.locator("[data-testid='badge-enabled-metric-denominator']")).toBeVisible();
    const denominatorText = (await page.locator("[data-testid='badge-enabled-metric-denominator']").textContent()) || "";
    const denominator = Number(denominatorText.split(" ")[0] || "0");
    expect(denominator).toBe(editableMetricCount);
    await expect(page.locator("[data-testid^='manual-row-']")).toHaveCount(editableMetricCount);

    await page.goto("/evidence");
    await expect(page.getByTestId("tab-evidence-coverage")).toBeVisible();
    await page.getByTestId("tab-evidence-coverage").click();
    const evidenceRows = page.locator("[data-testid^='row-metric-coverage-']");
    await expect(evidenceRows).toHaveCount(enabledLibraryCount);
  });

  test("metrics library starts simple, reveals relevant results, and labels its create dialog", async ({ page }) => {
    const { tenantA } = readSeedInfo();
    const accessibilityWarnings: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      if (/missing description|aria-describedby|externalized for browser compatibility/i.test(text)) {
        accessibilityWarnings.push(text);
      }
    });

    await page.goto("/auth");
    await page.evaluate((token: string) => {
      localStorage.setItem("auth_token", token);
    }, tenantA.adminToken);

    await page.goto("/metrics-library");
    await expect(page).toHaveURL(/\/data-entry\?manage=metrics$/);
    await expect(page.getByTestId("panel-manage-metrics")).toBeVisible();
    await expect(page.getByTestId("heading-metrics-library")).toHaveCount(0);
    const categoryGroups = page.locator("[data-testid^='group-category-']");
    await expect(categoryGroups.first()).toBeVisible();
    await expect(page.locator("[data-testid^='group-category-'][data-state='open']")).toHaveCount(0);
    await expect(page.locator("[data-testid^='card-metric-']:visible")).toHaveCount(0);

    await page.getByTestId("button-expand-all-metric-categories").click();
    await expect.poll(async () => page.locator("[data-testid^='card-metric-']:visible").count()).toBeGreaterThan(0);
    const priorityOrderInEveryCategory = await categoryGroups.evaluateAll((groups) => groups.every((group) => {
      const cards = Array.from(group.querySelectorAll<HTMLElement>("[data-testid^='card-metric-']"));
      const ranks = cards.map((card) => {
        const enabled = card.querySelector<HTMLElement>("[data-testid^='toggle-metric-']")?.getAttribute("data-state") === "checked";
        const recommended = Boolean(card.querySelector("[data-testid^='badge-core-']"));
        return Number(enabled) * 2 + Number(recommended);
      });
      return ranks.every((rank, index) => index === 0 || ranks[index - 1] >= rank);
    }));
    expect(priorityOrderInEveryCategory).toBe(true);

    await page.getByTestId("button-collapse-all-metric-categories").click();
    await expect(page.locator("[data-testid^='card-metric-']:visible")).toHaveCount(0);

    const search = page.getByTestId("input-search-metrics");
    await search.fill("Electricity Consumption");
    await expect(page.getByText("Electricity Consumption", { exact: true }).first()).toBeVisible();
    const visibleMetricNames = await page.locator("[data-testid^='text-metric-name-']:visible").allTextContents();
    expect(visibleMetricNames.length).toBeGreaterThan(0);
    expect(visibleMetricNames.every((name) => name.toLowerCase().includes("electricity consumption"))).toBe(true);
    await expect(page.getByTestId("button-expand-all-metric-categories")).toBeDisabled();
    await search.clear();

    await page.getByTestId("button-library-add-metric").click();
    const dialog = page.getByRole("dialog", { name: "Add Custom Metric" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription(/Define a metric your company can measure and track/i);
    await page.keyboard.press("Escape");

    await page.goto("/policy-templates");
    await expect(page.getByRole("heading", { name: "Policy Templates" })).toBeVisible();

    expect(accessibilityWarnings).toEqual([]);
  });
});
