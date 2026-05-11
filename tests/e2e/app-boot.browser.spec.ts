import { expect, test } from "@playwright/test";

test("app shell boots without blank-page runtime errors", async ({ page }) => {
  const runtimeErrors: string[] = [];

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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mfaEnabled: false }),
    });
  });

  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.locator("#root")).not.toBeEmpty();
  expect(runtimeErrors).toEqual([]);
});
