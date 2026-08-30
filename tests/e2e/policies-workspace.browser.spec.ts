import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

type MockRole = "admin" | "approver" | "viewer";
type PolicyScenario = {
  policy?: Partial<typeof generatedDraft>;
  settings?: {
    requireApprovalPolicies: boolean;
    autoLockApproved: boolean;
  };
};

const policyTemplate = {
  slug: "environmental-policy",
  name: "Environmental Policy",
  description: "A practical environmental policy for a growing SME.",
  category: "Environmental",
  enabled: true,
  questionnaire: [
    { key: "companyName", label: "Company name", type: "text", required: true },
    { key: "policyOwner", label: "Policy owner", type: "text", required: true },
  ],
  sections: [{ key: "purpose", label: "Purpose" }],
  complianceMapping: { isoStandards: ["ISO 14001:2015"], legalDrivers: [], customerQuestionnaireUses: [] },
};

const generatedDraft = {
  id: "draft-1",
  title: "Environmental Policy Draft",
  templateSlug: policyTemplate.slug,
  versionNumber: 1,
  policyOwner: "Operations Director",
  approver: "Managing Director",
  updatedAt: "2026-08-20T09:00:00.000Z",
  reviewDate: "2027-08-20T00:00:00.000Z",
  status: "draft",
  workflowStatus: "draft",
  tone: "simple_sme",
  content: { purpose: "We will reduce our environmental impact through practical, measurable action." },
};

