import assert from "node:assert/strict";

import {
  ADVANCED_NAV_ITEMS,
  ADVANCED_NAV_ROUTES,
  ADVANCED_NAV_SECTIONS,
  MAIN_NAV_TOP_LEVEL_LABELS,
  SME_PRIMARY_NAV_ITEMS,
  getBreadcrumbs,
  isGroupActive,
} from "../../client/src/lib/navigation";

type TestResult = { name: string; passed: boolean; detail?: string };
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log("  PASS  " + name + (detail ? " — " + detail : ""));
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error("  FAIL  " + name + (detail ? " — " + detail : ""));
}

function labels(items: { label: string }[]) {
  return items.map(item => item.label);
}

function run() {
  try {
    assert.deepEqual([...MAIN_NAV_TOP_LEVEL_LABELS], [
      "Home",
      "Measure",
      "Improve",
      "Share",
      "Advanced",
    ]);
    assert.deepEqual(labels(SME_PRIMARY_NAV_ITEMS), ["Home", "Measure", "Improve", "Share"]);
    pass("Primary sidebar exposes four SME jobs plus progressive disclosure");
  } catch (error: any) {
    fail("Primary sidebar exposes four SME jobs plus progressive disclosure", error.message);
  }

  try {
    assert.deepEqual(SME_PRIMARY_NAV_ITEMS.map(item => item.href), [
      "/",
      "/data-entry",
      "/control-centre",
      "/reports",
    ]);
    const measure = SME_PRIMARY_NAV_ITEMS.find(item => item.label === "Measure");
    assert.equal(measure?.permission, "metrics_data_entry");
    assert.equal(measure?.fallbackHref, "/metrics");
    pass("Core destinations retain existing routes and a read-only Measure fallback");
  } catch (error: any) {
    fail("Core destinations retain existing routes and a read-only Measure fallback", error.message);
  }

  try {
    assert.deepEqual(labels(ADVANCED_NAV_SECTIONS), [
      "Plan and improve",
      "Measure and assure",
      "Share and coordinate",
    ]);
    assert.equal(new Set(ADVANCED_NAV_ROUTES).size, ADVANCED_NAV_ROUTES.length);
    for (const route of [
      "/policy",
      "/policy-generator",
      "/policy-templates",
      "/esg-policy-register",
      "/actions",
      "/framework-readiness",
      "/framework-settings",
      "/materiality",
      "/esg-targets",
      "/esg-risks",
      "/compliance",
      "/benchmarks",
      "/my-tasks",
      "/my-approvals",
      "/questionnaire",
      "/answer-library",
      "/carbon-calculator",
      "/evidence",
      "/team",
    ]) {
      assert.equal(ADVANCED_NAV_ROUTES.includes(route), true, route + " should remain reachable");
    }
    pass("Advanced retains specialist and formerly hidden deep links");
  } catch (error: any) {
    fail("Advanced retains specialist and formerly hidden deep links", error.message);
  }

  try {
    const byHref = new Map(ADVANCED_NAV_ITEMS.map(item => [item.href, item]));
    assert.equal(byHref.get("/team")?.permission, "settings_admin");
    assert.equal(byHref.get("/framework-settings")?.permission, "settings_admin");
    assert.equal(byHref.get("/my-approvals")?.permission, "report_generation");
    pass("Advanced navigation preserves existing role-based visibility");
  } catch (error: any) {
    fail("Advanced navigation preserves existing role-based visibility", error.message);
  }

  try {
    assert.deepEqual(getBreadcrumbs("/materiality").map(item => item.label), [
      "Improve",
      "Materiality",
    ]);
    assert.deepEqual(getBreadcrumbs("/policy-generator").map(item => item.label), [
      "Improve",
      "Policies",
      "Policy Generator",
    ]);
    assert.deepEqual(getBreadcrumbs("/metrics-library").map(item => item.label), [
      "Measure",
      "Metrics Library",
    ]);
    assert.deepEqual(getBreadcrumbs("/framework-settings").map(item => item.label), [
      "Share",
      "Frameworks",
      "Framework Settings",
    ]);
    assert.deepEqual(getBreadcrumbs("/answer-library").map(item => item.label), [
      "Share",
      "Questionnaires",
      "Answer Library",
    ]);
    assert.deepEqual(getBreadcrumbs("/team").map(item => item.label), [
      "Settings",
      "Team",
    ]);
    pass("Breadcrumbs use the simplified task-based hierarchy");
  } catch (error: any) {
    fail("Breadcrumbs use the simplified task-based hierarchy", error.message);
  }

  try {
    assert.equal(isGroupActive("/esg-targets", ADVANCED_NAV_ROUTES), true);
    assert.equal(isGroupActive("/metrics-library", ADVANCED_NAV_ROUTES), true);
    assert.equal(isGroupActive("/reports", ADVANCED_NAV_ROUTES), false);
    assert.deepEqual(getBreadcrumbs("/data-entry?highlight=estimated").map(item => item.label), ["Measure"]);
    pass("Active route matching and query-string breadcrumbs remain stable");
  } catch (error: any) {
    fail("Active route matching and query-string breadcrumbs remain stable", error.message);
  }
}

(async () => {
  console.log("\n=== Unit Tests: Navigation Structure ===\n");
  run();
  const passed = results.filter(result => result.passed).length;
  const total = results.length;
  console.log("\n=== Navigation structure: " + passed + "/" + total + " passed ===\n");
  if (passed < total) process.exit(1);
})();
