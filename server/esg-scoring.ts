import { storage } from "./storage";
import { getTrafficLightStatus } from "./calculations";

export interface CompletenessScore {
  score: number;
  totalExpected: number;
  totalSubmitted: number;
  missingMetrics: { name: string; category: string; frequency: string }[];
  explanation: string;
  byCategory: Record<string, { expected: number; submitted: number; score: number }>;
}

export interface PerformanceScore {
  score: number;
  totalScored: number;
  greenCount: number;
  amberCount: number;
  redCount: number;
  explanation: string;
  byCategory: Record<string, { score: number; greenCount: number; amberCount: number; redCount: number; total: number }>;
  scope: "company" | "site";
  siteId?: string | null;
}

export interface ManagementMaturityScore {
  score: number;
  dimensions: {
    policiesInPlace: { score: number; weight: number; detail: string };
    governanceOwnership: { score: number; weight: number; detail: string };
    targetsSet: { score: number; weight: number; detail: string };
    actionsInProgress: { score: number; weight: number; detail: string };
    evidenceAttached: { score: number; weight: number; detail: string };
    reviewCycles: { score: number; weight: number; detail: string };
  };
  explanation: string;
  gaps: string[];
}

export interface FrameworkReadinessScore {
  score: number;
  frameworks: {
    id: string;
    name: string;
    covered: number;
    partial: number;
    missing: number;
    total: number;
    readinessPercent: number;
  }[];
  overallCovered: number;
  overallPartial: number;
  overallMissing: number;
  overallTotal: number;
  explanation: string;
  topGaps: string[];
}

/**
 * Computes how many months of data to consider as "recent" for a given frequency.
 */
function getRecentMonths(frequency: string): number {
  switch (frequency) {
    case "monthly": return 2;
    case "quarterly": return 4;
    case "annual": return 14;
    default: return 4;
  }
}

/**
 * Formats a Date as YYYY-MM for period comparisons.
 */
function dateToPeriod(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Subtracts N months from a date and returns the resulting period string.
 */
function periodNMonthsAgo(fromDate: Date, months: number): string {
  const d = new Date(fromDate);
  d.setMonth(d.getMonth() - months);
  return dateToPeriod(d);
}

/**
 * Completeness Score: compares expected metric submissions vs actual for the given period.
 * A metric is considered submitted if it has a non-null value within the lookback window
 * relative to the requested period.
 *
 * @param period - Target period in YYYY-MM format. Defaults to current month.
 */
export async function scoreCompleteness(companyId: string, period?: string): Promise<CompletenessScore> {
  const allMetrics = await storage.getMetrics(companyId);
  const enabledMetrics = allMetrics.filter(m => m.enabled);

  const now = new Date();
  const targetPeriod = period ?? dateToPeriod(now);

  const missingMetrics: { name: string; category: string; frequency: string }[] = [];
  const byCategory: Record<string, { expected: number; submitted: number; score: number }> = {
    environmental: { expected: 0, submitted: 0, score: 0 },
    social: { expected: 0, submitted: 0, score: 0 },
    governance: { expected: 0, submitted: 0, score: 0 },
  };

  let totalExpected = 0;
  let totalSubmitted = 0;

  for (const metric of enabledMetrics) {
    const cat = metric.category as string;
    const freq = metric.frequency || "monthly";

    // Build the lookback window: oldest acceptable period given freq
    const lookbackMonths = getRecentMonths(freq);

    // Parse targetPeriod to a Date for computing lookback
    const [targetYear, targetMonth] = targetPeriod.split("-").map(Number);
    const targetDate = new Date(targetYear, (targetMonth || 1) - 1, 1);
    const oldestAcceptable = periodNMonthsAgo(targetDate, lookbackMonths);

    const vals = await storage.getMetricValues(metric.id);
    // Submitted = has a non-null value in a period between oldestAcceptable and targetPeriod (inclusive)
    const hasSubmission = vals.some(v =>
      v.value !== null &&
      v.value !== undefined &&
      v.period >= oldestAcceptable &&
      v.period <= targetPeriod
    );

    if (!byCategory[cat]) byCategory[cat] = { expected: 0, submitted: 0, score: 0 };
    byCategory[cat].expected++;
    totalExpected++;

    if (hasSubmission) {
      byCategory[cat].submitted++;
      totalSubmitted++;
    } else {
      missingMetrics.push({ name: metric.name, category: cat, frequency: freq });
    }
  }

  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].score = byCategory[cat].expected > 0
      ? Math.round((byCategory[cat].submitted / byCategory[cat].expected) * 100)
      : 100;
  }

  const score = totalExpected > 0 ? Math.round((totalSubmitted / totalExpected) * 100) : 0;

  const missingCount = missingMetrics.length;
  let explanation = "";
  if (score >= 90) {
    explanation = `Excellent data completeness — ${totalSubmitted} of ${totalExpected} expected metric submissions are in place for ${targetPeriod}.`;
  } else if (score >= 70) {
    explanation = `Good data coverage — ${totalSubmitted} of ${totalExpected} metrics have submissions for ${targetPeriod}. ${missingCount} metric${missingCount !== 1 ? "s" : ""} still need data.`;
  } else if (score >= 50) {
    explanation = `Data gaps present — only ${totalSubmitted} of ${totalExpected} metrics have submissions for ${targetPeriod}. Prioritise entering missing data for accurate scoring.`;
  } else {
    explanation = `Significant data gaps — ${missingCount} of ${totalExpected} metrics are missing data for ${targetPeriod}. Without complete data, your ESG position cannot be accurately assessed.`;
  }

  return { score, totalExpected, totalSubmitted, missingMetrics, explanation, byCategory };
}