async function openPolicies(
  browser: Browser,
  role: MockRole,
  path = "/policies",
  viewport = { width: 1280, height: 800 },
  scenario: PolicyScenario = {},
): Promise<{ context: BrowserContext; page: Page; getReviewRequests: () => number }> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  let generatedPolicy = {
    ...generatedDraft,
    ...(role === "approver" ? { workflowStatus: "submitted" } : {}),
    ...scenario.policy,
  };
  const settings = scenario.settings ?? { requireApprovalPolicies: true, autoLockApproved: true };
  let reviewRequests = 0;
  const policyRecords: Array<Record<string, unknown>> = [{
    id: "record-1",
    title: "Health and Safety Policy",
    policyType: "health_safety",
    owner: "People Director",
    status: "active",
    effectiveDate: "2026-01-10T00:00:00.000Z",
    reviewDate: "2099-01-10T00:00:00.000Z",
    documentLink: "https://example.test/policies/health-and-safety",
    notes: "Reviewed by the leadership team.",
    attachment: null,
  }];

  const governanceAssignments: Array<Record<string, unknown>> = [{
    id: "governance-1",
    area: "environment",
    ownerName: "Priya Shah",
    ownerTitle: "Operations Director",
    responsibilities: "Owns environmental performance and policy review.",
  }, {
    id: "governance-empty-social",
    area: "social",
    ownerName: "   ",
    ownerTitle: null,
    responsibilities: null,
  }];

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname;
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (apiPath === "/api/auth/me") {
      return json({
        user: {
          id: `mock-${role}`,
          username: role === "admin" ? "Alex Admin" : role === "approver" ? "Avery Approver" : "Vera Viewer",
          email: `${role}@example.test`,
          role,
          companyId: "mock-company",
        },
        company: {
          id: "mock-company",
          name: "Northstar Components",
          industry: "Manufacturing",
          country: "United Kingdom",
          employeeCount: 42,
          onboardingComplete: true,
          lifecycleState: "active",
        },
        defaultLandingContext: "company",
        portfolioGroups: [],
      });
    }
    if (apiPath === "/api/sites") return json([]);
    if (apiPath === "/api/admin/impersonation/status") return json({ isImpersonating: false });
    if (apiPath === "/api/billing/status") return json({ planTier: "pro", subscriptionStatus: "active" });
    if (apiPath === "/api/company/settings") return json(settings);
    if (apiPath === "/api/activity/track" && method === "POST") return json({ ok: true });
    if (apiPath === "/api/policy" && method === "GET") {
      return json({
        policy: {
          id: "company-policy-1",
          status: "published",
          reviewDate: "2027-06-30T00:00:00.000Z",
          assignedUserId: null,
        },
        latestVersion: {
          versionNumber: 2,
          content: { purpose: "Northstar's company-wide ESG commitments." },
        },
        versions: [],
      });
    }
    if (apiPath === "/api/policy-records" && method === "GET") return json(policyRecords);
    if (apiPath === "/api/policy-records" && method === "POST") {
      const submitted = route.request().postDataJSON() as Record<string, unknown>;
      const created = {
        id: "record-created",
        policyType: "other",
        owner: null,
        status: "draft",
        effectiveDate: null,
        reviewDate: null,
        documentLink: null,
        notes: null,
        attachment: null,
        ...submitted,
      };
      policyRecords.push(created);
      return json(created, 201);
    }
    if (apiPath.startsWith("/api/policy-records/") && method === "PATCH") {
      const id = apiPath.split("/").pop();
      const existing = policyRecords.find(policy => policy.id === id);
      if (!existing) return json({ error: "Not found" }, 404);
      Object.assign(existing, route.request().postDataJSON());
      return json(existing);
    }
    if (apiPath.startsWith("/api/policy-records/") && method === "DELETE") {
      const id = apiPath.split("/").pop();
      const index = policyRecords.findIndex(policy => policy.id === id);
      if (index >= 0) policyRecords.splice(index, 1);
      return json({ ok: true });
    }
    if (apiPath === "/api/governance-assignments") {
      return json(governanceAssignments);
    }
    if (apiPath.startsWith("/api/governance-assignments/") && method === "PUT") {
      const area = apiPath.split("/").pop();
      const existing = governanceAssignments.find(assignment => assignment.area === area);
      if (existing) Object.assign(existing, route.request().postDataJSON());
      return json(existing || {});
    }
    if (apiPath === "/api/policy-templates" && method === "GET") return json([policyTemplate]);
    if (apiPath === `/api/policy-templates/${policyTemplate.slug}` && method === "GET") return json(policyTemplate);
    if (apiPath === `/api/policy-templates/${policyTemplate.slug}/generate` && method === "POST") {
      generatedPolicy = {
        ...generatedDraft,
        id: "draft-generated",
        title: "Northstar Components — Environmental Policy",
        updatedAt: new Date().toISOString(),
      };
      return json(generatedPolicy);
    }
    if (apiPath === "/api/generated-policies" && method === "GET") return json([generatedPolicy]);
    if (apiPath === `/api/generated-policies/${generatedPolicy.id}` && method === "GET") return json(generatedPolicy);
    if (apiPath === `/api/generated-policies/${generatedPolicy.id}` && method === "PUT") {
      const update = route.request().postDataJSON() as Partial<typeof generatedPolicy>;
      generatedPolicy = {
        ...generatedPolicy,
        ...update,
        ...(update.status === "approved" && !settings.requireApprovalPolicies
          ? { workflowStatus: "approved" }
          : {}),
      };
      return json(generatedPolicy);
    }
    if (apiPath === "/api/workflow/submit" && method === "POST") {
      generatedPolicy = { ...generatedPolicy, workflowStatus: "submitted" };
      return json({ ok: true, submitted: 1 });
    }
    if (apiPath === "/api/workflow/review" && method === "POST") {
      reviewRequests += 1;
      const body = route.request().postDataJSON() as { action: "approve" | "reject"; comment?: string };
      if (body.action === "reject" && !body.comment?.trim()) {
        return json({ error: "Comment is required for rejection" }, 400);
      }
      generatedPolicy = {
        ...generatedPolicy,
        workflowStatus: body.action === "approve" ? "approved" : "rejected",
        status: body.action === "approve" ? "approved" : "draft",
        reviewComment: body.comment || null,
      } as typeof generatedPolicy;
      return json({ ok: true, status: generatedPolicy.workflowStatus });
    }
    if (apiPath === "/api/workflow/revise" && method === "POST") {
      generatedPolicy = { ...generatedPolicy, workflowStatus: "draft", status: "draft" };
      return json({ ok: true, status: "draft" });
    }
    return json([]);
  });

  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "mock-token");
    localStorage.setItem("guidance_dismissed_esg-policy-register", "true");
  });
  await page.goto(path);
  await expect(page.getByTestId("page-policies")).toBeVisible();
  return { context, page, getReviewRequests: () => reviewRequests };
}

