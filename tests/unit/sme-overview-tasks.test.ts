import assert from "node:assert/strict";
import { test } from "node:test";
import { hasPermission } from "../../shared/role-permissions";
import { buildSmeImprovementPlan, type ControlCentreData } from "../../client/src/lib/sme-improvement-plan";
import { buildSmeOverviewTasks, formatOverviewTaskDate, type OverviewTaskPermissions } from "../../client/src/lib/sme-overview-tasks";

function emptyData(): ControlCentreData {
  return {
    gapScore: 0,
    missingData: [], lowQuality: [], expiredEvidence: [], overdueActions: [],
    pendingApprovals: [], unapprovedPolicies: [], unmetCompliance: [],
    summary: { missingData: 0, lowQuality: 0, expiredEvidence: 0, overdueActions: 0, pendingApprovals: 0, unapprovedPolicies: 0, unmetCompliance: 0 },
  };
}

function permissions(role: string | undefined): OverviewTaskPermissions {
  return {
    canEnterData: hasPermission(role, "metrics_data_entry"),
    canReview: hasPermission(role, "report_generation"),
    canEditPolicies: hasPermission(role, "policy_editing"),
  };
}

function metric(id: string, name: string, category = "social") {
  return { id, name, category, linkUrl: `/data-entry?metric=${id}&period=2025-12` };
}

test("Overview preserves urgent priority and oldest deadlines before adding routine variety", () => {
  const data = emptyData();
  data.overdueActions = [
    { id: "recent", name: "Recently overdue", dueDate: "2025-12-02", owner: "Jamie", linkUrl: "/actions?task=recent" },
    { id: "oldest", name: "Oldest overdue", dueDate: "2025-11-01", owner: null, linkUrl: "/actions?task=oldest" },
  ];
  data.expiredEvidence = [{ id: "evidence", name: "Certificate", expiryDate: "2025-10-01", linkedModule: "metric", linkUrl: "/evidence" }];
  data.pendingApprovals = [{ id: "review", name: "Submission", entityType: "metric_value", linkUrl: "/my-approvals" }];
  data.missingData = [metric("electricity", "Electricity", "environmental")];
  const tasks = buildSmeOverviewTasks(data, permissions("admin"), "2025-12");
  assert.deepEqual(tasks.map((task) => task.id), ["oldest", "recent", "evidence"]);
  assert.equal(tasks[0].href, "/actions?task=oldest");
  assert.equal(tasks[0].ownerLabel, "Owner not assigned");
  assert.equal(tasks[1].ownerLabel, "Owner: Jamie");
});

test("Overview varies routine followups without changing the Action plan or any source record", () => {
  const data = emptyData();
  data.missingData = [metric("employees", "Employees"), metric("headcount", "Total headcount"), metric("fte", "Full-time equivalent employees")];
  data.lowQuality = [{ ...metric("water", "Water", "environmental"), score: 20 }];
  data.unapprovedPolicies = [{ id: "policy", name: "Environmental policy", status: "draft", linkUrl: "/policies?tab=register&policy=policy" }];
  const before = structuredClone(data);
  const originalPlan = buildSmeImprovementPlan(data, 100);
  const tasks = buildSmeOverviewTasks(data, permissions("admin"), "2025-12");
  assert.equal(tasks[0].id, originalPlan[0].id);
  assert.deepEqual(tasks.map((task) => task.type), ["missingData", "lowQuality", "unapprovedPolicies"]);
  assert.equal(tasks.filter((task) => ["employees", "headcount", "fte"].includes(task.id)).length, 1);
  assert.deepEqual(data, before);
  assert.deepEqual(buildSmeImprovementPlan(data, 100), originalPlan);
  for (const task of tasks) assert.equal(task.href, originalPlan.find((entry) => entry.key === task.key)?.href);
});

test("Where only data gaps exist, Overview prefers different metrics and ESG pillars before headcount variants", () => {
  const data = emptyData();
  data.missingData = [
    metric("employees", "Employees"), metric("headcount", "Total headcount"), metric("fte", "FTE"),
    metric("water", "Water", "environmental"), metric("board", "Board meetings", "governance"),
  ];
  const tasks = buildSmeOverviewTasks(data, permissions("contributor"), "2025-12");
  assert.equal(tasks[0].id, "employees");
  assert.deepEqual(new Set(tasks.map((task) => task.id)), new Set(["employees", "board", "water"]));
  assert.equal(data.missingData.length, 5, "headcount records must remain available in the full plan");
});

