import assert from "node:assert/strict";

import {
  DATA_AND_METRICS_ITEMS,
  ESG_SETUP_ADVANCED_SUPPORT_ITEMS,
  ESG_SETUP_BASE_ITEMS,
  ESG_SETUP_ADVANCED_PRIMARY_ITEMS,
  MAIN_NAV_TOP_LEVEL_LABELS,
  MOVED_MENU_ITEM_TARGETS,
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
    assert.deepEqual(labels(ESG_SETUP_BASE_ITEMS), [
      "Topics",
      "ESG Profile",
      "Team",
      "Policy Generator",
      "Policy Templates",
      "Control Centre",
      "Recommendations",
    ]);
    assert.equal(labels(ESG_SETUP_BASE_ITEMS).includes("Policy"), false);
    assert.equal(MOVED_MENU_ITEM_TARGETS.policyGenerator, "/policy-generator");
    assert.equal(MOVED_MENU_ITEM_TARGETS.policyTemplates, "/policy-templates");
    assert.equal(MOVED_MENU_ITEM_TARGETS.controlCentre, "/control-centre");
    assert.equal(MOVED_MENU_ITEM_TARGETS.recommendations, "/recommendations");
    pass("ESG Setup exposes moved policy and control items without the old Policy link");
  } catch (error: any) {
    fail("ESG Setup exposes moved policy and control items without the old Policy link", error.message);
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
    for (const movedLabel of ["Policy Generator", "Policy Templates", "Control Centre", "Recommendations"]) {
      assert.equal(labels(ESG_SETUP_ADVANCED_SUPPORT_ITEMS).includes(movedLabel), false);
    }
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
    pass("Policy Register is nested with Data and Metrics while retaining its route");
  } catch (error: any) {
    fail("Policy Register is nested with Data and Metrics while retaining its route", error.message);
  }

  try {
    assert.deepEqual(getBreadcrumbs("/materiality").map(item => item.label), [
      "ESG Setup",
      "Advanced",
      "Materiality",
    ]);
    assert.deepEqual(getBreadcrumbs("/policy-generator").map(item => item.label), [
      "ESG Setup",
      "Policy Generator",
    ]);
    assert.deepEqual(getBreadcrumbs("/control-centre").map(item => item.label), [
      "ESG Setup",
      "Control Centre",
    ]);
    assert.deepEqual(getBreadcrumbs("/esg-policy-register").map(item => item.label), [
      "Data and Evidence",
      "Data and Metrics",
      "Policy Register",
    ]);
    assert.deepEqual(getBreadcrumbs("/admin").map(item => item.label), [
      "Settings",
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
}

(async () => {
  console.log("\n=== Unit Tests: Navigation Structure ===\n");
  run();
  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Navigation structure: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
