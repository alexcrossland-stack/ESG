import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

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

async function run() {
  const tenants = await seedTestTenants();
  const adminToken = tenants.tenantA.adminToken;

  {
    const name = "Admin can create a policy record when optional fields are blank";
    const res = await apiRequest("POST", "/api/policy-records", {
      title: `QA Policy ${Date.now()}`,
      policyType: "other",
      owner: "",
      status: "draft",
      effectiveDate: "",
      reviewDate: "",
      documentLink: "",
      notes: "",
    }, adminToken);

    if (![200, 201].includes(res.status)) {
      fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    } else {
      const body = JSON.parse(res.body) as {
        title?: string;
        effectiveDate?: string | null;
        reviewDate?: string | null;
        documentLink?: string | null;
        notes?: string | null;
      };
      if (body.effectiveDate !== null || body.reviewDate !== null || body.documentLink !== null || body.notes !== null) {
        fail(name, `expected blank optional fields to normalize to null, got ${res.body.slice(0, 200)}`);
      } else if (!body.title) {
        fail(name, "missing created title");
      } else {
        pass(name, body.title);
      }
    }
  }
}

(async () => {
  console.log("\n=== API Tests: Policy Records ===\n");
  try {
    await run();
  } catch (error) {
    console.error("TEST FAILED:", error);
    process.exit(1);
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Policy records: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
