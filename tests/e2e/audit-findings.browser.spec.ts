import { test, expect } from "@playwright/test";
import { seedTestTenants } from "../fixtures/seed.js";

let isolatedAdminToken = "";

test.describe.serial("Audit finding regressions", () => {
  test.beforeAll(async () => {
    const { tenantA } = await seedTestTenants();
    isolatedAdminToken = tenantA.adminToken;
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/auth");
    await page.evaluate((token: string) => {
      localStorage.setItem("auth_token", token);
    }, isolatedAdminToken);
  });

  test("guided data updates the dashboard within the same browser session", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("progress-sme-data-confidence")).toContainText("0%");

    await page.getByTestId("nav-enter-data").click();
    await expect(page.getByTestId("input-raw-electricity_kwh")).toBeVisible();
    await page.getByTestId("input-raw-electricity_kwh").fill("12500");
    await page.getByTestId("input-raw-employee_headcount").fill("40");

    const rawSaved = page.waitForResponse((response) =>
      response.request().method() === "POST" && response.url().endsWith("/api/raw-data"),
    );
    const recalculated = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && response.url().includes("/api/metrics/recalculate/"),
    );
    await page.getByTestId("button-save-recalculate").click();
    expect((await rawSaved).status()).toBe(200);
    expect((await recalculated).status()).toBe(200);
    await expect(page.getByTestId("button-save-recalculate")).toHaveText("Save data");

    await page.getByTestId("nav-dashboard").click();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(async () => {
      const text = await page.getByTestId("progress-sme-data-confidence").innerText();
      return Number(text.match(/(\d+)%/)?.[1] || 0);
    }).toBeGreaterThan(0);

    const readinessResponse = await page.request.get("/api/dashboard/readiness", {
      headers: { Authorization: `Bearer ${isolatedAdminToken}` },
    });
    expect(readinessResponse.status()).toBe(200);
    const readiness = await readinessResponse.json() as {
      dashboardState?: string;
      dataCompletenessPercent?: number;
      filledMetrics?: number;
    };
    expect(readiness.dashboardState).not.toBe("onboarding_complete_no_data");
    expect(readiness.dataCompletenessPercent || 0).toBeGreaterThan(0);
    expect(readiness.filledMetrics || 0).toBeGreaterThanOrEqual(2);

    await page.getByTestId("nav-enter-data").click();
    await expect(page.getByTestId("input-raw-electricity_kwh")).toHaveValue("12500");
    await page.getByTestId("input-raw-electricity_kwh").clear();
    await page.getByTestId("input-raw-employee_headcount").clear();
    const rawCleared = page.waitForResponse((response) =>
      response.request().method() === "POST" && response.url().endsWith("/api/raw-data"),
    );
    const clearRecalculated = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && response.url().includes("/api/metrics/recalculate/"),
    );
    await page.getByTestId("button-save-recalculate").click();
    expect((await rawCleared).status()).toBe(200);
    expect((await clearRecalculated).status()).toBe(200);

    await page.getByTestId("nav-dashboard").click();
    await expect.poll(async () => {
      const text = await page.getByTestId("progress-sme-data-confidence").innerText();
      return Number(text.match(/(\d+)%/)?.[1] || 0);
    }).toBe(0);
  });

  test("a recalculation failure truthfully preserves the successful raw save", async ({ page }) => {
    await page.route("**/api/metrics/recalculate/**", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Injected recalculation failure" }),
      });
    });
    await page.goto("/data-entry");
    await expect(page.getByTestId("input-raw-electricity_kwh")).toBeVisible();
    await page.getByTestId("input-raw-electricity_kwh").fill("321");

    const rawSaved = page.waitForResponse((response) =>
      response.request().method() === "POST" && response.url().endsWith("/api/raw-data"),
    );
    const recalculated = page.waitForResponse((response) =>
      response.request().method() === "POST" && response.url().includes("/api/metrics/recalculate/"),
    );
    await page.getByTestId("button-save-recalculate").click();
    expect((await rawSaved).status()).toBe(200);
    expect((await recalculated).status()).toBe(500);
    await expect(page.getByText("Recalculation failed", { exact: true })).toBeVisible();
    await expect(page.getByText("Data was saved but metrics couldn't be recalculated. Try clicking Save again.", { exact: true })).toBeVisible();
    await expect(page.getByText(/figures have been saved and metrics recalculated/i)).toHaveCount(0);

    const stored = await page.request.get(`/api/raw-data/${new Date().toISOString().slice(0, 7)}?siteId=null`, {
      headers: { Authorization: `Bearer ${isolatedAdminToken}` },
    });
    expect(stored.status()).toBe(200);
    const rows = await stored.json() as Array<{ inputName?: string; value?: string }>;
    expect(rows.some((row) => row.inputName === "electricity_kwh" && Number(row.value) === 321)).toBe(true);
  });

  test("company settings saves cleanly when optional profile fields are blank", async ({ page }) => {
    const profileReset = await page.request.put("/api/company", {
      headers: { Authorization: `Bearer ${isolatedAdminToken}` },
      data: {
        name: "Browser Settings Regression Company",
        industry: "Manufacturing",
        country: "United Kingdom",
        employeeCount: null,
        revenueBand: "£1m – £5m",
        locations: 1,
      },
    });
    expect(profileReset.status()).toBe(200);

    // Prime the dashboard caches before changing profile fields. These queries
    // use infinite stale time, so the settings mutation must explicitly mark
    // them stale for a same-session navigation to refresh them.
    await page.goto("/");
    await expect(page.getByTestId("progress-sme-data-confidence")).toBeVisible();
    await page.goto("/settings");
    await expect(page.getByTestId("input-company-name")).toHaveValue("Browser Settings Regression Company");
    await expect(page.getByTestId("input-employee-count")).toHaveValue("");
    await page.getByTestId("button-clear-industry").click();
    await page.getByTestId("button-clear-country").click();
    await page.getByTestId("button-clear-revenue").click();
    await page.getByTestId("input-employee-count").fill("0");
    await page.getByTestId("button-save-company").click();
    await expect(page.getByText("Company details updated", { exact: true })).toBeVisible();

    const companyResponse = await page.request.get("/api/company", {
      headers: { Authorization: `Bearer ${isolatedAdminToken}` },
    });
    expect(companyResponse.status()).toBe(200);
    const company = await companyResponse.json() as {
      industry?: string | null;
      country?: string | null;
      employeeCount?: number | null;
      revenueBand?: string | null;
    };
    expect(company.industry).toBeNull();
    expect(company.country).toBeNull();
    expect(company.revenueBand).toBeNull();
    expect(company.employeeCount).toBe(0);

    const readinessRefresh = page.waitForResponse((response) =>
      response.request().method() === "GET" && response.url().includes("/api/dashboard/readiness"),
    );
    await page.getByTestId("nav-dashboard").click();
    expect((await readinessRefresh).status()).toBe(200);
  });
});
