import { expect, test } from "@playwright/test";

test("public SME ESG Passport leads with explainable facts instead of an opaque score", async ({ page }) => {
  await page.route("**/api/company/esg-profile/public/passport-token", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        company: { name: "Passport Manufacturing Ltd", industry: "Manufacturing", employeeCount: 48 },
        reporting_period: { period: "FY2025", label: "FY2025" },
        esg_scores: { environmental: 94, social: 88, governance: 91, overall: 92 },
        passport: {
          version: 1,
          title: "SME ESG Passport",
          organisation: { name: "Passport Manufacturing Ltd", industry: "Manufacturing", employeeCount: 48 },
          reportingBoundary: {
            type: "whole_organisation",
            label: "Whole organisation: legal entity plus 2 active sites",
            activeSiteCount: 2,
          },
          reportingPeriod: {
            period: "FY2025",
            label: "FY2025",
            startDate: "2025-01-01",
            endDate: "2025-12-31",
          },
          completion: { reportedMetrics: 6, totalMetrics: 8, missingMetrics: 2, percentage: 75 },
          evidenceConfidence: {
            level: "evidence_backed",
            label: "Evidence-backed",
            description: "4 of 8 tracked metrics have current approved evidence.",
            documents: { total: 7, reviewed: 5, approved: 4 },
            ladder: [
              { key: "reported", label: "Data reported", count: 6, total: 8, percentage: 75 },
              { key: "measured", label: "Measured data", count: 5, total: 8, percentage: 63 },
              { key: "source_linked", label: "Source linked", count: 5, total: 8, percentage: 63 },
              { key: "reviewed", label: "Evidence reviewed", count: 5, total: 8, percentage: 63 },
              { key: "evidence_backed", label: "Evidence approved", count: 4, total: 8, percentage: 50 },
              { key: "independently_assured", label: "Independently assured", count: 0, total: 8, percentage: 0 },
            ],
          },
          emissions: {
            available: true,
            reportingPeriod: "FY2025",
            matchesPassportPeriod: true,
            unit: "kgCO2e",
            scope1: 1200,
            scope2: 2300,
            scope3: 450,
            total: 3950,
            factorYear: 2025,
            basis: "SME carbon estimator",
          },
          policies: {
            total: 2,
            published: 1,
            items: [{ title: "Environmental policy", status: "active" }],
          },
          actions: {
            total: 2,
            completed: 1,
            inProgress: 1,
            overdue: 0,
            items: [{ title: "Replace warehouse lighting", status: "in_progress", dueDate: "2026-03-31" }],
          },
          targets: {
            total: 1,
            achieved: 0,
            inProgress: 1,
            items: [{
              title: "Reduce Scope 1 emissions",
              targetValue: "30.00",
              targetYear: 2030,
              unit: "%",
              status: "in_progress",
            }],
          },
          reportAccess: {
            available: true,
            latest: {
              title: "FY2025 approved ESG report",
              reportingPeriod: "FY2025",
              generatedAt: "2026-02-15T10:00:00.000Z",
              fileType: "pdf",
              fileSize: 4096,
              downloadUrl: "/api/company/esg-profile/public/passport-token/reports/report-1/download/file-1",
            },
          },
          disclaimer: "This passport presents reported facts and evidence status. It is not an ESG rating or independent assurance unless explicitly stated.",
        },
      }),
    });
  });

  await page.goto("/public/esg/passport-token");

  await expect(page.getByText("SME ESG Passport", { exact: true })).toBeVisible();
  await expect(page.getByTestId("public-passport-boundary-label")).toHaveText(
    "Whole organisation: legal entity plus 2 active sites",
  );
  await expect(page.getByTestId("public-profile-reporting-period")).toHaveText("FY2025");
  await expect(page.getByTestId("public-passport-completion")).toContainText("6 of 8 tracked metrics reported");
  await expect(page.getByTestId("public-passport-evidence")).toContainText("4 of 8 tracked metrics have current approved evidence");
  await expect(page.getByTestId("public-evidence-step-independently_assured")).toContainText("0/8");
  await expect(page.getByTestId("public-emissions-scope-1")).toHaveText("1,200 kgCO2e");
  await expect(page.getByTestId("public-emissions-total")).toHaveText("3,950 kgCO2e");
  await expect(page.getByTestId("public-passport-commitments")).toContainText("Environmental policy");
  await expect(page.getByTestId("public-passport-commitments")).toContainText("Replace warehouse lighting");
  await expect(page.getByTestId("public-passport-commitments")).toContainText("Reduce Scope 1 emissions");
  await expect(page.getByTestId("public-passport-report-download")).toHaveAttribute(
    "href",
    "/api/company/esg-profile/public/passport-token/reports/report-1/download/file-1",
  );
  await expect(page.getByTestId("public-passport-disclaimer")).toContainText("not an ESG rating");

  await expect(page.getByText("ESG Score", { exact: true })).toHaveCount(0);
  await expect(page.getByText("92%", { exact: true })).toHaveCount(0);
});
