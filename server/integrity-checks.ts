import { storage } from "./storage";
import { db } from "./storage";
import { metrics, metricValues, reportRuns } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

interface DiscrepancyResult {
  ok: boolean;
  discrepancies: string[];
  checked: number;
}

export async function checkDashboardVsMetrics(companyId: string): Promise<DiscrepancyResult> {
  const discrepancies: string[] = [];
  let checked = 0;

  try {
    const [dashboard, allMetrics] = await Promise.all([
      storage.getDashboardData(companyId),
      storage.getMetrics(companyId),
    ]);

    const enabledMetrics = allMetrics.filter((m) => m.enabled);
    checked = enabledMetrics.length;

    for (const metric of enabledMetrics) {
      const vals = await storage.getMetricValues(metric.id);
      const latest = vals.sort((a, b) => b.period.localeCompare(a.period))[0];
      if (!latest) continue;

      if (dashboard && typeof dashboard === "object" && "metrics" in dashboard) {
        const dashMetric = (dashboard as any).metrics?.find((m: any) => m.id === metric.id);
        if (dashMetric && dashMetric.latestValue !== undefined && latest.value !== null) {
          const dashVal = parseFloat(String(dashMetric.latestValue));
          const dbVal = parseFloat(String(latest.value));
          if (!isNaN(dashVal) && !isNaN(dbVal) && Math.abs(dashVal - dbVal) > 0.001) {
            const msg = `Metric '${metric.name}' (${metric.id}): dashboard=${dashVal}, db=${dbVal}`;
            discrepancies.push(msg);
            console.warn(`[integrity:dashboard] Discrepancy — ${msg}`);
          }
        }
      }
    }

    if (discrepancies.length === 0) {
      console.log(`[integrity:dashboard] Company ${companyId}: no discrepancies found (${checked} metrics checked)`);
    } else {
      console.warn(`[integrity:dashboard] Company ${companyId}: ${discrepancies.length} discrepancies found`);
    }
  } catch (err: any) {
    console.error(`[integrity:dashboard] Error checking company ${companyId}:`, err?.message ?? err);
    discrepancies.push(`Check failed: ${err?.message ?? "unknown error"}`);
  }

  return { ok: discrepancies.length === 0, discrepancies, checked };
}

export async function checkReportVsDashboard(companyId: string): Promise<DiscrepancyResult> {
  const discrepancies: string[] = [];
  let checked = 0;

  try {
    const [reports, allMetrics] = await Promise.all([
      storage.getReportRuns(companyId),
      storage.getMetrics(companyId),
    ]);

    const recentReport = reports.sort((a, b) =>
      new Date(b.generatedAt ?? 0).getTime() - new Date(a.generatedAt ?? 0).getTime()
    )[0];

    if (!recentReport) {
      console.log(`[integrity:report] Company ${companyId}: no reports to check`);
      return { ok: true, discrepancies, checked };
    }

    const reportData = recentReport as any;
    const reportPeriod = reportData.period;

    if (!reportPeriod) {
      console.log(`[integrity:report] Company ${companyId}: most recent report has no period, skipping`);
      return { ok: true, discrepancies, checked };
    }

    const enabledMetrics = allMetrics.filter((m) => m.enabled);
    checked = enabledMetrics.length;

    for (const metric of enabledMetrics) {
      const vals = await storage.getMetricValues(metric.id);
      const periodVal = vals.find((v) => v.period === reportPeriod);
      if (!periodVal || periodVal.value === null) continue;

      if (reportData.reportData && typeof reportData.reportData === "object") {
        const reportMetric = (reportData.reportData as any).metrics?.find((m: any) => m.id === metric.id);
        if (reportMetric && reportMetric.value !== undefined) {
          const reportVal = parseFloat(String(reportMetric.value));
          const dbVal = parseFloat(String(periodVal.value));
          if (!isNaN(reportVal) && !isNaN(dbVal) && Math.abs(reportVal - dbVal) > 0.001) {
            const msg = `Metric '${metric.name}' in period ${reportPeriod}: report=${reportVal}, db=${dbVal}`;
            discrepancies.push(msg);
            console.warn(`[integrity:report] Discrepancy — ${msg}`);
          }
        }
      }
    }

    if (discrepancies.length === 0) {
      console.log(`[integrity:report] Company ${companyId}: no discrepancies found (${checked} metrics checked for period ${reportPeriod})`);
    } else {
      console.warn(`[integrity:report] Company ${companyId}: ${discrepancies.length} discrepancies found`);
    }
  } catch (err: any) {
    console.error(`[integrity:report] Error checking company ${companyId}:`, err?.message ?? err);
    discrepancies.push(`Check failed: ${err?.message ?? "unknown error"}`);
  }

  return { ok: discrepancies.length === 0, discrepancies, checked };
}

export async function checkPortfolioVsCompanies(groupId: string, authorizedCompanyIds: string[]): Promise<DiscrepancyResult> {
  const discrepancies: string[] = [];
  let checked = 0;

  try {
    const summary = await storage.getPortfolioGroupSummary(groupId, authorizedCompanyIds);
    checked = authorizedCompanyIds.length;

    let calculatedScoreSum = 0;
    let scoredCompanies = 0;

    for (const companyId of authorizedCompanyIds) {
      try {
        const dashboard = await storage.getDashboardData(companyId);
        if (dashboard && typeof dashboard === "object" && "esgScore" in dashboard) {
          const score = parseFloat(String((dashboard as any).esgScore));
          if (!isNaN(score)) {
            calculatedScoreSum += score;
            scoredCompanies++;
          }
        }
      } catch (err: any) {
        console.warn(`[integrity:portfolio] Could not load dashboard for company ${companyId}:`, err?.message ?? err);
      }
    }

    if (scoredCompanies > 0 && summary.averageEsgScore !== null) {
      const calculatedAvg = calculatedScoreSum / scoredCompanies;
      const diff = Math.abs(calculatedAvg - summary.averageEsgScore);
      if (diff > 2) {
        const msg = `Portfolio ${groupId}: summary avg=${summary.averageEsgScore.toFixed(1)}, recalculated avg=${calculatedAvg.toFixed(1)} (diff=${diff.toFixed(1)})`;
        discrepancies.push(msg);
        console.warn(`[integrity:portfolio] Discrepancy — ${msg}`);
      } else {
        console.log(`[integrity:portfolio] Group ${groupId}: avg score OK (diff=${diff.toFixed(2)})`);
      }
    } else {
      console.log(`[integrity:portfolio] Group ${groupId}: skipping score check (${scoredCompanies} scored companies, summary=${summary.averageEsgScore})`);
    }
  } catch (err: any) {
    console.error(`[integrity:portfolio] Error checking group ${groupId}:`, err?.message ?? err);
    discrepancies.push(`Check failed: ${err?.message ?? "unknown error"}`);
  }

  return { ok: discrepancies.length === 0, discrepancies, checked };
}
