import { expect, test } from "@playwright/test";

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
