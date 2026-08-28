import assert from "node:assert/strict";
import {
  parseStrictCanonicalReportingDate,
  pgTimestampWithoutTimeZoneToUtc,
  toCanonicalPgTimestamp,
} from "../../server/canonical-reporting-date";

const previousTimezone = process.env.TZ;
process.env.TZ = "Europe/London";

try {
  const juneBoundary = new Date("2095-06-01T00:00:00.000Z");
  assert.equal(juneBoundary.getHours(), 1, "regression must exercise British Summer Time");
  assert.equal(
    toCanonicalPgTimestamp(juneBoundary),
    "2095-06-01T00:00:00.000",
    "raw PostgreSQL parameters must retain the UTC reporting calendar boundary",
  );

  const rawPgTimestamp = new Date(2095, 5, 1, 0, 0, 0, 0);
  assert.equal(rawPgTimestamp.toISOString(), "2095-05-31T23:00:00.000Z");
  assert.equal(
    pgTimestampWithoutTimeZoneToUtc(rawPgTimestamp).toISOString(),
    "2095-06-01T00:00:00.000Z",
    "raw PostgreSQL results must map the stored wall clock to the same UTC calendar fields as Drizzle",
  );

  assert.equal(parseStrictCanonicalReportingDate("2095-06-01")?.toISOString(), "2095-06-01T00:00:00.000Z");
  assert.equal(parseStrictCanonicalReportingDate("2095-06-30T23:59:59.999Z")?.toISOString(), "2095-06-30T23:59:59.999Z");
  assert.equal(parseStrictCanonicalReportingDate("2095-06-01T00:00:00+01:00"), null);
  assert.equal(parseStrictCanonicalReportingDate("2095-06-01T00:00:00"), null);
  assert.equal(parseStrictCanonicalReportingDate("2095-02-29"), null);
  assert.throws(() => toCanonicalPgTimestamp(new Date(Number.NaN)), /valid date/);
  assert.throws(() => pgTimestampWithoutTimeZoneToUtc(new Date(Number.NaN)), /valid date/);
} finally {
  if (previousTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = previousTimezone;
}

console.log("canonical reporting date tests passed");
