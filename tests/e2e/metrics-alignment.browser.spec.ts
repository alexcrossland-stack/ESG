import { test, expect } from "@playwright/test";
import fs from "fs";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")) as {
    tenantA: { adminToken: string };
  };
}

test.describe("Metrics surface alignment", () => {
  test("metrics page is the active metric view and metrics library hosts activation and creation controls", async ({ page }) => {
    const { tenantA } = readSeedInfo();

    await page.goto("/auth");
    await page.evaluate((token: string) => {
      localStorage.setItem("auth_token", token);
    }, tenantA.adminToken);

    await page.goto("/metrics");
    await expect(page.getByRole("heading", { name: "Metrics" })).toBeVisible();
    await expect(page.getByText("Metrics — what this page does")).toBeVisible();
    await expect(page.locator("[data-testid='button-add-custom-metric']")).toHaveCount(0);

    await page.goto("/metrics-library");
    await expect(page.getByRole("heading", { name: "Metrics Library" })).toBeVisible();
    await expect(page.locator("[data-testid='button-library-add-metric']")).toHaveCount(1);
    await expect(page.locator("[data-testid^='button-enter-value-']")).toHaveCount(0);
  });

  test("enabled metric count matches Metrics rows and Enter Data denominator", async ({ page }) => {
    const { tenantA } = readSeedInfo();

    await page.goto("/auth");
    await page.evaluate((token: string) => {
      localStorage.setItem("auth_token", token);
    }, tenantA.adminToken);

    await page.goto("/metrics-library");
    await expect(page.locator("[data-testid='stat-active']")).toBeVisible();
    const enabledLibraryCount = Number((await page.locator("[data-testid='stat-active']").textContent()) || "0");
    const editableMetricCount = await page.evaluate(async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/data-entry/2024-01", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`data-entry status ${res.status}`);
      const body = await res.json() as { metrics?: Array<{ metricType?: string | null; enabled?: boolean | null }> };
      return (body.metrics || []).filter((metric) => metric.enabled !== false && (!metric.metricType || metric.metricType === "manual")).length;
    });

    await page.goto("/metrics");
    await expect(page.locator("[data-testid='badge-metric-count']")).toBeVisible();
    const metricsBadgeText = (await page.locator("[data-testid='badge-metric-count']").textContent()) || "";
    const metricsBadgeCount = Number(metricsBadgeText.split(" ")[0] || "0");
    expect(metricsBadgeCount).toBe(enabledLibraryCount);
    await expect(page.locator("[data-testid^='metric-row-']")).toHaveCount(enabledLibraryCount);
    const metricNames = await page.locator("[data-testid^='metric-row-'] .font-medium").allTextContents();
    expect(new Set(metricNames).size).toBe(metricNames.length);

    await page.goto("/data-entry");
    await expect(page.getByTestId("raw-field-electricity_kwh")).toBeVisible();
    await page.getByTestId("tab-manual-entry").click();
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
});
