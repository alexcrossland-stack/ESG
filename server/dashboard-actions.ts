import { storage } from "./storage";
import { getScoreReadiness } from "./score-readiness";
import { getReportReadiness } from "./report-readiness";
import type { DashboardActionStatus } from "@shared/value-source";

export interface DashboardAction {
  id: string;
  title: string;
  description: string;
  reason: string;
  impact: "high" | "medium" | "low";
  effortLabel: string;
  ctaLabel: string;
  ctaHref: string;
  priority: number;
  status: DashboardActionStatus;
}

export interface ProgressSummary {
  onboardingComplete: boolean;
  hasCompanyProfile: boolean;
  hasAnyDataEntry: boolean;
  hasEstimatedData: boolean;
  hasActualData: boolean;
  hasEvidence: boolean;
  hasReport: boolean;
  estimatedRatio: number;
  totalEntries: number;
  envEntries: number;
  socEntries: number;
  govEntries: number;
}

export interface ActionResolverOutput {
  actions: DashboardAction[];
  topPriorityAction: DashboardAction | null;
  progressSummary: ProgressSummary;
  readinessSummary: string;
  confidenceSummary: string;
}

const ENV_CATEGORIES = ["environmental", "energy", "emissions", "waste", "water", "climate"];
const SOC_CATEGORIES = ["social", "people", "hr", "health", "safety", "diversity", "training"];
const GOV_CATEGORIES = ["governance", "policy", "compliance", "risk", "board"];

function classifyCategory(cat: unknown): "env" | "soc" | "gov" | "other" {
  const lower = typeof cat === "string" ? cat.toLowerCase() : "";
  if (ENV_CATEGORIES.some(k => lower.includes(k))) return "env";
  if (SOC_CATEGORIES.some(k => lower.includes(k))) return "soc";
  if (GOV_CATEGORIES.some(k => lower.includes(k))) return "gov";
  return "other";
}

