import assert from "node:assert/strict";
import { overviewPeriodContext, overviewReadinessUrl } from "../../client/src/lib/overview-period";

const now = new Date(2026, 8, 7);
assert.deepEqual(overviewPeriodContext("2025-12", now), { currentMonth: "2026-09", label: "December 2025", position: "past" });
assert.equal(overviewPeriodContext("2026-09", now).position, "current");
assert.equal(overviewPeriodContext("2027-01", now).position, "future");
assert.equal(overviewPeriodContext("2026-13", now).label, "Selected month");
assert.equal(overviewReadinessUrl("2025-12"), "/api/dashboard/readiness?period=2025-12");
assert.equal(overviewReadinessUrl("2025-12", "annual-id"), "/api/dashboard/readiness?period=annual-id");
assert.equal(overviewReadinessUrl("2025-12", "FY 2026 Q1"), "/api/dashboard/readiness?period=FY+2026+Q1");
console.log("PASS Overview preserves historical/future selections and complete saved-period readiness scope");
