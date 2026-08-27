import { expect, test, type Page } from "@playwright/test";

type MockRole = "contributor" | "approver";

type RequirementResponse = {
  id: string;
  responseText: string;
  linkedEntityType: null;
  linkedEntityId: null;
  workflowStatus: "submitted" | "approved";
  reviewComment: string | null;
  updatedAt: string;
};

type RequirementEvidence = {
  id: string;
  filename: string;
  evidenceStatus: "uploaded" | "approved";
  frameworkRequirementId: string;
  resolvedLinkedPeriod: string;
};

const NARRATIVE_REQUIREMENT_ID = "requirement-narrative";
const EVIDENCE_REQUIREMENT_ID = "requirement-evidence";
const SELECTED_PERIOD_ID = "period-fy2026";
const NARRATIVE_TEXT = "The operations director reviews our transition plan quarterly and reports progress to the board.";

function readinessStatus(value: RequirementResponse | RequirementEvidence | null) {
  if (!value) return "missing";
  if ("workflowStatus" in value) return value.workflowStatus === "approved" ? "covered" : "partial";
  return value.evidenceStatus === "approved" ? "covered" : "partial";
}

async function selectCompletionScope(page: Page) {
  await expect(page.getByTestId("select-readiness-period")).toContainText("FY2025");
  await page.getByTestId("select-readiness-period").click();
  await page.getByRole("option", { name: "FY2026", exact: true }).click();
  await expect(page.getByTestId("select-readiness-period")).toContainText("FY2026");

  await page.getByTestId("select-readiness-scope").click();
  await page.getByRole("option", { name: "Organisation-wide only", exact: true }).click();
  await expect(page.getByTestId("select-readiness-scope")).toContainText("Organisation-wide only");
}

