import { buildAssuranceEvidenceHistoryEntry } from "../../server/assurance-pack";

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

console.log("\n=== Unit: Assurance Pack Evidence ===\n");

check("maps canonical evidence-file fields into the assurance history", () => {
  const uploadedAt = new Date("2026-08-20T10:00:00Z");
  const entry = buildAssuranceEvidenceHistoryEntry({
    id: "evidence-1",
    filename: "energy-bill.pdf",
    evidenceStatus: "approved",
    linkedModule: "metric_value",
    linkedEntityId: "value-1",
    metricId: "metric-1",
    linkedPeriod: "2025",
    siteId: "site-1",
    uploadedAt,
    uploadedBy: "user-1",
    reviewedAt: new Date("2026-08-21T10:00:00Z"),
    reviewedBy: "reviewer-1",
    expiryDate: new Date("2027-08-20T10:00:00Z"),
  });

  assert(entry.fileName === "energy-bill.pdf", `unexpected filename ${entry.fileName}`);
  assert(entry.status === "approved", `unexpected status ${entry.status}`);
  assert(entry.uploadedAt === uploadedAt, "canonical uploadedAt was not retained");
  assert(entry.linkedPeriod === "2025", "reporting period was not retained");
  assert(entry.siteId === "site-1", "site scope was not retained");
  assert(entry.reviewedBy === "reviewer-1", "reviewer was not retained");
});

check("supports legacy evidence aliases without dropping the audit record", () => {
  const createdAt = new Date("2025-01-02T12:00:00Z");
  const entry = buildAssuranceEvidenceHistoryEntry({
    id: "legacy-1",
    fileName: "legacy.csv",
    status: "uploaded",
    createdAt,
  });

  assert(entry.fileName === "legacy.csv", "legacy filename alias was not mapped");
  assert(entry.status === "uploaded", "legacy status alias was not mapped");
  assert(entry.uploadedAt === createdAt, "legacy createdAt alias was not mapped");
});

const passed = results.filter((result) => result.passed).length;
console.log(`\n=== Assurance Pack Evidence: ${passed}/${results.length} passed ===\n`);
if (passed !== results.length) process.exit(1);
