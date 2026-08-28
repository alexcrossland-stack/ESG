const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CANONICAL_UTC_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{3}))?Z$/;

export function parseStrictCanonicalReportingDate(value: string): Date | null {
  if (DATE_ONLY_PATTERN.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? parsed : null;
  }

  const isoMatch = value.match(CANONICAL_UTC_PATTERN);
  if (!isoMatch) return null;
  const canonical = `${isoMatch[1]}.${isoMatch[2] ?? "000"}Z`;
  const parsed = new Date(canonical);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === canonical ? parsed : null;
}

/**
 * PostgreSQL `timestamp without time zone` columns store calendar fields, not
 * instants. Pass the UTC calendar fields as a string so node-postgres cannot
 * rewrite a UTC Date into the process timezone before persistence/equality.
 */
export function toCanonicalPgTimestamp(value: Date): string {
  if (!Number.isFinite(value.getTime())) {
    throw new RangeError("Canonical reporting timestamp must be a valid date");
  }
  return value.toISOString().slice(0, -1);
}

/**
 * Raw node-postgres reads parse a timestamp-without-time-zone wall clock in
 * the process timezone. Rebuild the same calendar fields as UTC to match
 * Drizzle's timestamp mapping.
 */
export function pgTimestampWithoutTimeZoneToUtc(value: Date): Date {
  if (!Number.isFinite(value.getTime())) {
    throw new RangeError("PostgreSQL timestamp must be a valid date");
  }
  return new Date(Date.UTC(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    value.getHours(),
    value.getMinutes(),
    value.getSeconds(),
    value.getMilliseconds(),
  ));
}
