import { expect, test, type Page } from "@playwright/test";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

function parseJson<T>(response: { status: number; body: string }, context: string): T {
  expect(response.status, `${context} body=${response.body.slice(0, 500)}`).toBeGreaterThanOrEqual(200);
  expect(response.status, `${context} body=${response.body.slice(0, 500)}`).toBeLessThan(300);
  return JSON.parse(response.body) as T;
}

async function chooseOption(page: Page, testId: string, name: string | RegExp) {
  await page.getByTestId(testId).click();
  await page.getByRole("option", { name }).click();
}

test("Carbon Estimator saves an explicit organisation or site boundary", async ({ page }) => {
  const { tenantA } = await seedTestTenants();
  const siteName = `Carbon Browser Site ${Date.now()}`;
  const site = parseJson<{ id: string }>(
    await apiRequest("POST", "/api/sites", { name: siteName, type: "office", country: "United Kingdom" }, tenantA.adminToken),
    "POST /api/sites",
  );

  await page.addInitScript((token) => localStorage.setItem("auth_token", token), tenantA.adminToken);
  await page.goto("/carbon-calculator");
  await expect(page.getByTestId("text-page-title")).toHaveText("Carbon Estimator");
  await expect(page.getByTestId("select-carbon-scope")).toContainText("Organisation-wide");

  await page.getByTestId("input-electricity").fill("100");
  const organisationRequest = page.waitForRequest((request) =>
    request.method() === "POST" && new URL(request.url()).pathname === "/api/carbon/calculate",
  );
  const organisationResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/carbon/calculate",
  );
  await page.getByTestId("button-calculate").click();
  expect((await organisationRequest).postDataJSON()).toMatchObject({ siteId: null });
  expect((await organisationResponse).status()).toBe(200);
  await expect(page.getByTestId("card-total")).toBeVisible();

  await chooseOption(page, "select-carbon-scope", siteName);
  await expect(page.getByTestId("select-carbon-scope")).toContainText(siteName);
  const siteRequest = page.waitForRequest((request) =>
    request.method() === "POST" && new URL(request.url()).pathname === "/api/carbon/calculate",
  );
  const siteResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/carbon/calculate",
  );
  await page.getByTestId("button-calculate").click();
  expect((await siteRequest).postDataJSON()).toMatchObject({ siteId: site.id });
  expect((await siteResponse).status()).toBe(200);
  await expect(page.getByTestId("card-total")).toBeVisible();
});
