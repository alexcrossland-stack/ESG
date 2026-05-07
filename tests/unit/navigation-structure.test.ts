import assert from "node:assert/strict";

import {
  DATA_AND_METRICS_ITEMS,
  ESG_SETUP_ADVANCED_PRIMARY_ITEMS,
  MAIN_NAV_TOP_LEVEL_LABELS,
  MOVED_MENU_ITEM_TARGETS,
  canShowAdminMenu,
  getBreadcrumbs,
  isGroupActive,
} from "../../client/src/lib/navigation";

type TestResult = { name: string; passed: boolean; detail?: string };
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function labels(items: { label: string }[]) {
  return items.map(item => item.label);
}

function run() {
  try {
    assert.deepEqual([...MAIN_NAV_TOP_LEVEL_LABELS], [
      "Dashboard",
      "ESG Setup",
      "Data and Evidence",
      "Reports",
    ]);
    pass("Primary sidebar menu exposes only the four required top-level labels");
  } catch (error: any) {
    fail("Primary sidebar menu exposes only the four required top-level labels", error.message);
  }

  try {
    assert.deepEqual(labels(ESG_SETUP_ADVANCED_PRIMARY_ITEMS).slice(0, 5), [
      "Frameworks",
      "Framework Settings",
      "Materiality",
      "Targets and Actions",
      "Risk Register",
    ]);
    assert.equal(MOVED_MENU_ITEM_TARGETS.frameworks, "/framework-readiness");
    assert.equal(MOVED_MENU_ITEM_TARGETS.materiality, "/materiality");
    assert.equal(MOVED_MENU_ITEM_TARGETS.targetsAndActions, "/esg-targets");
    assert.equal(MOVED_MENU_ITEM_TARGETS.riskRegister, "/esg-risks");
    pass("Moved ESG Setup advanced items keep their existing page targets");
  } catch (error: any) {
    fail("Moved ESG Setup advanced items keep their existing page targets", error.message);
  }

  try {
    assert.deepEqual(labels(DATA_AND_METRICS_ITEMS), [
      "Metrics",
      "Metrics Library",
      "Enter Data",
      "Policy Register",
    ]);
    assert.equal(MOVED_MENU_ITEM_TARGETS.policyRegister, "/esg-policy-register");
    pass("Policy Register is directly under Data and Evidence while retaining its route");
  } catch (error: any) {
    fail("Policy Register is directly under Data and Evidence while retaining its route", error.message);
  }

  try {
    assert.deepEqual(getBreadcrumbs("/materiality").map(item => item.label), [
      "ESG Setup",
      "Advanced",
      "Materiality",
    ]);
    assert.deepEqual(getBreadcrumbs("/esg-policy-register").map(item => item.label), [
      "Data and Evidence",
      "Policy Register",
    ]);
    pass("Moved pages resolve to the updated breadcrumb hierarchy");
  } catch (error: any) {
    fail("Moved pages resolve to the updated breadcrumb hierarchy", error.message);
  }

  try {
    assert.equal(isGroupActive("/esg-targets", ["/materiality", "/esg-targets", "/esg-risks"]), true);
    assert.equal(isGroupActive("/esg-policy-register", ["/metrics", "/metrics-library", "/data-entry", "/esg-policy-register"]), true);
    pass("Active route matching recognizes moved items in their new groups");
  } catch (error: any) {
    fail("Active route matching recognizes moved items in their new groups", error.message);
  }

  try {
    assert.equal(canShowAdminMenu("super_admin"), true);
    assert.equal(canShowAdminMenu("admin"), false);
    assert.equal(canShowAdminMenu("viewer"), false);
    assert.equal(canShowAdminMenu(undefined), false);
    pass("Admin navigation is visible only to authorised platform admins");
  } catch (error: any) {
    fail("Admin navigation is visible only to authorised platform admins", error.message);
  }
}

(async () => {
  console.log("\n=== Unit Tests: Navigation Structure ===\n");
  run();
  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Navigation structure: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