test.describe("Unified Policies workspace", () => {
  test("admin can use the register and template library in one URL-backed workspace", async ({ browser }) => {
    const { context, page } = await openPolicies(browser, "admin");

    await expect(page.getByRole("heading", { name: "Policies", exact: true })).toBeVisible();
    await expect(page.getByTestId("nav-policies")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("policies-workspace-tabs").getByRole("tab")).toHaveCount(2);
    await expect(page.getByTestId("tab-policy-register")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("tab-policy-templates")).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("core-esg-policy-card")).toContainText("Company ESG policy");
    await expect(page.getByTestId("core-esg-policy-card")).toContainText("Published");
    await expect(page.getByTestId("policy-card-record-1")).toContainText("Health and Safety Policy");
    await expect(page.getByTestId("button-add-policy")).toBeVisible();
    await expect(page.getByTestId("button-edit-policy-record-1")).toBeVisible();
    await expect(page.getByTestId("button-edit-governance-environment")).toBeVisible();
    await expect(page.getByTestId("governance-ownership-section")).toContainText("Governance completeness: 20%");

    await page.getByTestId("button-open-core-policy").click();
    await expect(page).toHaveURL(/\/policies\?tab=register&policy=company$/);
    await expect(page.getByTestId("core-policy-editor")).toBeVisible();
    await expect(page.getByTestId("nav-policies")).toHaveAttribute("aria-current", "page");
    await page.getByTestId("tab-policy-register").click();
    await expect(page).toHaveURL(/\/policies\?tab=register$/);

    await page.getByTestId("button-add-policy").click();
    await page.getByTestId("input-policy-title").fill("Responsible Sourcing Policy");
    await page.getByTestId("input-policy-owner").fill("Procurement Lead");
    await page.getByTestId("button-save-policy").click();
    await expect(page.getByTestId("policy-card-record-created")).toContainText("Responsible Sourcing Policy");
    await expect(page.getByTestId("policy-card-record-created")).toContainText("Procurement Lead");

    await page.getByTestId("button-edit-policy-record-created").click();
    await page.getByTestId("input-policy-title").fill("Responsible Procurement Policy");
    await page.getByTestId("button-save-policy").click();
    await expect(page.getByTestId("policy-card-record-created")).toContainText("Responsible Procurement Policy");

    await page.getByTestId("button-edit-governance-environment").click();
    await page.getByTestId("input-gov-owner-environment").fill("Jordan Lee");
    await page.getByTestId("button-save-gov-environment").click();
    await expect(page.getByTestId("governance-card-environment")).toContainText("Jordan Lee");

    await expect(page.getByTestId("generated-policy-register")).toBeVisible();
    await expect(page.getByTestId("card-policy-draft-1")).toContainText("Environmental Policy Draft");
    await expect(page.getByTestId("button-create-from-template")).toBeVisible();

    await page.getByTestId("tab-policy-templates").click();
    await expect(page).toHaveURL(/\/policies\?tab=templates$/);
    await expect(page.getByTestId("tab-policy-templates")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("policy-template-library")).toBeVisible();
    await expect(page.getByTestId("card-template-environmental-policy")).toContainText("Environmental Policy");
    await expect(page.getByTestId("button-use-template-environmental-policy")).toBeVisible();

    await page.getByTestId("button-use-template-environmental-policy").click();
    await expect(page).toHaveURL(/\/policies\?tab=templates&template=environmental-policy$/);
    await expect(page.getByRole("heading", { name: "Environmental Policy", exact: true })).toBeVisible();
    await expect(page.getByTestId("button-back-to-library")).toBeVisible();
    await page.getByTestId("button-back-to-library").click();
    await expect(page).toHaveURL(/\/policies\?tab=templates$/);

    await context.close();
  });

  test("guided template creation generates a draft and opens it in the register", async ({ browser }) => {
    const { context, page } = await openPolicies(browser, "admin", "/policies?tab=templates");

    await page.getByTestId("button-use-template-environmental-policy").click();
    await expect(page.getByTestId("input-companyName")).toHaveValue("Northstar Components");
    await expect(page.getByTestId("input-policyOwner")).toHaveValue("Alex Admin");
    await page.getByTestId("button-wizard-next").click();
    await page.getByTestId("button-wizard-next").click();
    await page.getByTestId("button-wizard-next").click();
    await expect(page.getByTestId("button-generate-policy")).toBeVisible();
    await page.getByTestId("button-generate-policy").click();

    await expect(page).toHaveURL(/\/policies\?tab=register&policy=draft-generated$/);
    await expect(page.getByTestId("generated-policy-viewer")).toContainText("Northstar Components — Environmental Policy");
    await context.close();
  });

  test("generated drafts open from the register without leaving Policies", async ({ browser }) => {
    const { context, page } = await openPolicies(browser, "admin");

    await page.getByTestId("button-view-policy-draft-1").click();
    await expect(page).toHaveURL(/\/policies\?tab=register&policy=draft-1$/);
    await expect(page.getByTestId("generated-policy-viewer")).toBeVisible();
    await expect(page.getByTestId("generated-policy-viewer").locator("h1").first()).toHaveText("Environmental Policy Draft");
    await expect(page.getByTestId("textarea-purpose")).toHaveValue(/reduce our environmental impact/i);
    await expect(page.getByTestId("textarea-purpose")).toBeEnabled();
    await expect(page.getByTestId("button-submit-policy-review")).toBeVisible();
    await expect(page.getByTestId("nav-policies")).toHaveAttribute("aria-current", "page");

    await page.getByTestId("button-back-from-viewer").click();
    await expect(page).toHaveURL(/\/policies\?tab=register$/);
    await context.close();
  });

  test("approver can review a submitted draft but cannot edit or submit it", async ({ browser }) => {
    const { context, page } = await openPolicies(browser, "approver");

    await page.getByTestId("button-view-policy-draft-1").click();
    await expect(page.getByTestId("button-workflow-approve-policy")).toBeVisible();
    await expect(page.getByTestId("button-workflow-reject-policy")).toBeVisible();
    await expect(page.getByTestId("button-submit-policy-review")).toHaveCount(0);
    await expect(page.getByTestId("button-save-generated")).toHaveCount(0);
    await expect(page.getByTestId("textarea-purpose")).toBeDisabled();

    await page.getByTestId("button-workflow-approve-policy").click();
    await expect(page.getByTestId("badge-policy-status")).toContainText("approved");
    await expect(page.getByTestId("button-workflow-approve-policy")).toHaveCount(0);
    await context.close();
  });

  test("submitted generated policy content is immutable even for an admin", async ({ browser }) => {
    const { context, page } = await openPolicies(
      browser,
      "admin",
      "/policies?tab=register&policy=draft-1",
      { width: 1280, height: 800 },
      { policy: { workflowStatus: "submitted" } },
    );

    await expect(page.getByTestId("textarea-purpose")).toBeDisabled();
    await expect(page.getByTestId("button-save-generated")).toHaveCount(0);
    await expect(page.getByTestId("button-submit-policy-review")).toHaveCount(0);
    await expect(page.getByTestId("button-revise-policy")).toHaveCount(0);
    await expect(page.getByTestId("button-workflow-approve-policy")).toBeVisible();
    await expect(page.getByTestId("button-workflow-reject-policy")).toBeVisible();

    await context.close();
  });

  test("rejection visibly requires feedback and editing resumes only after revision", async ({ browser }) => {
    const { context, page, getReviewRequests } = await openPolicies(
      browser,
      "admin",
      "/policies?tab=register&policy=draft-1",
      { width: 1280, height: 800 },
      { policy: { workflowStatus: "submitted" } },
    );

    const rejectionComment = page.getByTestId("input-policy-review-comment");
    const rejectButton = page.getByTestId("button-workflow-reject-policy");
    await expect(rejectionComment).toHaveAttribute("placeholder", /required/i);
    await expect(rejectionComment).toHaveAttribute("aria-label", /required/i);
    await expect(rejectButton).toBeDisabled();
    expect(getReviewRequests()).toBe(0);

    await rejectionComment.fill("Clarify operational responsibilities");
    await expect(rejectButton).toBeEnabled();
    await rejectButton.click();

    await expect(page.getByTestId("policy-rejection-guidance")).toContainText("Clarify operational responsibilities");
    await expect(page.getByTestId("textarea-purpose")).toBeDisabled();
    await expect(page.getByTestId("button-submit-policy-review")).toHaveCount(0);
    await expect(page.getByTestId("button-revise-policy")).toBeVisible();
    expect(getReviewRequests()).toBe(1);

    await page.getByTestId("button-revise-policy").click();
    await expect(page.getByTestId("textarea-purpose")).toBeEnabled();
    await expect(page.getByTestId("button-submit-policy-review")).toBeVisible();

    await context.close();
  });

  test("published generated policies expose a controlled new-revision path", async ({ browser }) => {
    const { context, page } = await openPolicies(
      browser,
      "admin",
      "/policies?tab=register&policy=draft-1",
      { width: 1280, height: 800 },
      { policy: { workflowStatus: "approved", status: "published" } },
    );

    await expect(page.getByTestId("badge-policy-status")).toContainText("published");
    await expect(page.getByTestId("textarea-purpose")).toBeDisabled();
    await expect(page.getByTestId("button-submit-policy-review")).toHaveCount(0);
    await expect(page.getByTestId("button-revise-policy")).toBeVisible();

    await page.getByTestId("button-revise-policy").click();
    await expect(page.getByTestId("badge-policy-status")).toContainText("draft");
    await expect(page.getByTestId("textarea-purpose")).toBeEnabled();
    await expect(page.getByTestId("button-submit-policy-review")).toBeVisible();

    await context.close();
  });

  test("direct approval mode has no submit control and locks approved content", async ({ browser }) => {
    const { context, page } = await openPolicies(
      browser,
      "admin",
      "/policies?tab=register&policy=draft-1",
      { width: 1280, height: 800 },
      {
        settings: { requireApprovalPolicies: false, autoLockApproved: true },
      },
    );

    await expect(page.getByTestId("button-submit-policy-review")).toHaveCount(0);
    await expect(page.getByTestId("button-approve-policy")).toBeVisible();
    await expect(page.getByTestId("textarea-purpose")).toBeEnabled();

    await page.getByTestId("button-approve-policy").click();
    await expect(page.getByTestId("badge-policy-status")).toContainText("approved");
    await expect(page.getByTestId("button-submit-policy-review")).toHaveCount(0);
    await expect(page.getByTestId("button-approve-policy")).toHaveCount(0);
    await expect(page.getByTestId("textarea-purpose")).toBeDisabled();
    await expect(page.getByTestId("button-revise-policy")).toBeVisible();

    await page.getByTestId("button-revise-policy").click();
    await expect(page.getByTestId("badge-policy-status")).toContainText("draft");
    await expect(page.getByTestId("textarea-purpose")).toBeEnabled();
    await expect(page.getByTestId("button-approve-policy")).toBeVisible();
    await expect(page.getByTestId("button-submit-policy-review")).toHaveCount(0);

    await context.close();
  });

  test("legacy policy routes preserve their intent through canonical redirects", async ({ browser }) => {
    const { context, page } = await openPolicies(browser, "admin", "/policy-templates");

    await expect(page).toHaveURL(/\/policies\?tab=templates$/);
    await expect(page.getByTestId("tab-policy-templates")).toHaveAttribute("aria-current", "page");

    await page.goto("/esg-policy-register");
    await expect(page).toHaveURL(/\/policies\?tab=register$/);
    await expect(page.getByTestId("tab-policy-register")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("nav-policies")).toHaveAttribute("aria-current", "page");

    await context.close();
  });

  test("viewer sees policies and drafts but no create, edit, delete or governance controls", async ({ browser }) => {
    const { context, page } = await openPolicies(browser, "viewer");

    await expect(page.getByTestId("policy-read-only-notice")).toBeVisible();
    await expect(page.getByTestId("policy-card-record-1")).toBeVisible();
    await expect(page.getByTestId("card-policy-draft-1")).toBeVisible();
    await expect(page.getByTestId("button-add-policy")).toHaveCount(0);
    await expect(page.getByTestId("button-edit-policy-record-1")).toHaveCount(0);
    await expect(page.getByTestId("button-delete-policy-record-1")).toHaveCount(0);
    await expect(page.getByTestId("button-create-from-template")).toHaveCount(0);
    await expect(page.getByTestId("button-delete-policy-draft-1")).toHaveCount(0);
    await expect(page.locator("[data-testid^='button-edit-governance-']")).toHaveCount(0);

    await page.getByTestId("tab-policy-templates").click();
    await expect(page.getByTestId("card-template-environmental-policy")).toBeVisible();
    await expect(page.getByTestId("button-use-template-environmental-policy")).toHaveCount(0);
    await expect(page.getByTestId("template-read-only-environmental-policy")).toBeVisible();

    await page.getByTestId("tab-policy-register").click();
    await page.getByTestId("button-view-policy-draft-1").click();
    await expect(page.getByTestId("generated-policy-viewer")).toBeVisible();
    await expect(page.getByTestId("textarea-purpose")).toBeDisabled();
    await expect(page.getByTestId("button-export-generated")).toBeVisible();
    await expect(page.getByTestId("button-submit-policy-review")).toHaveCount(0);
    await expect(page.getByTestId("button-save-generated")).toHaveCount(0);
    await expect(page.getByTestId("button-approve-policy")).toHaveCount(0);
    await expect(page.getByTestId("button-publish-generated")).toHaveCount(0);

    await context.close();
  });

  test("360px register and template views have no horizontal page overflow", async ({ browser }) => {
    const { context, page } = await openPolicies(browser, "admin", "/policies", { width: 360, height: 740 });

    await expect(page.getByTestId("page-policies")).toBeVisible();
    await expect(page.getByTestId("policies-workspace-tabs").getByRole("tab")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByTestId("tab-policy-templates").click();
    await expect(page.getByTestId("policy-template-library")).toBeVisible();
    await expect(page.getByTestId("button-use-template-environmental-policy")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await context.close();
  });
});