/**
 * Performance Score: scores metric values against targets and/or prior-period trends.
 * Respects site-level vs company-level context.
 *
 * Scope semantics:
 *   - siteId = undefined   → company-wide: aggregate across org-level (siteId null) and all site records.
 *                            For each metric, prefer the most recent org-level value; if none, use any site value.
 *   - siteId = null (explicit) → org-level only: only consider records where siteId IS NULL.
 *   - siteId = "some-uuid" → site-specific: only consider records for that exact site.
 *
 * @param period - Target period in YYYY-MM format. Defaults to current month.
 * @param siteId - Scope selector. undefined = company-wide, null = org-level only, string = specific site.
 */
export async function scorePerformance(
  companyId: string,
  period?: string,
  siteId?: string | null
): Promise<PerformanceScore> {
  const allMetrics = await storage.getMetrics(companyId);
  const enabledMetrics = allMetrics.filter(m => m.enabled);

  const now = new Date();
  const targetPeriod = period ?? dateToPeriod(now);

  // Determine effective scope
  const isCompanyWide = siteId === undefined;
  const isOrgLevel = siteId === null;
  const isSiteSpecific = typeof siteId === "string";
  const scope: "company" | "site" = isCompanyWide || isOrgLevel ? "company" : "site";

  const byCategory: Record<string, { score: number; greenCount: number; amberCount: number; redCount: number; total: number }> = {
    environmental: { score: 0, greenCount: 0, amberCount: 0, redCount: 0, total: 0 },
    social: { score: 0, greenCount: 0, amberCount: 0, redCount: 0, total: 0 },
    governance: { score: 0, greenCount: 0, amberCount: 0, redCount: 0, total: 0 },
  };

  let totalScored = 0;
  let greenCount = 0;
  let amberCount = 0;
  let redCount = 0;
  let weightedSum = 0;
  let totalWeight = 0;

  for (const metric of enabledMetrics) {
    const cat = metric.category as string;
    const allVals = await storage.getMetricValues(metric.id);

    let valsToConsider: typeof allVals;

    if (isSiteSpecific) {
      // Site-specific: only values for the selected site (no fallback)
      valsToConsider = allVals.filter(v => v.siteId === siteId);
    } else if (isOrgLevel) {
      // Org-level only: records with siteId null
      valsToConsider = allVals.filter(v => v.siteId === null || v.siteId === undefined);
    } else {
      // Company-wide: prefer org-level (siteId null) values; fall back to site-level if none exist.
      // This ensures: companies using org-level data get org-level scores,
      // and companies entering data entirely at site level are also scored correctly.
      valsToConsider = allVals; // set initial pool to all values for fallback logic below
    }

    // Find the most recent value at or before targetPeriod with a non-null value.
    // For company-wide scope: prefer org-level records; if no org-level record exists, use any site record.
    let valWithData: (typeof allVals)[0] | undefined;
    if (isCompanyWide) {
      const candidatePeriod = valsToConsider
        .filter(v => v.value !== null && v.value !== undefined && v.period <= targetPeriod);
      // First try org-level only
      const orgVals = candidatePeriod
        .filter(v => v.siteId === null || v.siteId === undefined)
        .sort((a, b) => b.period.localeCompare(a.period));
      if (orgVals.length > 0) {
        valWithData = orgVals[0];
      } else {
        // Fall back to any site-level record
        valWithData = candidatePeriod.sort((a, b) => b.period.localeCompare(a.period))[0];
      }
    } else {
      valWithData = valsToConsider
        .filter(v => v.value !== null && v.value !== undefined && v.period <= targetPeriod)
        .sort((a, b) => b.period.localeCompare(a.period))[0];
    }

    if (!valWithData) continue;

    const value = parseFloat(String(valWithData.value));
    if (isNaN(value)) continue;

    const target = metric.targetValue ? parseFloat(String(metric.targetValue)) : null;
    const direction = metric.direction || "higher_is_better";
    const amberThreshold = metric.amberThreshold ? parseFloat(String(metric.amberThreshold)) : 5;
    const redThreshold = metric.redThreshold ? parseFloat(String(metric.redThreshold)) : 15;
    const targetMin = metric.targetMin ? parseFloat(String(metric.targetMin)) : null;
    const targetMax = metric.targetMax ? parseFloat(String(metric.targetMax)) : null;

    // Find prior period value for trend comparison (same scope)
    const priorVals = valsToConsider
      .filter(v => v.value !== null && v.period < valWithData.period)
      .sort((a, b) => b.period.localeCompare(a.period));
    const previousValue = priorVals.length > 0 ? parseFloat(String(priorVals[0].value)) : null;

    const status = getTrafficLightStatus(value, target, direction, amberThreshold, redThreshold, targetMin, targetMax, previousValue);

    const weight = metric.weight ? parseFloat(String(metric.weight)) : 1;
    const importanceMultiplier = metric.importance === "critical" ? 2 : metric.importance === "high" ? 1.5 : 1;
    const effectiveWeight = weight * importanceMultiplier;

    const statusScore = status === "green" ? 100 : status === "amber" ? 50 : 0;
    weightedSum += statusScore * effectiveWeight;
    totalWeight += effectiveWeight;

    totalScored++;
    if (!byCategory[cat]) byCategory[cat] = { score: 0, greenCount: 0, amberCount: 0, redCount: 0, total: 0 };
    byCategory[cat].total++;

    if (status === "green") { greenCount++; byCategory[cat].greenCount++; }
    else if (status === "amber") { amberCount++; byCategory[cat].amberCount++; }
    else { redCount++; byCategory[cat].redCount++; }
  }

  for (const cat of Object.keys(byCategory)) {
    const c = byCategory[cat];
    if (c.total > 0) {
      c.score = Math.round(((c.greenCount * 100 + c.amberCount * 50) / c.total));
    }
  }

  const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  const scopeLabel = scope === "site" ? " (site-level)" : "";
  let explanation = "";
  if (score >= 80) {
    explanation = `Strong performance${scopeLabel} — ${greenCount} of ${totalScored} metrics are on track or meeting targets. Continue monitoring to maintain this position.`;
  } else if (score >= 60) {
    explanation = `Good performance${scopeLabel} overall — ${greenCount} metrics on track, but ${amberCount} at risk and ${redCount} off track. Focus on the at-risk metrics to improve.`;
  } else if (score >= 40) {
    explanation = `Mixed performance${scopeLabel} — ${redCount} metrics are off track against targets or prior period trends. Review these areas and consider updating your action plans.`;
  } else {
    explanation = `Performance needs attention${scopeLabel} — many metrics are missing targets or trending the wrong way. Setting clear targets for each metric would help establish a baseline.`;
  }

  return { score, totalScored, greenCount, amberCount, redCount, explanation, byCategory, scope, siteId };
}

