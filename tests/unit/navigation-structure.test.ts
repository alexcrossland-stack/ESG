import assert from "node:assert/strict";

import {
  ACTION_PLAN_WORKSPACE_ROUTES,
  DATA_WORKSPACE_ROUTES,
  MAIN_NAV_TOP_LEVEL_LABELS,
  MORE_TOOLS_ROUTES,
  MORE_TOOLS_SECTIONS,
  POLICY_WORKSPACE_ROUTES,
  QUESTIONNAIRE_WORKSPACE_ROUTES,
  SETTINGS_MENU_HREF,
  SETTINGS_MENU_ROUTES,
  SME_PRIMARY_NAV_ITEMS,
  canShowAdminMenu,
  getAdminMenuHref,
  getAdminMenuRoutes,
  getBreadcrumbs,
  isNavItemActive,
} from "../../client/src/lib/navigation";

type TestResult = { name: string; passed: boolean; detail?: string };
const results: TestResult[] = [];

function check(name: string, assertion: () => void) {
  try {
    assertion();
    results.push({ name, passed: true });
    console.log("  PASS  " + name);
  } catch (error: any) {
    results.push({ name, passed: false, detail: error.message });
    console.error("  FAIL  " + name + " — " + error.message);
  }
}

function run() {
  check("Sidebar exposes seven clear SME workspaces", () => {
    assert.deepEqual([...MAIN_NAV_TOP_LEVEL_LABELS], [
      "Overview",
      "Data & evidence",
      "Policies",
      "Action plan",
      "Reports",
      "Questionnaires",
      "More tools",
    ]);
    assert.deepEqual(SME_PRIMARY_NAV_ITEMS.map(item => item.label), [...MAIN_NAV_TOP_LEVEL_LABELS]);
    assert.deepEqual(SME_PRIMARY_NAV_ITEMS.map(item => item.href), [
      "/",
      "/data-entry",
      "/policies",
      "/control-centre",
      "/reports",
      "/questionnaire",
      "/more-tools",
    ]);
  });

  check("Data workspace uses one role-safe route and preserves compatibility routes", () => {
    const dataWorkspace = SME_PRIMARY_NAV_ITEMS[1];
    assert.equal(dataWorkspace.href, "/data-entry");
    assert.equal(dataWorkspace.permission, undefined);
    assert.equal(dataWorkspace.fallbackHref, undefined);
    assert.deepEqual(dataWorkspace.activeRoutes, DATA_WORKSPACE_ROUTES);
    assert.equal(DATA_WORKSPACE_ROUTES.includes("/metrics"), true);
    assert.equal(DATA_WORKSPACE_ROUTES.includes("/metrics-library"), true);
  });

  check("Workspace highlighting follows related specialist routes", () => {
    const data = SME_PRIMARY_NAV_ITEMS.find(item => item.label === "Data & evidence")!;
    const policies = SME_PRIMARY_NAV_ITEMS.find(item => item.label === "Policies")!;
    const action = SME_PRIMARY_NAV_ITEMS.find(item => item.label === "Action plan")!;
    const questionnaires = SME_PRIMARY_NAV_ITEMS.find(item => item.label === "Questionnaires")!;
    const more = SME_PRIMARY_NAV_ITEMS.find(item => item.label === "More tools")!;

    assert.equal(isNavItemActive("/evidence", data), true);
    assert.equal(isNavItemActive("/metrics/abc", data), true);
    assert.equal(isNavItemActive("/data-entry?manage=metrics", data), true);
    assert.equal(isNavItemActive("/policies?tab=templates", policies), true);
    assert.equal(isNavItemActive("/policy", policies), true);
    assert.equal(isNavItemActive("/policy-generator", policies), true);
    assert.equal(isNavItemActive("/policy-templates", policies), true);
    assert.equal(isNavItemActive("/esg-policy-register", policies), true);
    assert.equal(isNavItemActive("/esg-targets", action), true);
    assert.equal(isNavItemActive("/answer-library", questionnaires), true);
    assert.equal(isNavItemActive("/framework-readiness", more), true);
    assert.equal(isNavItemActive("/reports", action), false);
    assert.equal(isNavItemActive("/policy-templates", action), false);
    assert.deepEqual(policies.activeRoutes, POLICY_WORKSPACE_ROUTES);
    assert.equal(ACTION_PLAN_WORKSPACE_ROUTES.includes("/policy"), false);
    assert.equal(ACTION_PLAN_WORKSPACE_ROUTES.includes("/policy-generator"), false);
    assert.equal(ACTION_PLAN_WORKSPACE_ROUTES.includes("/policy-templates"), false);
    assert.equal(ACTION_PLAN_WORKSPACE_ROUTES.includes("/esg-policy-register"), false);
    assert.equal(ACTION_PLAN_WORKSPACE_ROUTES.includes("/actions"), true);
    assert.equal(QUESTIONNAIRE_WORKSPACE_ROUTES.includes("/answer-library"), true);
    assert.equal(MORE_TOOLS_ROUTES.includes("/carbon-calculator"), true);
  });

  check("More Tools retains specialist capabilities and role restrictions", () => {
    assert.deepEqual(MORE_TOOLS_SECTIONS.map(section => section.label), [
      "Frameworks & assurance",
      "Company & governance",
      "Analysis & coordination",
    ]);
    const items = MORE_TOOLS_SECTIONS.flatMap(section => section.items);
    assert.equal(new Set(items.map(item => item.href)).size, items.length);
    for (const route of [
      "/framework-readiness",
      "/framework-settings",
      "/compliance",
      "/esg-profile",
      "/topics",
      "/materiality",
      "/carbon-calculator",
      "/benchmarks",
      "/my-tasks",
      "/my-approvals",
      "/team",
    ]) {
      assert.equal(items.some(item => item.href === route), true, route + " should remain reachable");
    }
    assert.equal(items.some(item => item.href === "/policy-templates"), false, "policy templates belong in Policies");
    assert.equal(items.some(item => item.href === "/esg-policy-register"), false, "policy register belongs in Policies");
    assert.equal(items.some(item => item.href === "/metrics-library"), false, "metric management belongs inside Metrics & data");
    assert.equal(items.find(item => item.href === "/team")?.permission, "settings_admin");
    assert.equal(items.find(item => item.href === "/framework-settings")?.permission, "settings_admin");
    assert.equal(items.find(item => item.href === "/my-approvals")?.permission, "report_generation");
  });

  check("Breadcrumbs reflect the new workspace model", () => {
    assert.deepEqual(getBreadcrumbs("/data-entry?highlight=estimated").map(item => item.label), ["Data & evidence"]);
    assert.deepEqual(getBreadcrumbs("/evidence").map(item => item.label), ["Data & evidence", "Documents"]);
    assert.deepEqual(getBreadcrumbs("/policies?tab=templates").map(item => item.label), ["Policies"]);
    assert.deepEqual(getBreadcrumbs("/policy").map(item => item.label), ["Policies", "ESG policy"]);
    assert.deepEqual(getBreadcrumbs("/policy-generator").map(item => item.label), ["Policies", "Policy generator"]);
    assert.deepEqual(getBreadcrumbs("/policy-templates").map(item => item.label), ["Policies", "Templates"]);
    assert.deepEqual(getBreadcrumbs("/esg-policy-register").map(item => item.label), ["Policies", "Register"]);
    assert.deepEqual(getBreadcrumbs("/esg-targets").map(item => item.label), ["Action plan", "Targets and actions"]);
    assert.deepEqual(getBreadcrumbs("/answer-library").map(item => item.label), ["Questionnaires", "Answer library"]);
    assert.deepEqual(getBreadcrumbs("/framework-settings").map(item => item.label), [
      "More tools",
      "Framework readiness",
      "Framework settings",
    ]);
    assert.deepEqual(getBreadcrumbs("/team").map(item => item.label), ["More tools", "Team"]);
  });

  check("Settings access helpers preserve existing role rules", () => {
    for (const role of ["admin", "super_admin"]) {
      assert.equal(canShowAdminMenu(role), true);
      assert.equal(getAdminMenuHref(role), SETTINGS_MENU_HREF);
      assert.deepEqual(getAdminMenuRoutes(role), SETTINGS_MENU_ROUTES);
    }
    for (const role of ["viewer", "contributor", "approver", undefined]) {
      assert.equal(canShowAdminMenu(role), false);
      assert.deepEqual(getAdminMenuRoutes(role), []);
    }
  });
}

console.log("\n=== Unit Tests: Navigation Structure ===\n");
run();
const passed = results.filter(result => result.passed).length;
console.log(`\n=== Navigation structure: ${passed}/${results.length} passed ===\n`);
if (passed < results.length) process.exit(1);
