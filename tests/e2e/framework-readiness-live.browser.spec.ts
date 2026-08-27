import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import { apiRequest, loginAndGetToken, type SeededTenants } from "../fixtures/seed.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const DATABASE_URL = process.env.DATABASE_URL;
const SEED_INFO_FILE = "tests/e2e/.auth/seed-info.json";
const TEST_PASSWORD = "Test1234!";

let database: Client;
let tenants: SeededTenants;
let approverToken = "";
let approverUserId = "";
let frameworkId = "";
let narrativeRequirementId = "";
let evidenceRequirementId = "";
let reportingPeriodId = "";
let submittedResponseId = "";
let uploadedEvidenceId = "";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const frameworkCode = `FR-LIVE-${suffix}`.toUpperCase();
const frameworkName = `Framework Readiness Live ${suffix}`;
const narrativeCode = `FR-NARR-${suffix}`.toUpperCase();
const evidenceCode = `FR-EVID-${suffix}`.toUpperCase();
const reportingPeriodName = `Framework E2E FY ${suffix}`;
const evidenceFilename = `framework-readiness-${suffix}.txt`;
const narrativeText = "The operations director reviews the transition plan quarterly and reports progress to the board.";

function browserStorageState(token: string) {
  return {
    cookies: [],
    origins: [{
      origin: new URL(BASE_URL).origin,
      localStorage: [{ name: "auth_token", value: token }],
    }],
  };
}

async function openAs(browser: Browser, token: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: browserStorageState(token),
  });
  const page = await context.newPage();
  await page.goto("/framework-readiness");
  await expect(page).not.toHaveURL(/\/auth|\/onboarding/);
  await expect(page.getByTestId("heading-readiness")).toBeVisible();
  return { context, page };
}

async function selectTestScope(page: Page) {
  await page.getByTestId("select-readiness-period").click();
  await page.getByRole("option", { name: reportingPeriodName, exact: true }).click();
  await expect(page.getByTestId("select-readiness-period")).toContainText(reportingPeriodName);

  await page.getByTestId("select-readiness-scope").click();
  await page.getByRole("option", { name: "Organisation-wide only", exact: true }).click();
  await expect(page.getByTestId("select-readiness-scope")).toContainText("Organisation-wide only");

  await expect(page.getByTestId(`card-readiness-${frameworkCode}`)).toBeVisible();
}

async function showRequirement(page: Page, requirementCode: string) {
  const row = page.getByTestId(`row-requirement-${requirementCode}`);
  if (!(await row.isVisible().catch(() => false))) {
    await page.getByTestId(`button-expand-${frameworkCode}`).click();
  }
  await expect(row).toBeVisible();
  return row;
}