test.describe("Framework Readiness requirement completion", () => {
  test("hands narrative and evidence from a contributor to an approver", async ({ page }) => {
    let role: MockRole = "contributor";
    let narrativeResponse: RequirementResponse | null = null;
    let evidence: RequirementEvidence | null = null;
    let updateVersion = 0;

    const readinessRequests: string[] = [];
    const narrativeSubmissions: Array<Record<string, unknown>> = [];
    const narrativeReviews: Array<Record<string, unknown>> = [];
    const evidenceUploads: string[] = [];
    const evidenceReviews: Array<Record<string, unknown>> = [];
    const unexpectedWrites: string[] = [];

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

      if (path === "/api/auth/me") {
        return json({
          user: {
            id: `mock-${role}`,
            username: role,
            email: `${role}@example.test`,
            role,
            companyId: "mock-company",
          },
          company: {
            id: "mock-company",
            name: "Mock SME",
            onboardingComplete: true,
            lifecycleState: "active",
          },
          defaultLandingContext: "company",
          portfolioGroups: [],
        });
      }

      if (path === "/api/reporting-periods") {
        return json([
          { id: "period-fy2025", name: "FY2025", startDate: "2025-01-01", endDate: "2025-12-31", status: "open" },
          { id: SELECTED_PERIOD_ID, name: "FY2026", startDate: "2026-01-01", endDate: "2026-12-31", status: "closed" },
        ]);
      }

      if (path === "/api/framework-readiness" && method === "GET") {
        readinessRequests.push(url.search);
        const period = url.searchParams.get("period");
        const requestedSite = url.searchParams.get("siteId") || "__all__";
        const selectedNarrative = period === SELECTED_PERIOD_ID ? narrativeResponse : null;
        const selectedEvidence = period === SELECTED_PERIOD_ID ? evidence : null;
        const narrativeStatus = readinessStatus(selectedNarrative);
        const evidenceStatus = readinessStatus(selectedEvidence);
        const statuses = [narrativeStatus, evidenceStatus];

        return json([{
          framework: {
            id: "framework-vsme",
            code: "VSME",
            name: "VSME",
            fullName: "Voluntary sustainability reporting standard for SMEs",
            version: "2024",
          },
          requirements: [
            {
              id: NARRATIVE_REQUIREMENT_ID,
              code: "VSME-C1",
              title: "Climate transition narrative",
              description: "Explain governance and review of the transition plan.",
              requirementType: "narrative",
              mandatoryLevel: "core",
              pillar: "environmental",
              mappedMetricIds: [],
              status: narrativeStatus,
              additionalNeeded: narrativeStatus === "covered" ? [] : ["Add and approve a narrative response"],
              factSummary: {
                requirementLinkedEvidence: selectedNarrative ? 1 : 0,
                approvedRequirementLinkedEvidence: selectedNarrative?.workflowStatus === "approved" ? 1 : 0,
                evidenceRequired: false,
              },
            },
            {
              id: EVIDENCE_REQUIREMENT_ID,
              code: "VSME-E1",
              title: "Energy source evidence",
              description: "Upload evidence supporting the reported energy source.",
              requirementType: "evidence",
              mandatoryLevel: "core",
              pillar: "environmental",
              mappedMetricIds: [],
              status: evidenceStatus,
              additionalNeeded: evidenceStatus === "covered" ? [] : ["Upload and approve supporting evidence"],
              factSummary: {
                requirementLinkedEvidence: selectedEvidence ? 1 : 0,
                approvedRequirementLinkedEvidence: selectedEvidence?.evidenceStatus === "approved" ? 1 : 0,
                evidenceRequired: true,
              },
            },
          ],
          summary: {
            covered: statuses.filter((status) => status === "covered").length,
            partial: statuses.filter((status) => status === "partial").length,
            missing: statuses.filter((status) => status === "missing").length,
            total: statuses.length,
          },
          nextBestActions: [],
          scope: {
            period,
            siteMode: requestedSite === "__org__" ? "organisation" : requestedSite === "__all__" ? "all" : "site",
            siteId: requestedSite.startsWith("__") ? null : requestedSite,
          },
        }]);
      }

      if (path === "/api/framework-requirement-responses" && method === "GET") {
        const isSelectedResponse = url.searchParams.get("frameworkRequirementId") === NARRATIVE_REQUIREMENT_ID
          && url.searchParams.get("period") === SELECTED_PERIOD_ID
          && url.searchParams.get("siteId") === "__org__";
        return json({ responses: isSelectedResponse && narrativeResponse ? [narrativeResponse] : [] });
      }

      if (path === `/api/framework-requirements/${NARRATIVE_REQUIREMENT_ID}/response` && method === "PUT") {
        const payload = request.postDataJSON() as Record<string, unknown>;
        narrativeSubmissions.push(payload);
        updateVersion += 1;
        narrativeResponse = {
          id: "response-narrative",
          responseText: String(payload.responseText || ""),
          linkedEntityType: null,
          linkedEntityId: null,
          workflowStatus: "submitted",
          reviewComment: null,
          updatedAt: `2026-08-26T10:00:0${updateVersion}.000Z`,
        };
        return json(narrativeResponse);
      }

      if (path === "/api/framework-requirement-responses/response-narrative/review" && method === "POST") {
        const payload = request.postDataJSON() as Record<string, unknown>;
        narrativeReviews.push(payload);
        updateVersion += 1;
        narrativeResponse = {
          ...narrativeResponse!,
          workflowStatus: "approved",
          reviewComment: String(payload.reviewComment || "") || null,
          updatedAt: `2026-08-26T10:00:0${updateVersion}.000Z`,
        };
        return json(narrativeResponse);
      }

      if (path === "/api/evidence" && method === "GET") {
        const isSelectedEvidence = url.searchParams.get("period") === SELECTED_PERIOD_ID
          && url.searchParams.get("siteId") === "null";
        return json(isSelectedEvidence && evidence ? [evidence] : []);
      }

      if (path === "/api/evidence" && method === "POST") {
        evidenceUploads.push(request.postData() || "");
        evidence = {
          id: "evidence-energy",
          filename: "energy-invoice.pdf",
          evidenceStatus: "uploaded",
          frameworkRequirementId: EVIDENCE_REQUIREMENT_ID,
          resolvedLinkedPeriod: SELECTED_PERIOD_ID,
        };
        return json(evidence, 201);
      }

      if (path === "/api/evidence/evidence-energy" && method === "PUT") {
        const payload = request.postDataJSON() as Record<string, unknown>;
        evidenceReviews.push(payload);
        evidence = { ...evidence!, evidenceStatus: "approved" };
        return json(evidence);
      }

      if (path === "/api/notifications/count") return json({ count: 0 });
      if (path === "/api/programme/status") return json({ nextBestActions: [] });
      if (path === "/api/recommendations") return json({ recommendations: [], total: 0, limited: false });
      if (path === "/api/esg/roadmap") return json({ roadmap: { items: [], generatedAt: null, updatedAt: null } });
      if (path === "/api/sites") return json([]);
      if (path === "/api/admin/impersonation/status") return json({ isImpersonating: false });
      if (path === "/api/activity/track" && method === "POST") return json({ ok: true });

      if (method !== "GET") unexpectedWrites.push(`${method} ${path}`);
      return json([]);
    });

    await page.addInitScript(() => localStorage.setItem("auth_token", "mock-token"));
    await page.goto("/framework-readiness");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("heading-readiness")).toBeVisible();

    await selectCompletionScope(page);
    await expect.poll(() => readinessRequests.some((query) => query.includes(`period=${SELECTED_PERIOD_ID}`) && query.includes("siteId=__org__"))).toBe(true);

    await page.getByTestId("button-complete-VSME-C1").click();
    await expect(page.getByTestId("dialog-framework-requirement")).toContainText("Climate transition narrative");
    await expect(page.getByTestId("dialog-framework-requirement")).toContainText("FY2026");
    await page.getByTestId("input-framework-response-text").fill(NARRATIVE_TEXT);
    await page.getByTestId("button-submit-framework-response").click();
    await expect(page.getByTestId("framework-response-status")).toHaveText("submitted");
    expect(narrativeSubmissions).toEqual([{
      period: SELECTED_PERIOD_ID,
      siteId: null,
      workflowStatus: "submitted",
      responseText: NARRATIVE_TEXT,
    }]);

    await page.getByTestId("dialog-framework-requirement").getByRole("button", { name: "Close", exact: true }).first().click();
    await page.getByTestId("button-complete-VSME-E1").click();
    await expect(page.getByText("No evidence is linked to this requirement for this period and boundary.")).toBeVisible();
    await page.getByTestId("input-framework-evidence-file").setInputFiles({
      name: "energy-invoice.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 mocked evidence"),
    });
    await page.getByTestId("button-upload-framework-evidence").click();
    await expect(page.getByTestId("framework-evidence-list")).toContainText("energy-invoice.pdf");
    await expect(page.getByTestId("framework-evidence-list")).toContainText("Status: uploaded");
    expect(evidenceUploads).toHaveLength(1);
    expect(evidenceUploads[0]).toContain(`name=\"frameworkRequirementId\"`);
    expect(evidenceUploads[0]).toContain(EVIDENCE_REQUIREMENT_ID);
    expect(evidenceUploads[0]).toContain(`name=\"period\"`);
    expect(evidenceUploads[0]).toContain(SELECTED_PERIOD_ID);
    expect(evidenceUploads[0]).toContain(`name=\"siteId\"`);
    expect(evidenceUploads[0]).toContain("__org__");

    await page.getByTestId("dialog-framework-requirement").getByRole("button", { name: "Close", exact: true }).first().click();
    role = "approver";
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("heading-readiness")).toBeVisible();
    await selectCompletionScope(page);

    await page.getByTestId("button-complete-VSME-C1").click();
    await expect(page.getByTestId("framework-response-status")).toHaveText("submitted");
    await expect(page.getByTestId("input-framework-response-text")).toBeDisabled();
    await expect(page.getByTestId("button-save-framework-draft")).toHaveCount(0);
    await expect(page.getByTestId("button-submit-framework-response")).toHaveCount(0);
    await expect(page.getByTestId("button-reject-framework-response")).toBeVisible();
    await expect(page.getByTestId("button-approve-framework-response")).toBeVisible();
    await page.getByTestId("input-framework-review-comment").fill("Clear, specific and ready for approval.");
    await page.getByTestId("button-approve-framework-response").click();
    await expect(page.getByTestId("framework-response-status")).toHaveText("approved");
    expect(narrativeReviews).toEqual([{
      workflowStatus: "approved",
      reviewComment: "Clear, specific and ready for approval.",
    }]);

    await page.getByTestId("dialog-framework-requirement").getByRole("button", { name: "Close", exact: true }).first().click();
    await page.getByTestId("button-complete-VSME-E1").click();
    await expect(page.getByTestId("input-framework-evidence-file")).toHaveCount(0);
    await expect(page.getByTestId("button-reject-evidence-evidence-energy")).toBeVisible();
    await expect(page.getByTestId("button-approve-evidence-evidence-energy")).toBeVisible();
    await page.getByTestId("button-approve-evidence-evidence-energy").click();
    await expect(page.getByTestId("framework-evidence-list")).toContainText("Status: approved");
    expect(evidenceReviews).toEqual([{ evidenceStatus: "approved" }]);
    expect(unexpectedWrites).toEqual([]);
  });
});