test("Distinct metrics remain independently linked when no varied alternatives exist", () => {
  const data = emptyData();
  data.missingData = [metric("employees", "Employees"), metric("headcount", "Total headcount"), metric("fte", "FTE")];
  const tasks = buildSmeOverviewTasks(data, permissions("contributor"), "2025-12");
  assert.equal(tasks.length, 3);
  assert.equal(new Set(tasks.map((task) => task.key)).size, 3);
  assert.equal(new Set(tasks.map((task) => task.href)).size, 3);
});

test("Viewers and editors never receive a forbidden approvals link or approval CTA", () => {
  const data = emptyData();
  data.pendingApprovals = [
    { id: "metric-review", name: "Water", entityType: "metric_value", period: "2025-11", linkUrl: "/my-approvals" },
    { id: "report-review", name: "Report", entityType: "report", linkUrl: "/my-approvals" },
  ];
  data.unapprovedPolicies = [{ id: "policy", name: "Environmental policy", status: "draft", linkUrl: "/policies?tab=register&policy=policy" }];
  for (const role of ["viewer", "editor", "contributor", undefined]) {
    const tasks = buildSmeOverviewTasks(data, permissions(role), "2025-12");
    assert.equal(tasks.find((task) => task.id === "metric-review")?.href, "/data-entry?period=2025-11");
    assert.equal(tasks.find((task) => task.id === "report-review")?.href, "/reports?period=2025-12");
    assert.equal(tasks.find((task) => task.id === "policy")?.actionLabel, "View policy");
    assert.equal(tasks.some((task) => task.href.includes("my-approvals")), false);
    assert.equal(tasks.some((task) => /approve|edit policy/i.test(task.actionLabel)), false);
  }
  const approverTasks = buildSmeOverviewTasks(data, permissions("approver"), "2025-12");
  assert.equal(approverTasks.find((task) => task.id === "metric-review")?.href, "/my-approvals");
  assert.equal(approverTasks.find((task) => task.id === "policy")?.actionLabel, "View policy");
  const adminTasks = buildSmeOverviewTasks(data, permissions("admin"), "2025-12");
  assert.equal(adminTasks.find((task) => task.id === "policy")?.actionLabel, "Review policy");
});

test("Read-only users can view data, evidence and actions without an editing instruction", () => {
  const data = emptyData();
  data.overdueActions = [{ id: "action", name: "Improve recycling", dueDate: "2025-11-01", owner: "cd33999e-d55c-49d7-91ea-5cfc6d474ec3", linkUrl: "/actions" }];
  data.expiredEvidence = [{ id: "evidence", name: "Certificate", expiryDate: "2025-10-01", linkedModule: "metric", linkUrl: "/evidence" }];
  data.missingData = [metric("employees", "Employees")];
  const viewerTasks = buildSmeOverviewTasks(data, permissions("viewer"), "2025-12");
  assert.deepEqual(viewerTasks.map((task) => task.actionLabel), ["View action", "View evidence", "View data"]);
  assert.equal(viewerTasks[0].ownerLabel, "Owner: Assigned team member");
  assert.equal(viewerTasks[1].ownerLabel, "Company-wide work", "missing ownership information must not imply no one is assigned");
  assert.equal(viewerTasks[2].title, "Data needed: Employees");
  assert.equal(viewerTasks.some((task) => /assigned to you/i.test(task.ownerLabel)), false);
  const editorTasks = buildSmeOverviewTasks(data, permissions("editor"), "2025-12");
  assert.deepEqual(editorTasks.map((task) => task.actionLabel), ["Open action", "Replace evidence", "Add data"]);
});

test("No data or an empty check returns no tasks; invalid dates never render Invalid Date", () => {
  assert.deepEqual(buildSmeOverviewTasks(undefined, permissions("viewer"), "2025-12"), []);
  assert.deepEqual(buildSmeOverviewTasks(null, permissions("admin"), "2025-12"), []);
  assert.deepEqual(buildSmeOverviewTasks(emptyData(), permissions("admin"), "2025-12"), []);
  assert.equal(formatOverviewTaskDate(null), null);
  assert.equal(formatOverviewTaskDate("not-a-date"), null);
  assert.equal(formatOverviewTaskDate("2025-12-01"), "1 Dec 2025");
});

test("Legacy missing or null metric categories cannot crash Overview task selection", () => {
  const data = emptyData();
  data.missingData = [
    { ...metric("employees", "Employees"), category: null },
    { ...metric("water", "Water"), category: undefined },
    metric("energy", "Energy", "environmental"),
  ] as unknown as ControlCentreData["missingData"];
  const tasks = buildSmeOverviewTasks(data, permissions("viewer"), "2025-12");
  assert.equal(tasks.length, 3);
  assert.equal(new Set(tasks.map((task) => task.id)).size, 3);
});