export async function resolveDashboardActions(companyId: string): Promise<ActionResolverOutput> {
  const [company, metrics, rawData, evidenceFiles, reportRuns, scoreReadiness, reportReadiness] = await Promise.all([
    storage.getCompany(companyId),
    storage.getMetrics(companyId),
    storage.getRawDataByPeriod(companyId, getCurrentPeriod()),
    storage.getEvidenceFiles(companyId),
    storage.getReportRuns(companyId),
    getScoreReadiness(companyId),
    getReportReadiness(companyId),
  ]);

  const hasCompanyProfile = !!(
    company?.name &&
    company?.industry &&
    company?.employeeCount &&
    (company?.country || company?.locations)
  );

  const onboardingComplete = company?.onboardingComplete ?? false;

  const totalEntries = rawData.length;
  const estimatedEntries = rawData.filter(r => r.dataSourceType === "estimated").length;
  const actualEntries = rawData.filter(r => r.dataSourceType !== "estimated").length;
  const estimatedRatio = totalEntries > 0 ? estimatedEntries / totalEntries : 0;

  const envEntries = rawData.filter(r => classifyCategory(r.inputCategory) === "env").length;
  const socEntries = rawData.filter(r => classifyCategory(r.inputCategory) === "soc").length;
  const govEntries = rawData.filter(r => classifyCategory(r.inputCategory) === "gov").length;

  const envMetrics = metrics.filter(m => m.category === "environmental" && m.enabled);
  const socMetrics = metrics.filter(m => m.category === "social" && m.enabled);
  const govMetrics = metrics.filter(m => m.category === "governance" && m.enabled);

  const hasEnvData = envEntries > 0;
  const hasSocData = socEntries > 0;
  const hasGovData = govEntries > 0;

  const hasAnyDataEntry = totalEntries > 0;
  const hasEstimatedData = estimatedEntries > 0;
  const hasActualData = actualEntries > 0;
  const hasEvidence = evidenceFiles.length > 0;
  const hasReport = reportRuns.length > 0;

  const progressSummary: ProgressSummary = {
    onboardingComplete,
    hasCompanyProfile,
    hasAnyDataEntry,
    hasEstimatedData,
    hasActualData,
    hasEvidence,
    hasReport,
    estimatedRatio,
    totalEntries,
    envEntries,
    socEntries,
    govEntries,
  };

  const actions: DashboardAction[] = [];

  if (!onboardingComplete) {
    actions.push({
      id: "complete_onboarding",
      title: "Complete your setup",
      description: "Finish setting up your account to unlock your personalised ESG dashboard and scoring.",
      reason: "Onboarding is not yet complete — some features are unavailable until setup is finished.",
      impact: "high",
      effortLabel: "5 mins",
      ctaLabel: "Continue setup",
      ctaHref: "/onboarding",
      priority: 10,
      status: "todo",
    });
  }

  if (!hasCompanyProfile) {
    actions.push({
      id: "complete_company_profile",
      title: "Complete your company profile",
      description: "Add your sector, employee count, and location so we can tailor benchmarks and estimates to your business.",
      reason: "Your company profile is incomplete — estimates and benchmarks require sector and headcount data.",
      impact: "high",
      effortLabel: "2 mins",
      ctaLabel: "Update profile",
      ctaHref: "/settings/company",
      priority: 20,
      status: onboardingComplete ? "todo" : "available",
    });
  }

  if (!hasAnyDataEntry) {
    actions.push({
      id: "add_first_data_entry",
      title: "Add your first data entry",
      description: "Enter your first ESG metric — electricity use, headcount, or waste are great starting points.",
      reason: "No data has been entered yet. Your ESG score cannot be generated without at least one data point.",
      impact: "high",
      effortLabel: "5 mins",
      ctaLabel: "Enter data",
      ctaHref: "/data-entry",
      priority: 30,
      status: hasCompanyProfile ? "todo" : "available",
    });
  }

  if (hasEstimatedData) {
    actions.push({
      id: "review_estimated_values",
      title: "Review your estimated values",
      description: "You have estimated data entries. Review them and replace with actual readings when available.",
      reason: `Estimated values reduce your score confidence (currently: ${scoreReadiness.scoreConfidenceLabel ?? "Draft"}). Replacing with actual data improves credibility.`,
      impact: hasActualData ? "medium" : "high",
      effortLabel: "15 mins",
      ctaLabel: "Review estimates",
      ctaHref: "/data-entry",
      priority: hasActualData ? 45 : 40,
      status: "todo",
    });
  }

  if (!hasEvidence && hasActualData) {
    actions.push({
      id: "upload_first_evidence",
      title: "Upload supporting evidence",
      description: "Attach utility bills, certificates, or reports to back up your data entries.",
      reason: "Evidence-backed data scores higher and is required for credible reporting.",
      impact: "medium",
      effortLabel: "10 mins",
      ctaLabel: "Upload evidence",
      ctaHref: "/evidence",
      priority: 50,
      status: "todo",
    });
  }

  if (!hasReport && scoreReadiness.isScoreReady) {
    actions.push({
      id: "generate_first_report",
      title: "Generate your first ESG report",
      description: "Create a summary report showing your current ESG position — even with partial data.",
      reason: "No report has been generated yet. A first report establishes your baseline and can be shared with stakeholders.",
      impact: "medium",
      effortLabel: "2 mins",
      ctaLabel: "Generate report",
      ctaHref: "/reports",
      priority: 60,
      status: reportReadiness.isReportReady ? "todo" : "blocked",
    });
  }

  const missingCategories: string[] = [];
  if (!hasEnvData && envMetrics.length > 0) missingCategories.push("Environmental");
  if (!hasSocData && socMetrics.length > 0) missingCategories.push("Social");
  if (!hasGovData && govMetrics.length > 0) missingCategories.push("Governance");

  if (missingCategories.length > 0 && hasAnyDataEntry) {
    actions.push({
      id: "fill_missing_categories",
      title: `Add data for missing categories`,
      description: `${missingCategories.join(" and ")} sections have no data entries yet. Add at least one metric per pillar for a balanced score.`,
      reason: `Score coverage is skewed — ${missingCategories.join(", ")} categories have no data. Missing categories reduce your overall ESG position.`,
      impact: "medium",
      effortLabel: "15 mins",
      ctaLabel: "Enter data",
      ctaHref: "/data-entry",
      priority: 65,
      status: "todo",
    });
  }

  if (estimatedRatio > 0.5 && hasActualData) {
    actions.push({
      id: "improve_data_quality",
      title: "Improve low-confidence sections",
      description: "More than half your data relies on estimates. Focus on the categories with the most estimated values.",
      reason: `High estimated ratio (${Math.round(estimatedRatio * 100)}%) reduces your score confidence to "${scoreReadiness.scoreConfidenceLabel ?? "Draft"}". Replacing estimates boosts credibility.`,
      impact: "medium",
      effortLabel: "30 mins",
      ctaLabel: "Review data quality",
      ctaHref: "/data-entry",
      priority: 70,
      status: "available",
    });
  }

  if (hasEstimatedData && hasActualData && estimatedRatio > 0.2) {
    actions.push({
      id: "replace_estimates_with_actuals",
      title: "Replace estimated values with actuals",
      description: "Some of your metrics are still using estimates. Enter actual readings to improve your ESG score confidence.",
      reason: "Estimated values are clearly labelled in reports. Replacing them with actual measurements strengthens your position.",
      impact: "low",
      effortLabel: "Varies",
      ctaLabel: "Update data",
      ctaHref: "/data-entry",
      priority: 80,
      status: "available",
    });
  }

  const sorted = actions.sort((a, b) => a.priority - b.priority);

  let readinessSummary: string;
  if (!onboardingComplete) {
    readinessSummary = "Complete your setup to unlock full ESG tracking.";
  } else if (!reportReadiness.isReportReady) {
    readinessSummary = reportReadiness.readinessReason;
  } else if (!scoreReadiness.isScoreReady) {
    readinessSummary = scoreReadiness.readinessReason;
  } else if (estimatedRatio > 0.5) {
    readinessSummary = "Your data is mostly estimated. Adding actual values will improve your score confidence.";
  } else if (!hasEvidence) {
    readinessSummary = "Good progress — upload evidence to strengthen your data quality.";
  } else {
    readinessSummary = "Your ESG data is in good shape. Keep entries up to date for a strong score.";
  }

  let confidenceSummary: string;
  const label = scoreReadiness.scoreConfidenceLabel;
  if (!hasAnyDataEntry) {
    confidenceSummary = "No data entered — score confidence: Not applicable.";
  } else if (label === "Score in progress") {
    confidenceSummary = "Insufficient data for a score — add more entries to generate your ESG score.";
  } else if (label === "Draft") {
    confidenceSummary = `${Math.round(estimatedRatio * 100)}% of your data is estimated — score confidence: Draft.`;
  } else if (label === "Provisional") {
    confidenceSummary = `${Math.round(estimatedRatio * 100)}% of your data is estimated — score confidence: Provisional.`;
  } else {
    confidenceSummary = "Most data is from actual readings — score confidence: Strong.";
  }

  return {
    actions: sorted,
    topPriorityAction: sorted[0] ?? null,
    progressSummary,
    readinessSummary,
    confidenceSummary,
  };
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
