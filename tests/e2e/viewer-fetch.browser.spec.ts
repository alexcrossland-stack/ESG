/**
 * Browser E2E: Viewer in-browser fetch → 403
 *
 * Verifies that a viewer who is authenticated in the browser cannot call
 * protected write endpoints directly via fetch() from the page context.
 * This tests that the same RBAC enforcement that blocks API calls also
 * applies when calls are made from within the browser (not just from curl).
 */
import { test, expect } from "@playwright/test";
import { VIEWER_STATE_FILE } from "./global-setup.js";

test.describe("Viewer in-browser fetch restrictions", () => {
  test("viewer fetch POST /api/data-entry from browser returns 403", async ({ browser }) => {
    const context = await browser.newContext({ storageState: VIEWER_STATE_FILE });
    const page = await context.newPage();

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (url.includes("/auth")) {
      test.skip(true, "Viewer storageState not persisted — skip fetch 403 test");
      await context.close();
      return;
    }

    const token = await page.evaluate(() => localStorage.getItem("auth_token"));

    if (!token) {
      test.skip(true, "No auth_token in localStorage — viewer storageState not set correctly");
      await context.close();
      return;
    }

    const result = await page.evaluate(async (authToken) => {
      const res = await fetch("/api/data-entry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`,
        },
        body: JSON.stringify({ metricId: "test", period: "2024-Q1", value: 1 }),
      });
      return { status: res.status };
    }, token);

    expect(result.status).toBe(403);

    await context.close();
  });

  test("viewer fetch PUT /api/metrics/:id/target from browser returns 403", async ({ browser }) => {
    const context = await browser.newContext({ storageState: VIEWER_STATE_FILE });
    const page = await context.newPage();

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (url.includes("/auth")) {
      test.skip(true, "Viewer storageState not persisted — skip fetch 403 test");
      await context.close();
      return;
    }

    const token = await page.evaluate(() => localStorage.getItem("auth_token"));

    if (!token) {
      test.skip(true, "No auth_token in localStorage — viewer storageState not set correctly");
      await context.close();
      return;
    }

    const result = await page.evaluate(async (authToken) => {
      const res = await fetch("/api/metrics/non-existent-id/target", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`,
        },
        body: JSON.stringify({ targetValue: 100, targetYear: 2030 }),
      });
      return { status: res.status };
    }, token);

    expect(result.status).toBe(403);

    await context.close();
  });

  test("viewer fetch POST /api/reports/generate from browser returns 403", async ({ browser }) => {
    const context = await browser.newContext({ storageState: VIEWER_STATE_FILE });
    const page = await context.newPage();

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    if (url.includes("/auth")) {
      test.skip(true, "Viewer storageState not persisted — skip fetch 403 test");
      await context.close();
      return;
    }

    const token = await page.evaluate(() => localStorage.getItem("auth_token"));

    if (!token) {
      test.skip(true, "No auth_token in localStorage — viewer storageState not set correctly");
      await context.close();
      return;
    }

    const result = await page.evaluate(async (authToken) => {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`,
        },
        body: JSON.stringify({ reportType: "management", period: "2024-Q1" }),
      });
      return { status: res.status };
    }, token);

    expect(result.status).toBe(403);

    await context.close();
  });
});
