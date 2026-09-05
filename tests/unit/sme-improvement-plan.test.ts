import assert from "node:assert/strict";

import {
  buildSmeImprovementPlan,
  countOpenImprovementItems,
  SME_IMPROVEMENT_PLAN_LIMIT,
  type ControlCentreData,
} from "../../client/src/lib/sme-improvement-plan";

const data: ControlCentreData = {
  gapScore: 42,
  overdueActions: [
    {
      id: "action-later",
      name: "Finish supplier review",
      dueDate: "2026-08-20T00:00:00.000Z",
      owner: "Procurement",
      linkUrl: "/actions",
    },
    {
      id: "action-oldest",
      name: "Complete energy audit",
      dueDate: "2026-08-01T00:00:00.000Z",
      owner: "Operations",
      linkUrl: "/actions",
    },
  ],
  missingData: [
    {
      id: "metric-missing",
      name: "Water use",
      category: "environmental",
      owner: "Facilities",
      linkUrl: "/data-entry",
    },
  ],
  expiredEvidence: [
    {
      id: "evidence-expired",
      name: "Electricity invoice.pdf",
      expiryDate: "2026-07-31T00:00:00.000Z",
      linkedModule: "metric_value",
      linkUrl: "/evidence",
    },
  ],
  lowQuality: [
    {
      id: "metric-quality",
      name: "Business travel",
      category: "environmental",
      score: 15,
      owner: null,
      linkUrl: "/data-entry",
    },
  ],
  unmetCompliance: [
    {
      id: "requirement-open",
      code: "VSME B3",
      title: "Energy and emissions",
      framework: "VSME",
      linkUrl: "/compliance",
    },
  ],
  pendingApprovals: [
    {
      id: "approval-open",
      name: "Waste diverted",
      entityType: "metric_value",
      period: "2026-08",
      linkUrl: "/my-approvals",
    },
  ],
  unapprovedPolicies: [
    {
      id: "policy-draft",
      name: "Responsible sourcing policy",
      status: "pending_review",
      linkUrl: "/policies?tab=register&policy=policy-draft",
    },
  ],
  summary: {
    overdueActions: 2,
    missingData: 1,
    expiredEvidence: 1,
    lowQuality: 1,
    unmetCompliance: 1,
    pendingApprovals: 1,
    unapprovedPolicies: 1,
  },
};

const shortPlan = buildSmeImprovementPlan(data);

assert.equal(shortPlan.length, SME_IMPROVEMENT_PLAN_LIMIT, "the primary plan stays intentionally short");
assert.deepEqual(
  shortPlan.map((item) => item.id),
  ["action-oldest", "action-later", "evidence-expired", "approval-open", "metric-missing"],
  "urgent sections are ranked first, with the oldest due date and weakest data first within a section",
);

for (const item of shortPlan) {
  assert.ok(item.title, "every plan item has a next action");
  assert.ok(item.owner, "every plan item has an explicit owner state");
  assert.ok(item.status, "every plan item has a status");
  assert.ok(item.evidenceOrResult, "every plan item explains its evidence or result state");
  assert.ok(item.why, "every plan item explains why it matters");
  assert.ok(item.href.startsWith("/"), "every plan item routes into an existing workflow");
}

assert.equal(shortPlan[0].owner, "Operations");
assert.equal(shortPlan[0].dueDate, "2026-08-01T00:00:00.000Z");
assert.equal(shortPlan[0].evidenceOrResult, "Result not yet recorded");
const qualityItem = buildSmeImprovementPlan(data, 20).find(item => item.id === "metric-quality")!;
assert.equal(qualityItem.owner, "Unassigned", "missing ownership is visible instead of silently omitted");
assert.equal(qualityItem.evidenceOrResult, "Quality score: 15/100");

const fullPlan = buildSmeImprovementPlan(data, 20);
assert.deepEqual(
  fullPlan.map((item) => item.type),
  [
    "overdueActions",
    "overdueActions",
    "expiredEvidence",
    "pendingApprovals",
    "missingData",
    "lowQuality",
    "unmetCompliance",
    "unapprovedPolicies",
  ],
);
assert.equal(
  fullPlan.at(-1)?.href,
  "/policies?tab=register&policy=policy-draft",
  "generated policy work opens the matching draft in the unified register",
);
assert.equal(fullPlan.at(-1)?.evidenceOrResult, "Current state: Pending Review");
assert.equal(countOpenImprovementItems(data), 8);
assert.deepEqual(buildSmeImprovementPlan(data, 0), []);

console.log("SME improvement plan prioritisation tests passed");
