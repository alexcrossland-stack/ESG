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
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Metrics" })).toBeVisible();
    await expect(page.getByText("Metrics — what this page does")).toBeVisible();
    await expect(page.locator("[data-testid='button-add-custom-metric']")).toHaveCount(0);

    await page.goto("/metrics-library");
    await page.waitForLoadState("networkidle");
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
    await page.waitForLoadState("networkidle");
    const enabledLibraryCount = Number((await page.locator("[data-testid='stat-active']").textContent()) || "0");

    await page.goto("/metrics");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid^='metric-row-']")).toHaveCount(enabledLibraryCount);

    await page.goto("/data-entry");
    await page.waitForLoadState("networkidle");
    const denominatorText = (await page.locator("[data-testid='badge-enabled-metric-denominator']").textContent()) || "";
    const denominator = Number(denominatorText.split(" ")[0] || "0");
    expect(denominator).toBe(enabledLibraryCount);
    await expect(page.locator("[data-testid^='manual-row-']")).toHaveCount(enabledLibraryCount);
  });
});
