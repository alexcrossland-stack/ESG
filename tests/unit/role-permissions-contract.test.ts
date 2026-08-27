import {
  getUserPermissions,
  hasPermission,
  hasProvisioningPermission,
  ROLE_PERMISSIONS,
} from "../../shared/role-permissions";
import { getAllowedActions } from "../../server/permissions";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function check(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`  PASS  ${name}`);
  } catch (error: any) {
    results.push({ name, passed: false, detail: error?.message || String(error) });
    console.error(`  FAIL  ${name} - ${error?.message || String(error)}`);
  }
}

console.log("\n=== Unit contract: Canonical role permissions ===\n");

check("contributor can enter data but cannot edit policies", () => {
  assert(hasPermission("contributor", "metrics_data_entry"), "contributor lost metric entry UI permission");
  assert(!hasPermission("contributor", "policy_editing"), "contributor retained policy editing UI permission");
  assert(hasProvisioningPermission("contributor", "enter_metric_data"), "contributor lost metric entry API permission");
  assert(!hasProvisioningPermission("contributor", "manage_policies"), "contributor retained policy editing API permission");
});

check("approver can report but metric and evidence entry are read-only", () => {
  assert(hasPermission("approver", "report_generation"), "approver lost report UI permission");
  assert(hasPermission("approver", "questionnaire_access"), "approver lost questionnaire UI permission");
  assert(!hasPermission("approver", "metrics_data_entry"), "approver retained metric entry UI permission");
  assert(hasProvisioningPermission("approver", "generate_report"), "approver lost report API permission");
  assert(!hasProvisioningPermission("approver", "enter_metric_data"), "approver retained metric entry API permission");
  assert(!hasProvisioningPermission("approver", "upload_evidence"), "approver retained evidence upload API permission");
});

check("company admin has all company UI modules and expected write actions", () => {
  assert(ROLE_PERMISSIONS.admin.length === 7, `expected 7 admin UI modules, found ${ROLE_PERMISSIONS.admin.length}`);
  for (const action of ["enter_metric_data", "upload_evidence", "generate_report", "manage_policies", "invite_user"] as const) {
    assert(hasProvisioningPermission("admin", action), `admin missing ${action}`);
  }
});

check("metric targets are restricted to company or platform admins", () => {
  assert(hasProvisioningPermission("admin", "manage_targets"), "admin cannot manage metric targets");
  assert(hasProvisioningPermission("super_admin", "manage_targets"), "super admin cannot manage metric targets");
  for (const role of ["contributor", "approver", "viewer"] as const) {
    assert(!hasProvisioningPermission(role, "manage_targets"), `${role} can manage metric targets`);
  }
});

check("legacy editor normalizes to contributor in both matrices", () => {
  assert(hasPermission("editor", "metrics_data_entry"), "legacy editor was not normalized for UI permission");
  assert(!hasPermission("editor", "policy_editing"), "legacy editor bypassed policy restriction");
  assert(hasProvisioningPermission("editor", "enter_metric_data"), "legacy editor was not normalized for API permission");
  assert(getUserPermissions("editor").join(",") === getUserPermissions("contributor").join(","), "legacy editor UI actions drifted");
  assert(getAllowedActions("editor").join(",") === getAllowedActions("contributor").join(","), "legacy editor API actions drifted");
});

const failed = results.filter((result) => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) process.exit(1);
