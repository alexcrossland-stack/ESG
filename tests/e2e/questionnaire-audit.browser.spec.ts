import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

let adminToken = "";
let viewerToken = "";
let siteId = "";
let siteName = "";
let alternateSiteId = "";
let alternateSiteName = "";
let reportingPeriodId = "";
let reportingPeriodName = "";
let alternateReportingPeriodId = "";
let alternateReportingPeriodName = "";
let questionnaireId = "";
let questionnaireTitle = "";

function parseBody<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

async function authenticate(page: Page, token: string) {
  await page.goto("/auth");
  await page.evaluate((authToken: string) => {
    localStorage.setItem("auth_token", authToken);
  }, token);
}

test.describe.serial("Questionnaire audit regressions", () => {
  test.beforeAll(async () => {
    const { tenantA } = await seedTestTenants();
    adminToken = tenantA.adminToken;
    viewerToken = tenantA.viewerToken;

    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        "UPDATE companies SET plan_tier = 'pro', plan_status = 'active' WHERE id = $1",
        [tenantA.companyId],
      );
    } finally {
      await client.end();
    }

    const suffix = `${Date.now()}-${process.pid}`;
    siteName = `Browser Questionnaire Site ${suffix}`;
    const site = await apiRequest("POST", "/api/sites", {
      name: siteName,
      type: "office",
      country: "GB",
    }, adminToken);
    expect(site.status).toBe(201);
    siteId = parseBody<{ id: string }>(site).id;

    alternateSiteName = `Browser Questionnaire Alternate Site ${suffix}`;
    const alternateSite = await apiRequest("POST", "/api/sites", {
      name: alternateSiteName,
      type: "office",
      country: "GB",
    }, adminToken);
    expect(alternateSite.status).toBe(201);
    alternateSiteId = parseBody<{ id: string }>(alternateSite).id;

    reportingPeriodName = `Browser Questionnaire FY ${suffix}`;
    const reportingPeriod = await apiRequest("POST", "/api/reporting-periods", {
      name: reportingPeriodName,
      periodType: "annual",
      startDate: "2188-01-01",
      endDate: "2188-12-31",
    }, adminToken);
    expect(reportingPeriod.status).toBe(201);
    reportingPeriodId = parseBody<{ id: string }>(reportingPeriod).id;

    alternateReportingPeriodName = `Browser Questionnaire FY Alternate ${suffix}`;
    const alternateReportingPeriod = await apiRequest("POST", "/api/reporting-periods", {
      name: alternateReportingPeriodName,
      periodType: "annual",
      startDate: "2189-01-01",
      endDate: "2189-12-31",
    }, adminToken);
    expect(alternateReportingPeriod.status).toBe(201);
    alternateReportingPeriodId = parseBody<{ id: string }>(alternateReportingPeriod).id;
    questionnaireTitle = `Browser Autofill ${suffix}`;
  });

  test("create, autofill, open result, and truthfully report a partial submission", async ({ page }) => {
    await authenticate(page, adminToken);
    await page.goto("/questionnaire");
    await expect(page.getByRole("heading", { name: "Questionnaire Autofill" })).toBeVisible();

    await expect(page.getByTestId("response-generator-scope")).toBeVisible();
    await page.getByTestId("select-response-generator-site").click();
    await page.getByRole("option", { name: siteName, exact: true }).click();
    await page.getByTestId("select-response-generator-reporting-period").click();
    await page.getByRole("option", { name: `${reportingPeriodName} (open)`, exact: true }).click();
    await page.getByTestId("textarea-questionnaire-input").fill("What are your carbon emissions?");
    let releaseFirstResponse!: () => void;
    const firstResponseGate = new Promise<void>((resolve) => { releaseFirstResponse = resolve; });
    let generationCount = 0;
    await page.route("**/api/questionnaires/generate-responses", async (route) => {
      generationCount += 1;
      const request = route.request().postDataJSON() as {
        text: string;
        siteId: string;
        reportingPeriodId: string;
      };
      expect(request.text).toBe("What are your carbon emissions?");
      if (generationCount === 1) await firstResponseGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          siteId: request.siteId,
          reportingPeriodId: request.reportingPeriodId,
          total: 1,
          questions: [{
            question: "What are your carbon emissions?",
            suggestedAnswer: "Scoped response",
            confidence: "high",
            source: "Carbon Calculator",
          }],
        }),
      });
    });
    await page.getByTestId("button-generate-ai-responses").click();
    await expect(page.getByTestId("select-response-generator-site")).toBeDisabled();
    await expect(page.getByTestId("select-response-generator-reporting-period")).toBeDisabled();
    await expect(page.getByTestId("textarea-questionnaire-input")).toBeDisabled();
    releaseFirstResponse();
    await expect(page.getByTestId("section-generated-responses")).toBeVisible();
    await expect(page.getByTestId("text-response-generator-result-scope")).toHaveText(
      `Generated for ${siteName} · ${reportingPeriodName}`,
    );
    await page.getByTestId("button-expand-response-0").click();
    await expect(page.getByText("Scoped response", { exact: true })).toBeVisible();

    await page.getByTestId("select-response-generator-site").click();
    await page.getByRole("option", { name: alternateSiteName, exact: true }).click();
    await expect(page.getByTestId("section-generated-responses")).toHaveCount(0);
    await page.getByTestId("button-generate-ai-responses").click();
    await expect(page.getByTestId("text-response-generator-result-scope")).toHaveText(
      `Generated for ${alternateSiteName} · ${reportingPeriodName}`,
    );
    await page.getByTestId("select-response-generator-reporting-period").click();
    await page.getByRole("option", { name: `${alternateReportingPeriodName} (open)`, exact: true }).click();
    await expect(page.getByTestId("section-generated-responses")).toHaveCount(0);
    expect(generationCount).toBe(2);
    await page.unroute("**/api/questionnaires/generate-responses");

    await page.getByTestId("tab-new-questionnaire").click();

    await page.getByTestId("select-questionnaire-site").click();
    await page.getByRole("option", { name: siteName, exact: true }).click();
    await page.getByTestId("select-questionnaire-reporting-period").click();
    await page.getByRole("option", { name: `${reportingPeriodName} (open)`, exact: true }).click();
    await page.getByTestId("input-questionnaire-title").fill(questionnaireTitle);
    await page.getByTestId("textarea-paste-questions").fill(
      "Do you have an ESG policy?\nDo you have a sustainability policy?",
    );

    const createdPromise = page.waitForResponse((response) =>
      response.request().method() === "POST" && response.url().endsWith("/api/questionnaires"),
    );
    const autofilledPromise = page.waitForResponse((response) =>
      response.request().method() === "POST" && /\/api\/questionnaires\/[^/]+\/autofill$/.test(response.url()),
    );
    await page.getByTestId("button-create-autofill").click();
    const created = await createdPromise;
    const autofilled = await autofilledPromise;
    expect(created.status()).toBe(200);
    expect(autofilled.status()).toBe(200);
    expect(created.request().postDataJSON()).toMatchObject({ siteId, reportingPeriodId });
    questionnaireId = (await created.json() as { id: string }).id;
    expect((await autofilled.json() as { id?: string }).id).toBe(questionnaireId);

    await expect(page.getByTestId("text-result-title")).toHaveText(questionnaireTitle);
    await expect(page.locator("[data-testid^='question-card-']")).toHaveCount(2);
    await expect(page.locator("[data-testid^='text-answer-']")).toHaveCount(2);
    await expect(page.locator("[data-testid^='button-edit-answer-']")).toHaveCount(2);
    await expect(page.locator("[data-testid^='button-accept-answer-']")).toHaveCount(2);

    await page.route("**/api/workflow/submit", async (route) => {
      const requestBody = route.request().postDataJSON() as { entityIds?: string[] };
      expect(requestBody.entityIds).toHaveLength(2);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          requested: 2,
          submitted: 1,
          alreadySubmitted: 1,
          alreadyApproved: 0,
          ineligible: 0,
          notFound: 0,
          duplicates: 0,
        }),
      });
    });
    await page.getByTestId("button-submit-all-review").click();
    await expect(page.getByText("Submitted 1 of 2 items", { exact: true })).toBeVisible();
    await expect(page.getByText(
      "1 item was skipped because its status changed or it was no longer available.",
      { exact: true },
    )).toBeVisible();
    await expect(page.getByText("All questions submitted for review", { exact: true })).toHaveCount(0);
  });

  test("viewer history is read-only", async ({ page }) => {
    expect(questionnaireId).not.toBe("");
    await authenticate(page, viewerToken);
    await page.goto("/questionnaire");
    await expect(page.getByTestId("tab-previous-questionnaires")).toBeVisible();
    await expect(page.getByTestId("tab-new-questionnaire")).toHaveCount(0);
    await expect(page.getByTestId("button-open-import")).toHaveCount(0);

    await page.getByTestId(`button-view-questionnaire-${questionnaireId}`).click();
    await expect(page.getByTestId("text-detail-title")).toHaveText(questionnaireTitle);
    await expect(page.locator("[data-testid^='button-edit-answer-']")).toHaveCount(0);
    await expect(page.locator("[data-testid^='button-accept-answer-']")).toHaveCount(0);
    await expect(page.getByTestId("button-submit-all-review")).toHaveCount(0);
    await expect(page.locator("[data-testid^='button-delete-questionnaire-']")).toHaveCount(0);
  });
});