export async function scoreManagementMaturity(companyId: string): Promise<ManagementMaturityScore> {
  const [policy, metrics, actions, evidenceFiles] = await Promise.all([
    storage.getPolicy(companyId),
    storage.getMetrics(companyId),
    storage.getActionPlans(companyId),
    storage.getEvidenceFiles(companyId),
  ]);

  const enabledMetrics = metrics.filter(m => m.enabled);
  const gaps: string[] = [];

  const hasPolicyPublished = policy?.status === "published";
  const policyReviewDate = policy?.reviewDate ? new Date(policy.reviewDate) : null;
  const policyOverdue = policyReviewDate ? policyReviewDate < new Date() : false;
  let policiesScore = 0;
  let policiesDetail = "";

  if (!policy) {
    policiesScore = 0;
    policiesDetail = "No ESG policy exists yet";
    gaps.push("Create and publish an ESG policy");
  } else if (!hasPolicyPublished) {
    policiesScore = 30;
    policiesDetail = "ESG policy is in draft — not yet published";
    gaps.push("Publish your ESG policy to demonstrate commitment");
  } else if (policyOverdue) {
    policiesScore = 60;
    policiesDetail = "ESG policy is published but review date has passed";
    gaps.push("Schedule a policy review — current review date is overdue");
  } else {
    policiesScore = 100;
    policiesDetail = "ESG policy published with a current review date";
  }

  const metricsWithOwner = enabledMetrics.filter(m => m.dataOwner || m.assignedUserId);
  const ownershipPercent = enabledMetrics.length > 0
    ? Math.round((metricsWithOwner.length / enabledMetrics.length) * 100)
    : 0;

  let governanceScore = 0;
  let governanceDetail = "";
  if (ownershipPercent >= 80) {
    governanceScore = 100;
    governanceDetail = `${ownershipPercent}% of metrics have a named data owner`;
  } else if (ownershipPercent >= 50) {
    governanceScore = 60;
    governanceDetail = `${ownershipPercent}% of metrics have a named data owner`;
    gaps.push(`Assign data owners to the remaining ${enabledMetrics.length - metricsWithOwner.length} metric(s)`);
  } else {
    governanceScore = 20;
    governanceDetail = `Only ${ownershipPercent}% of metrics have a named data owner`;
    gaps.push("Assign data owners to your metrics to establish clear accountability");
  }

  const metricsWithTarget = enabledMetrics.filter(m =>
    m.targetValue !== null ||
    m.targetMin !== null ||
    m.targetMax !== null
  );
  const targetPercent = enabledMetrics.length > 0
    ? Math.round((metricsWithTarget.length / enabledMetrics.length) * 100)
    : 0;

  let targetsScore = 0;
  let targetsDetail = "";
  if (targetPercent >= 70) {
    targetsScore = 100;
    targetsDetail = `Targets set for ${targetPercent}% of metrics`;
  } else if (targetPercent >= 40) {
    targetsScore = 60;
    targetsDetail = `Targets set for ${targetPercent}% of metrics`;
    gaps.push("Set targets for more metrics to enable performance tracking");
  } else {
    targetsScore = 20;
    targetsDetail = `Only ${targetPercent}% of metrics have targets set`;
    gaps.push("Set measurable targets for your key ESG metrics");
  }

  const activeActions = actions.filter(a => a.status === "in_progress" || a.status === "not_started");
  const overdueActions = actions.filter(a => a.status !== "complete" && a.dueDate && new Date(a.dueDate) < new Date());
  let actionsScore = 0;
  let actionsDetail = "";

  if (actions.length === 0) {
    actionsScore = 0;
    actionsDetail = "No ESG action plans have been created";
    gaps.push("Create ESG action plans to demonstrate active progress");
  } else if (overdueActions.length > actions.length * 0.5) {
    actionsScore = 30;
    actionsDetail = `${overdueActions.length} of ${actions.length} actions are overdue`;
    gaps.push(`Review and update ${overdueActions.length} overdue action(s)`);
  } else if (activeActions.length > 0) {
    actionsScore = overdueActions.length > 0 ? 70 : 100;
    actionsDetail = `${activeActions.length} action(s) in progress, ${overdueActions.length} overdue`;
    if (overdueActions.length > 0) gaps.push(`Update ${overdueActions.length} overdue action(s)`);
  } else {
    actionsScore = 60;
    actionsDetail = `${actions.length} completed action(s) — add new actions to continue progress`;
    gaps.push("Add new action plans to maintain active ESG improvement");
  }

  const evidenceLinkedToMetrics = evidenceFiles.filter(e =>
    e.linkedModule === "metric_value" || e.linkedModule === "metrics"
  );
  const evidenceCoveragePercent = enabledMetrics.length > 0
    ? Math.round((evidenceLinkedToMetrics.length / enabledMetrics.length) * 100)
    : 0;

  let evidenceScore = 0;
  let evidenceDetail = "";
  if (evidenceCoveragePercent >= 60) {
    evidenceScore = 100;
    evidenceDetail = `${evidenceCoveragePercent}% evidence coverage — strong documentation`;
  } else if (evidenceCoveragePercent >= 30) {
    evidenceScore = 60;
    evidenceDetail = `${evidenceCoveragePercent}% evidence coverage — some documentation in place`;
    gaps.push("Upload more supporting evidence to improve documentation coverage");
  } else {
    evidenceScore = 20;
    evidenceDetail = "Limited evidence uploaded — data is mostly undocumented";
    gaps.push("Upload evidence files (bills, certificates, reports) to support your ESG data");
  }

  const policyReviewOk = hasPolicyPublished && policyReviewDate && policyReviewDate > new Date();
  let reviewScore = 0;
  let reviewDetail = "";

  if (policyReviewOk) {
    reviewScore = 100;
    reviewDetail = `Policy review cycle is current (next review: ${policyReviewDate!.toLocaleDateString()})`;
  } else if (hasPolicyPublished && policyOverdue) {
    reviewScore = 30;
    reviewDetail = "Policy review is overdue — update your review date";
    gaps.push("Update your ESG policy review date");
  } else if (hasPolicyPublished) {
    reviewScore = 60;
    reviewDetail = "Policy published but no review date set";
    gaps.push("Set a review date on your ESG policy to confirm regular review cycles");
  } else {
    reviewScore = 0;
    reviewDetail = "No policy published yet — review cycles cannot be verified";
  }

  const dimensions = {
    policiesInPlace: { score: policiesScore, weight: 25, detail: policiesDetail },
    governanceOwnership: { score: governanceScore, weight: 20, detail: governanceDetail },
    targetsSet: { score: targetsScore, weight: 20, detail: targetsDetail },
    actionsInProgress: { score: actionsScore, weight: 20, detail: actionsDetail },
    evidenceAttached: { score: evidenceScore, weight: 10, detail: evidenceDetail },
    reviewCycles: { score: reviewScore, weight: 5, detail: reviewDetail },
  };

  let totalWeightedScore = 0;
  let totalWeight = 0;
  for (const dim of Object.values(dimensions)) {
    totalWeightedScore += dim.score * dim.weight;
    totalWeight += dim.weight;
  }

  const score = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;

  let explanation = "";
  if (score >= 80) {
    explanation = "Strong management maturity — policies, ownership, targets and evidence are well established.";
  } else if (score >= 60) {
    explanation = "Good foundations in place — some areas of governance and documentation can be strengthened.";
  } else if (score >= 40) {
    explanation = "ESG management is in early stages — focus on publishing your policy, assigning owners, and setting targets.";
  } else {
    explanation = "Management maturity is low — start by creating an ESG policy and assigning responsibility for key metrics.";
  }

  return { score, dimensions, explanation, gaps };
}

