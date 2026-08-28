import { sql } from "drizzle-orm";

export type ReportingPeriodDateRange = {
  startDate: Date;
  endDate: Date;
};

const MONTH_PERIOD_RE = /^(\d{4})-(\d{2})$/;
const QUARTER_PERIOD_RE = /^(\d{4})-Q([1-4])$/;
const YEAR_PERIOD_RE = /^(\d{4})$/;
export const MAX_REPORTING_RANGE_LOCK_MONTHS = 240;

function reportingMonthIndex(period: string): number {
  const match = MONTH_PERIOD_RE.exec(period);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  if (!match || !Number.isInteger(year) || year < 1000 || year > 9999 || month < 1 || month > 12) {
    throw new RangeError("Reporting period month bounds must use YYYY-MM with four-digit years");
  }
  return year * 12 + month - 1;
}

/**
 * Expands inclusive calendar-month bounds without interpreting them through a
 * JavaScript or database-session timezone.
 */
export function reportingMonthsForMonthBounds(
  startPeriod: string,
  endPeriod: string,
  maxMonths = MAX_REPORTING_RANGE_LOCK_MONTHS,
): string[] {
  if (!Number.isInteger(maxMonths) || maxMonths < 1) {
    throw new RangeError("Reporting period month limit must be a positive integer");
  }

  const startIndex = reportingMonthIndex(startPeriod);
  const endIndex = reportingMonthIndex(endPeriod);
  const monthCount = endIndex - startIndex + 1;
  if (monthCount < 1) {
    throw new RangeError("Reporting period dates must form a valid ascending range");
  }
  if (monthCount > maxMonths) {
    throw new RangeError(`Reporting period may span at most ${maxMonths} calendar months`);
  }

  return Array.from({ length: monthCount }, (_, offset) => {
    const monthIndex = startIndex + offset;
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    return `${year}-${String(month + 1).padStart(2, "0")}`;
  });
}

/**
 * Resolves every supported canonical data-entry period to its monthly lock
 * scopes. Quarterly and annual legacy entries remain supported without
 * allowing alternate month spellings to bypass a monthly lock.
 */
export function dataEntryPeriodMonths(period: unknown): string[] | null {
  if (typeof period !== "string") return null;
  try {
    if (MONTH_PERIOD_RE.test(period)) {
      return reportingMonthsForMonthBounds(period, period);
    }
    const quarter = QUARTER_PERIOD_RE.exec(period);
    if (quarter) {
      const year = quarter[1];
      const startMonth = (Number(quarter[2]) - 1) * 3 + 1;
      return reportingMonthsForMonthBounds(
        `${year}-${String(startMonth).padStart(2, "0")}`,
        `${year}-${String(startMonth + 2).padStart(2, "0")}`,
      );
    }
    const annual = YEAR_PERIOD_RE.exec(period);
    if (annual) {
      return reportingMonthsForMonthBounds(`${annual[1]}-01`, `${annual[1]}-12`);
    }
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
  return null;
}

export function reportingMonthBounds(period: string): { start: Date; end: Date } | null {
  const match = MONTH_PERIOD_RE.exec(period);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;

  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  };
}

export function lockedReportingRangeOverlapsMonth(
  period: string,
  range: ReportingPeriodDateRange,
): boolean {
  const month = reportingMonthBounds(period);
  if (!month) return false;

  return range.startDate <= month.end && range.endDate >= month.start;
}

/**
 * Expands an inclusive reporting date range into the YYYY-MM advisory-lock
 * scopes it overlaps. The cap prevents malformed or hostile persisted ranges
 * from holding an unbounded number of PostgreSQL advisory locks.
 */
export function reportingMonthsForDateRange(
  range: ReportingPeriodDateRange,
  maxMonths = MAX_REPORTING_RANGE_LOCK_MONTHS,
): string[] {
  const startTime = range.startDate.getTime();
  const endTime = range.endDate.getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime) {
    throw new RangeError("Reporting period dates must form a valid ascending range");
  }
  const startYear = range.startDate.getUTCFullYear();
  const startMonth = range.startDate.getUTCMonth();
  const endYear = range.endDate.getUTCFullYear();
  const endMonth = range.endDate.getUTCMonth();
  if (startYear < 1000 || endYear > 9999) {
    throw new RangeError("Reporting period years must use four digits");
  }
  const startPeriod = `${startYear}-${String(startMonth + 1).padStart(2, "0")}`;
  const endPeriod = `${endYear}-${String(endMonth + 1).padStart(2, "0")}`;
  return reportingMonthsForMonthBounds(startPeriod, endPeriod, maxMonths);
}

export function periodMutationLockKey(companyId: string, period: string): string {
  return `data_entry_period:${companyId}:${period}`;
}

export function calculationMutationLockKey(companyId: string, period: string): string {
  return `calculation_run:${companyId}:${period}`;
}

export function orderedUniquePeriods(periods: Iterable<string>): string[] {
  return Array.from(new Set(periods)).sort((left, right) => left.localeCompare(right));
}

async function executeTransactionStatement(
  client: any,
  pgStatement: string,
  pgValues: unknown[],
  drizzleStatement: unknown,
): Promise<unknown> {
  if (typeof client.query === "function") {
    return client.query(pgStatement, pgValues);
  }
  if (typeof client.execute === "function") {
    return client.execute(drizzleStatement);
  }
  throw new TypeError("A PostgreSQL transaction client is required");
}

function resultRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === "object" && Array.isArray((result as any).rows)) {
    return (result as any).rows as Array<Record<string, unknown>>;
  }
  return [];
}