test.describe("live Framework Readiness completion", () => {
  test.beforeAll(async () => {
    if (!DATABASE_URL) throw new Error("DATABASE_URL env var not set");
    tenants = JSON.parse(await fs.readFile(SEED_INFO_FILE, "utf8")) as SeededTenants;
    database = new Client({ connectionString: DATABASE_URL });
    await database.connect();

    const framework = await database.query<{ id: string }>(
      `INSERT INTO frameworks (code, name, full_name, description, version, is_active)
       VALUES ($1, $2, $2, 'Isolated live browser readiness framework', '1', true)
       RETURNING id`,
      [frameworkCode, frameworkName],
    );
    frameworkId = framework.rows[0].id;

    const narrative = await database.query<{ id: string }>(
      `INSERT INTO framework_requirements
         (framework_id, code, title, description, requirement_type, pillar, mandatory_level, sort_order)
       VALUES ($1, $2, 'Board transition narrative', 'Explain governance and review of the transition plan.',
         'narrative', 'governance', 'core', 1)
       RETURNING id`,
      [frameworkId, narrativeCode],
    );
    narrativeRequirementId = narrative.rows[0].id;

    const evidence = await database.query<{ id: string }>(
      `INSERT INTO framework_requirements
         (framework_id, code, title, description, requirement_type, pillar, mandatory_level, sort_order)
       VALUES ($1, $2, 'Board sign-off evidence', 'Upload reviewed evidence of board sign-off.',
         'evidence', 'governance', 'core', 2)
       RETURNING id`,
      [frameworkId, evidenceCode],
    );
    evidenceRequirementId = evidence.rows[0].id;

    const period = await database.query<{ id: string }>(
      `INSERT INTO reporting_periods (company_id, name, period_type, start_date, end_date, status)
       VALUES ($1, $2, 'annual', '2097-01-01', '2097-12-31', 'open')
       RETURNING id`,
      [tenants.tenantA.companyId, reportingPeriodName],
    );
    reportingPeriodId = period.rows[0].id;

    const approverEmail = `framework-live-approver-${suffix}@test-esg.example`;
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const approver = await database.query<{ id: string }>(
      `INSERT INTO users (
         username, email, password, role, company_id,
         terms_accepted_at, privacy_accepted_at, terms_version_accepted, privacy_version_accepted
       ) VALUES ($1, $2, $3, 'approver', $4, NOW(), NOW(), '1.0', '1.0')
       RETURNING id`,
      [`frameworkliveapprover${Date.now()}`, approverEmail, passwordHash, tenants.tenantA.companyId],
    );
    approverUserId = approver.rows[0].id;
    approverToken = await loginAndGetToken(approverEmail, TEST_PASSWORD);

    const selection = await apiRequest(
      "PUT",
      `/api/framework-selections/${frameworkId}`,
      { isEnabled: true },
      tenants.tenantA.adminToken,
    );
    expect(selection.status, selection.body).toBe(200);
  });

  test.afterAll(async () => {
    if (!database) return;
    try {
      const evidenceRows = evidenceRequirementId
        ? await database.query<{ id: string; storage_path: string | null }>(
            `SELECT id, storage_path FROM evidence_files
             WHERE company_id = $1 AND linked_module = 'framework_requirement' AND linked_entity_id = $2`,
            [tenants.tenantA.companyId, evidenceRequirementId],
          )
        : { rows: [] as Array<{ id: string; storage_path: string | null }> };

      for (const evidence of evidenceRows.rows) {
        const removed = await apiRequest("DELETE", `/api/evidence/${evidence.id}`, undefined, tenants.tenantA.adminToken)
          .catch(() => ({ status: 0, body: "" }));
        if (removed.status !== 200 && evidence.storage_path) {
          const uploadRoot = path.resolve(process.cwd(), "uploads", "evidence", tenants.tenantA.companyId);
          const storagePath = path.resolve(evidence.storage_path);
          if (storagePath.startsWith(`${uploadRoot}${path.sep}`)) {
            await fs.unlink(storagePath).catch(() => undefined);
          }
          await database.query("DELETE FROM evidence_files WHERE id = $1 AND company_id = $2", [evidence.id, tenants.tenantA.companyId]);
        }
      }

      const entityIds = [submittedResponseId, uploadedEvidenceId, frameworkId, narrativeRequirementId, evidenceRequirementId, reportingPeriodId]
        .filter(Boolean);
      if (entityIds.length > 0) {
        await database.query(
          "DELETE FROM audit_logs WHERE company_id = $1 AND entity_id = ANY($2::text[])",
          [tenants.tenantA.companyId, entityIds],
        );
      }
      if (approverUserId) {
        await database.query("DELETE FROM user_sessions_ext WHERE user_id = $1", [approverUserId]);
        await database.query("DELETE FROM audit_logs WHERE user_id = $1", [approverUserId]);
      }
      if (frameworkId) {
        await database.query("DELETE FROM framework_requirement_responses WHERE company_id = $1 AND framework_requirement_id IN (SELECT id FROM framework_requirements WHERE framework_id = $2)", [tenants.tenantA.companyId, frameworkId]);
        await database.query("DELETE FROM business_framework_selections WHERE business_id = $1 AND framework_id = $2", [tenants.tenantA.companyId, frameworkId]);
        await database.query("DELETE FROM framework_requirements WHERE framework_id = $1", [frameworkId]);
        await database.query("DELETE FROM frameworks WHERE id = $1", [frameworkId]);
      }
      if (reportingPeriodId) {
        await database.query("DELETE FROM reporting_periods WHERE id = $1 AND company_id = $2", [reportingPeriodId, tenants.tenantA.companyId]);
      }
      if (approverUserId) {
        await database.query("DELETE FROM users WHERE id = $1 AND company_id = $2", [approverUserId, tenants.tenantA.companyId]);
      }
    } finally {
      await database.end();
    }
  });

  test("contributor submits narrative and evidence; approver makes both requirements Ready", async ({ browser }) => {
    const contributor = await openAs(browser, tenants.tenantA.contributorToken);
    try {
      const { page } = contributor;
      await selectTestScope(page);
      const card = page.getByTestId(`card-readiness-${frameworkCode}`);
      await expect(card.getByTestId(`text-alignment-pct-${frameworkCode}`)).toHaveText("0%");

      const narrativeRow = await showRequirement(page, narrativeCode);
      await expect(narrativeRow).toContainText("Missing");
      await narrativeRow.getByTestId(`button-complete-${narrativeCode}`).click();
      await expect(page.getByTestId("dialog-framework-requirement")).toContainText("Board transition narrative");
      await page.getByTestId("input-framework-response-text").fill(narrativeText);

      const narrativeWrite = page.waitForResponse((response) =>
        response.request().method() === "PUT"
        && response.url().includes(`/api/framework-requirements/${narrativeRequirementId}/response`),
      );
      await page.getByTestId("button-submit-framework-response").click();
      const narrativeWriteResponse = await narrativeWrite;
      expect(narrativeWriteResponse.status(), await narrativeWriteResponse.text()).toBe(200);
      submittedResponseId = String((await narrativeWriteResponse.json()).id || "");
      expect(submittedResponseId).toBeTruthy();
      await expect(page.getByTestId("framework-response-status")).toHaveText("submitted");
      await page.getByTestId("dialog-framework-requirement").getByRole("button", { name: "Close", exact: true }).first().click();
      await expect(narrativeRow).toContainText("In progress");

      const evidenceRow = await showRequirement(page, evidenceCode);
      await evidenceRow.getByTestId(`button-complete-${evidenceCode}`).click();
      await expect(page.getByText("No evidence is linked to this requirement for this period and boundary.")).toBeVisible();
      await page.getByTestId("input-framework-evidence-file").setInputFiles({
        name: evidenceFilename,
        mimeType: "text/plain",
        buffer: Buffer.from("Board sign-off evidence for the live browser acceptance test."),
      });

      const evidenceWrite = page.waitForResponse((response) =>
        response.request().method() === "POST" && new URL(response.url()).pathname === "/api/evidence",
      );
      await page.getByTestId("button-upload-framework-evidence").click();
      const evidenceWriteResponse = await evidenceWrite;
      expect(evidenceWriteResponse.status(), await evidenceWriteResponse.text()).toBe(200);
      uploadedEvidenceId = String((await evidenceWriteResponse.json()).id || "");
      expect(uploadedEvidenceId).toBeTruthy();
      await expect(page.getByTestId("framework-evidence-list")).toContainText(evidenceFilename);
      await expect(page.getByTestId("framework-evidence-list")).toContainText("Status: uploaded");
      await page.getByTestId("dialog-framework-requirement").getByRole("button", { name: "Close", exact: true }).first().click();
      await expect(evidenceRow).toContainText("In progress");
    } finally {
      await contributor.context.close();
    }

    const approver = await openAs(browser, approverToken);
    try {
      const { page } = approver;
      await selectTestScope(page);
      const card = page.getByTestId(`card-readiness-${frameworkCode}`);

      const narrativeRow = await showRequirement(page, narrativeCode);
      await narrativeRow.getByTestId(`button-complete-${narrativeCode}`).click();
      await expect(page.getByTestId("framework-response-status")).toHaveText("submitted");
      await expect(page.getByTestId("input-framework-response-text")).toBeDisabled();
      await page.getByTestId("input-framework-review-comment").fill("Clear, specific and ready for approval.");

      const narrativeReview = page.waitForResponse((response) =>
        response.request().method() === "POST"
        && response.url().includes(`/api/framework-requirement-responses/${submittedResponseId}/review`),
      );
      await page.getByTestId("button-approve-framework-response").click();
      const narrativeReviewResponse = await narrativeReview;
      expect(narrativeReviewResponse.status(), await narrativeReviewResponse.text()).toBe(200);
      await expect(page.getByTestId("framework-response-status")).toHaveText("approved");
      await page.getByTestId("dialog-framework-requirement").getByRole("button", { name: "Close", exact: true }).first().click();
      await expect(narrativeRow).toContainText("Ready");
      await expect(card.getByTestId(`text-alignment-pct-${frameworkCode}`)).toHaveText("50%");

      const evidenceRow = await showRequirement(page, evidenceCode);
      await evidenceRow.getByTestId(`button-complete-${evidenceCode}`).click();
      await expect(page.getByTestId("framework-evidence-list")).toContainText(evidenceFilename);
      const approveEvidence = page.getByTestId(`button-approve-evidence-${uploadedEvidenceId}`);
      await expect(approveEvidence).toBeVisible();

      const evidenceReview = page.waitForResponse((response) =>
        response.request().method() === "PUT"
        && new URL(response.url()).pathname === `/api/evidence/${uploadedEvidenceId}`,
      );
      await approveEvidence.click();
      const evidenceReviewResponse = await evidenceReview;
      expect(evidenceReviewResponse.status(), await evidenceReviewResponse.text()).toBe(200);
      await expect(page.getByTestId("framework-evidence-list")).toContainText("Status: approved");
      await page.getByTestId("dialog-framework-requirement").getByRole("button", { name: "Close", exact: true }).first().click();

      await expect(evidenceRow).toContainText("Ready");
      await expect(card.getByTestId(`text-alignment-pct-${frameworkCode}`)).toHaveText("100%");
      await expect(card.getByTestId(`filter-covered-${frameworkCode}`)).toContainText("2");
      await expect(card.getByTestId(`filter-missing-${frameworkCode}`)).toContainText("0");
    } finally {
      await approver.context.close();
    }
  });
});
