/**
 * Browser regression: billing-disabled launch mode.
 *
 * Verifies Stripe can be intentionally unset without exposing active upgrade
 * actions in Settings or Billing UI.
 */

import { expect, test } from "@playwright/test";
import fs from "fs";
import { ADMIN_STATE_FILE, SEED_INFO_FILE } from "./global-setup.js";

function readSeedInfo() {
  return JSON.parse(fs.readFileSync(SEED_INFO_FILE, "utf-8")) as {
    tenantA: {
      adminToken: string;
    };
  };
}

test.describe("Billing-disabled browser safeguards", () => {
  test("Settings and Billing UI disable subscription actions when Stripe is unset", async ({ browser, request }) => {
    const { tenantA } = readSeedInfo();
    const status = await request.get("/api/billing/status", {
      headers: { Authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(status.status()).toBe(200);
    const billing = await status.json() as { billingEnabled?: boolean };
    expect(billing.billingEnabled).toBe(false);

    const context = await browser.newContext({ storageState: ADMIN_STATE_FILE });
    const page = await context.newPage();

    await page.goto("/settings");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByTestId("card-your-plan")).toBeVisible();
    await expect(page.getByTestId("button-manage-plan")).toBeDisabled();
    await expect(page.getByTestId("button-manage-plan")).toContainText("Billing unavailable");
    await expect(page.getByTestId("text-billing-disabled-note")).toBeVisible();

    await page.goto("/billing");
    await expect(page.getByTestId("banner-billing-disabled")).toBeVisible();

    const disabledActionIds = [
      "button-upgrade-pro",
      "button-upgrade-pro-bottom",
      "button-cancel-subscription",
      "button-resubscribe",
    ];
    let matchedAction = false;
    for (const testId of disabledActionIds) {
      const action = page.getByTestId(testId);
      if (await action.count() === 0) continue;
      matchedAction = true;
      await expect(action).toBeDisabled();
      await expect(action).toContainText("Billing unavailable");
    }
    expect(matchedAction).toBe(true);

    await context.close();
  });
});