/**
 * Serialises period locking and every data-entry write for the same tenant and
 * month. Multi-period callers always acquire locks in lexical month order so
 * overlapping bulk requests cannot deadlock each other.
 *
 * The caller must already be inside a PostgreSQL transaction; advisory xact
 * locks are released automatically on commit or rollback.
 */
export async function acquirePeriodMutationLocks(
  client: any,
  companyId: string,
  periods: Iterable<string>,
  options: { calculationRunLockHeld?: boolean } = {},
): Promise<string[]> {
  const orderedPeriods = orderedUniquePeriods(periods);
  // Ordinary source mutations take a shared calculation gate before their
  // existing period locks. A calculation run holds the matching exclusive
  // session gate from source snapshot through every derived/rollup write.
  // Shared gates preserve normal writer concurrency; the period locks below
  // still establish the deterministic mutation order.
  if (!options.calculationRunLockHeld) {
    for (const period of orderedPeriods) {
      const lockKey = calculationMutationLockKey(companyId, period);
      await executeTransactionStatement(
        client,
        "SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 0))",
        [lockKey],
        sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${lockKey}, 0))`,
      );
    }
  }
  for (const period of orderedPeriods) {
    const lockKey = periodMutationLockKey(companyId, period);
    await executeTransactionStatement(
      client,
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [lockKey],
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
  }
  return orderedPeriods;
}

/**
 * Holds exclusive tenant+month calculation gates on one PostgreSQL session.
 * Source mutations take shared transaction gates through
 * acquirePeriodMutationLocks, so no source can change between a calculation
 * snapshot and its final derived or organisation-rollup write.
 */
export async function withPeriodCalculationRunLocks<T>(
  connectionPool: { connect(): Promise<any> },
  companyId: string,
  periods: Iterable<string>,
  callback: () => Promise<T>,
): Promise<T> {
  const orderedPeriods = orderedUniquePeriods(periods);
  const client = await connectionPool.connect();
  const acquiredKeys: string[] = [];
  let releaseError: unknown = null;
  let callbackFailed = false;
  try {
    for (const period of orderedPeriods) {
      const lockKey = calculationMutationLockKey(companyId, period);
      await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [lockKey]);
      acquiredKeys.push(lockKey);
    }
    return await callback();
  } catch (error) {
    callbackFailed = true;
    throw error;
  } finally {
    for (const lockKey of acquiredKeys.reverse()) {
      try {
        const result = await client.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked",
          [lockKey],
        );
        if (result.rows?.[0]?.unlocked !== true) {
          releaseError = releaseError ?? new Error(`Calculation advisory lock was not held: ${lockKey}`);
        }
      } catch (error) {
        releaseError = releaseError ?? error;
      }
    }
    client.release(releaseError || undefined);
    if (releaseError && !callbackFailed) throw releaseError;
  }
}

/**
 * Authoritative lock-state check for a transaction that already owns the
 * tenant+period advisory lock. It preserves durable, legacy row-level, and
 * locked reporting-range semantics.
 */
export async function isPeriodLockedInTransaction(
  client: any,
  companyId: string,
  period: string,
): Promise<boolean> {
  const month = reportingMonthBounds(period);
  // reporting_periods stores timestamp without time zone. Keep these calendar
  // bounds timezone-free too; mixing timestamptz would make overlap depend on
  // the PostgreSQL session TimeZone. A half-open upper bound also covers the
  // final sub-millisecond portion of a month.
  const monthStart = month ? `${period}-01 00:00:00` : null;
  const pgStatement = `
    SELECT (
      EXISTS (
        SELECT 1
        FROM data_entry_period_locks depl
        WHERE depl.company_id = $1 AND depl.period = $2
      )
      OR EXISTS (
        SELECT 1
        FROM metric_values mv
        INNER JOIN metrics m ON m.id = mv.metric_id
        WHERE m.company_id = $1 AND mv.period = $2 AND mv.locked = true
      )
      OR (
        $3::timestamp IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM reporting_periods rp
          WHERE rp.company_id = $1
            AND rp.status = 'locked'
            AND rp.start_date < ($3::timestamp + INTERVAL '1 month')
            AND rp.end_date >= $3::timestamp
        )
      )
    ) AS locked
  `;
  const drizzleStatement = sql`
    SELECT (
      EXISTS (
        SELECT 1
        FROM data_entry_period_locks depl
        WHERE depl.company_id = ${companyId} AND depl.period = ${period}
      )
      OR EXISTS (
        SELECT 1
        FROM metric_values mv
        INNER JOIN metrics m ON m.id = mv.metric_id
        WHERE m.company_id = ${companyId} AND mv.period = ${period} AND mv.locked = true
      )
      OR (
        ${monthStart}::timestamp IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM reporting_periods rp
          WHERE rp.company_id = ${companyId}
            AND rp.status = 'locked'
            AND rp.start_date < (${monthStart}::timestamp + INTERVAL '1 month')
            AND rp.end_date >= ${monthStart}::timestamp
        )
      )
    ) AS locked
  `;
  const result = await executeTransactionStatement(
    client,
    pgStatement,
    [companyId, period, monthStart],
    drizzleStatement,
  );
  return resultRows(result)[0]?.locked === true;
}

export async function findLockedPeriodsInTransaction(
  client: any,
  companyId: string,
  periods: Iterable<string>,
): Promise<string[]> {
  const lockedPeriods: string[] = [];
  for (const period of orderedUniquePeriods(periods)) {
    if (await isPeriodLockedInTransaction(client, companyId, period)) {
      lockedPeriods.push(period);
    }
  }
  return lockedPeriods;
}
