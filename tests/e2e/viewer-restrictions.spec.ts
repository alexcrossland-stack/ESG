/**
 * E2E: Viewer restrictions — write UI absent/disabled, API returns 403
 *
 * Uses the Tenant A viewer and admin tokens from the shared seed (global-setup)
 * to test role-based access control without per-test user creation.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync("tests/e2e/.auth/seed-info.json", "utf-8")) as {
    tenantA: { adminToken: string; viewerToken: string };
  };
}

test.describe("Viewer restrictions", () => {
  test("viewer is blocked from all write endpoints (403)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const adminMetricsRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    const metrics = await adminMetricsRes.json();
    const metricId = metrics[0]?.id ?? "00000000-0000-0000-0000-000000000000";
    const definitionsRes = await request.get("/api/metric-definitions", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(definitionsRes.status()).toBe(200);
    const definitions = await definitionsRes.json();
    const definitionId = definitions[0]?.id ?? "00000000-0000-0000-0000-000000000000";

    const writeEndpoints = [
      { method: "POST" as const, path: "/api/data-entry", body: { metricId, period: "2024-Q1", value: 99 } },
      { method: "POST" as const, path: "/api/metrics", body: { name: "Viewer metric", category: "environmental" } },
      { method: "PUT" as const, path: `/api/metrics/${metricId}/target`, body: { targetValue: 100, targetYear: 2030 } },
      { method: "POST" as const, path: "/api/reports/generate", body: { reportType: "management", period: "2024-Q1" } },
      { method: "PUT" as const, path: "/api/company/settings", body: { reportingFrequency: "quarterly" } },
    ];

    for (const { method, path, body } of writeEndpoints) {
      const res = method === "PUT"
        ? await request.put(path, { data: body, headers: { Authorization: `Bearer ${tenantA.viewerToken}` } })
        : await request.post(path, { data: body, headers: { Authorization: `Bearer ${tenantA.viewerToken}` } });
      expect(res.status()).toBe(403);
    }

    const toggleRes = await request.patch(`/api/metric-definitions/${definitionId}/toggle`, {
      headers: { Authorization: `Bearer ${tenantA.viewerToken}` },
    });
    expect(toggleRes.status()).toBe(403);
  });

  test("viewer can read metrics (200) but not write (403)", async ({ request }) => {
    const { tenantA } = readSeedInfo();

    const readRes = await request.get("/api/metrics", {
      headers: { Authorization: `Bearer ${tenantA.viewerToken}` },
    });
    expect(readRes.status()).toBe(200);

    const metrics = await readRes.json();
    const metricId = metrics[0]?.id ?? "00000000-0000-0000-0000-000000000000";

    const writeRes = await request.post("/api/data-entry", {
      data: { metricId, period: "2024-Q1", value: 1 },
      headers: { Authorization: `Bearer ${tenantA.viewerToken}` },
    });
    expect(writeRes.status()).toBe(403);
  });

  test("viewer sees read-only metric management with no creation or platform seeding controls", async ({ page }) => {
    const { tenantA } = readSeedInfo();

    await page.goto("/auth");
    await page.evaluate((token: string) => localStorage.setItem("auth_token", token), tenantA.viewerToken);
    await page.goto("/metrics-library");

    await expect(page).toHaveURL(/\/data-entry\?manage=metrics$/);
    await expect(page.getByTestId("panel-manage-metrics")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Manage metrics" })).toBeVisible();
    await expect(page.getByText(/Your role has read-only access to this catalogue\./)).toBeVisible();
    await page.getByTestId("button-expand-all-metric-categories").click();
    const activationSwitches = page.locator("[data-testid^='toggle-metric-']");
    expect(await activationSwitches.count()).toBeGreaterThan(0);
    await expect(activationSwitches.first()).toBeDisabled();
    await expect(page.getByTestId("button-library-add-metric")).toHaveCount(0);
    await expect(page.getByTestId("button-seed-metrics")).toHaveCount(0);
  });
});
