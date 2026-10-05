import { expect, test } from "@playwright/test";
import { seedTestTenants } from "../fixtures/seed.js";

test("app shell boots without blank-page runtime errors", async ({ page }) => {
  const runtimeErrors: string[] = [];
  let signedOutMfaStatusRequests = 0;

  page.on("pageerror", (error) => {
    runtimeErrors.push(error.stack || error.message);
  });
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthorized" }),
    });
  });
  await page.route("**/api/auth/mfa/status", async (route) => {
    signedOutMfaStatusRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mfaEnabled: false }),
    });
  });

  // The app intentionally polls for background data, so networkidle is not a
  // reliable readiness signal. The rendered root is the user-visible check.
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#root")).not.toBeEmpty();
  expect(runtimeErrors).toEqual([]);
  expect(signedOutMfaStatusRequests).toBe(0);
});

test("Overview reporting month and year update the workspace and survive reload", async ({ page }) => {
  const { tenantA } = await seedTestTenants();
  const runtimeErrors: string[] = [];
  const overviewPeriods: string[] = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === "/api/dashboard/enhanced") overviewPeriods.push(url.searchParams.get("period") || "");
  });
  await page.goto("/auth");
  await page.getByTestId("input-email").fill(tenantA.adminEmail);
  await page.getByTestId("input-password").fill("Test1234!");
  await page.getByTestId("button-login").click();
  const month = page.getByRole("combobox", { name: "Overview reporting month", exact: true });
  const year = page.getByRole("combobox", { name: "Overview reporting year", exact: true });
  await expect(month).toBeEnabled();
  await year.selectOption("2025");
  await month.selectOption("2025-12");
  await expect(page.getByTestId("reporting-context-strip")).toContainText("December 2025");
  await expect(page.getByTestId("overview-period-notice")).toContainText("Reviewing December 2025");
  await expect.poll(() => overviewPeriods).toContain("2025-12");
  await page.reload();
  await expect(month).toHaveValue("2025-12");
  await expect(year).toHaveValue("2025");
  await page.goto("/data-entry");
  await expect(page.getByTestId("select-period")).toContainText("December 2025");
  await page.goto("/");
  await month.selectOption("2025-01");
  await year.selectOption("2099");
  await expect(month).toHaveValue("2099-01");
  await expect(page.getByTestId("overview-period-notice")).toContainText("Planning for January 2099");
  await expect.poll(() => overviewPeriods).toContain("2099-01");
  await page.getByTestId("button-overview-current-month").click();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  await expect(month).toHaveValue(currentMonth);
  await expect(year).toHaveValue(String(now.getFullYear()));
  await expect(page.getByTestId("overview-period-notice")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(month).toBeVisible();
  await expect(year).toBeVisible();
  for (const control of [month, year]) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  await month.focus();
  await page.keyboard.press("Tab");
  await expect(year).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});
