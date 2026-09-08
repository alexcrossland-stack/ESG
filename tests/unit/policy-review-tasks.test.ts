import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPolicyReviewTasks } from "../../server/policy-review-tasks";
import { buildSmeImprovementPlan, type ControlCentreData } from "../../client/src/lib/sme-improvement-plan";
import { buildSmeOverviewTasks } from "../../client/src/lib/sme-overview-tasks";

const templateId = "7af948d4-081a-4362-9d74-0c76fd89d787";
const template = { id: templateId, slug: "information-security-policy", name: "Information Security Policy" };
const policy = { id: "policy / 1", title: "Acme — Information Security Policy", templateId, templateSlug: template.slug, workflowStatus: "draft" };

test("review tasks prefer the generated display title and preserve the encoded deep link", () => {
  const tasks = buildPolicyReviewTasks([policy], [template]);
  assert.equal(tasks[0].name, policy.title);
  assert.equal(tasks[0].linkUrl, "/policies?tab=register&policy=policy%20%2F%201");
});

test("blank and identifier titles fall back to template name by ID or historical slug", () => {
  for (const title of ["", "   ", templateId, `Policy ${templateId}`]) {
    assert.equal(buildPolicyReviewTasks([{ ...policy, title }], [template])[0].name, template.name);
    assert.equal(buildPolicyReviewTasks([{ ...policy, title, templateId: "removed-template" }], [template])[0].name, template.name);
  }
});

test("missing or malformed template names have a friendly fallback, never an identifier", () => {
  assert.equal(buildPolicyReviewTasks([{ ...policy, title: "" }], [])[0].name, "Policy");
  assert.equal(buildPolicyReviewTasks([{ ...policy, title: "" }], [{ ...template, name: templateId }])[0].name, "Policy");
  assert.deepEqual(buildPolicyReviewTasks([{ ...policy, workflowStatus: "approved" }], [template]), []);
});

test("Overview and Action plan both consume the same readable title and policy link", () => {
  const data: ControlCentreData = {
    gapScore: 0, missingData: [], lowQuality: [], expiredEvidence: [], overdueActions: [], pendingApprovals: [], unmetCompliance: [],
    unapprovedPolicies: buildPolicyReviewTasks([policy], [template]) as ControlCentreData["unapprovedPolicies"],
    summary: { missingData: 0, lowQuality: 0, expiredEvidence: 0, overdueActions: 0, pendingApprovals: 0, unapprovedPolicies: 1, unmetCompliance: 0 },
  };
  const plan = buildSmeImprovementPlan(data);
  const overview = buildSmeOverviewTasks(data, { canEnterData: true, canReview: true, canEditPolicies: true }, "2025-12");
  for (const task of [plan[0], overview[0]]) {
    assert.ok(task.title.includes(policy.title));
    assert.ok(!task.title.includes(templateId));
    assert.equal(task.href, data.unapprovedPolicies[0].linkUrl);
  }
});