export async function scoreFrameworkReadiness(companyId: string): Promise<FrameworkReadinessScore> {
  const readiness = await storage.getFrameworkReadiness(companyId);

  if (!readiness || readiness.length === 0) {
    return {
      score: 0,
      frameworks: [],
      overallCovered: 0,
      overallPartial: 0,
      overallMissing: 0,
      overallTotal: 0,
      explanation: "No reporting frameworks selected yet. Select frameworks in Framework Settings to see your readiness score.",
      topGaps: [],
    };
  }

  let overallCovered = 0;
  let overallPartial = 0;
  let overallMissing = 0;
  let overallTotal = 0;

  const frameworks = readiness.map((r: any) => {
    const { covered, partial, missing, total } = r.summary;
    overallCovered += covered;
    overallPartial += partial;
    overallMissing += missing;
    overallTotal += total;

    const readinessPercent = total > 0
      ? Math.round(((covered + partial * 0.5) / total) * 100)
      : 0;

    return {
      id: r.framework.id,
      name: r.framework.name,
      covered,
      partial,
      missing,
      total,
      readinessPercent,
    };
  });

  const score = overallTotal > 0
    ? Math.round(((overallCovered + overallPartial * 0.5) / overallTotal) * 100)
    : 0;

  const topGaps: string[] = [];
  for (const r of readiness) {
    const missingCore = (r.requirements || [])
      .filter((req: any) => req.status === "missing" && req.mandatoryLevel === "core")
      .slice(0, 2);
    for (const req of missingCore) {
      topGaps.push(`${r.framework.name}: ${req.title} — ${req.requirementType} needed`);
    }
  }

  let explanation = "";
  if (score >= 80) {
    explanation = `Strong framework alignment — most requirements across ${frameworks.length} selected framework(s) are covered or partially covered.`;
  } else if (score >= 60) {
    explanation = `Reasonable alignment — ${overallCovered} requirements fully covered, ${overallPartial} partially covered. Address the ${overallMissing} gaps to improve your readiness position.`;
  } else if (score >= 40) {
    explanation = `Partial alignment — significant gaps remain across your selected frameworks. Focus on core requirements first.`;
  } else {
    explanation = `Early stage alignment — ${overallMissing} of ${overallTotal} requirements are not yet covered. Start with core metric and policy requirements.`;
  }

  return {
    score,
    frameworks,
    overallCovered,
    overallPartial,
    overallMissing,
    overallTotal,
    explanation,
    topGaps: topGaps.slice(0, 5),
  };
}
