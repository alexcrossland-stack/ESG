import { storage } from "./storage";
import { hasMetricReportedValue } from "@shared/data-entry-metrics";
import { isGuidedRawInputName } from "@shared/guided-raw-inputs";

export interface ReportReadiness {
  isReportReady: boolean;
  readinessReason: string;
  missingCriticalItems: string[];
  estimatedCoveragePercent: number;
  actualCoveragePercent: number;
  dataCompleteness: number;
  reportConfidenceLabel: string | null;
}

const ENV_CATEGORIES = ["environmental", "energy", "emissions", "waste", "water", "climate"];
const SOC_CATEGORIES = ["social", "people", "hr", "health", "safety", "diversity", "training"];
const GOV_CATEGORIES = ["governance", "policy", "compliance", "risk", "board"];

function classifyEsgCategory(cat: unknown): "env" | "soc" | "gov" | null {
  const lower = typeof cat === "string" ? cat.toLowerCase() : "";
  if (ENV_CATEGORIES.some(k => lower.includes(k))) return "env";
  if (SOC_CATEGORIES.some(k => lower.includes(k))) return "soc";
  if (GOV_CATEGORIES.some(k => lower.includes(k))) return "gov";
  return null;
}

export async function getReportReadiness(companyId: string): Promise<ReportReadiness> {
  const currentPeriod = getCurrentPeriod();
  const [company, metrics, rawData] = await Promise.all([
    storage.getCompany(companyId),
    storage.getMetrics(companyId),
    storage.getRawDataByPeriod(companyId, currentPeriod),
  ]);

  const missingCriticalItems: string[] = [];

  const onboardingComplete = company?.onboardingComplete ?? false;
  if (!onboardingComplete) {
    missingCriticalItems.push("Complete onboarding setup");
  }

  const hasName = !!company?.name;
  const hasSector = !!company?.industry;
  const hasEmployeeBand = !!(company?.employeeCount || company?.revenueBand);
  const hasRegion = !!(company?.country || company?.locations);
  const hasCompanyProfile = hasName && hasSector && hasEmployeeBand && hasRegion;

  if (!hasName) missingCriticalItems.push("Company name");
  if (!hasSector) missingCriticalItems.push("Sector / industry");
  if (!hasEmployeeBand) missingCriticalItems.push("Employee count or revenue band");
  if (!hasRegion) missingCriticalItems.push("Country or region");

  // Historical rows created before the server-side input contract was added
  // must not manufacture readiness. Only supported guided inputs contribute
  // to ESG coverage and confidence calculations.
  const supportedRawData = rawData.filter((row) => isGuidedRawInputName(row.inputName));
  const esgEntries = supportedRawData.filter(r => classifyEsgCategory(r.inputCategory) !== null);
  const envEntries = esgEntries.filter(r => classifyEsgCategory(r.inputCategory) === "env");
  const socEntries = esgEntries.filter(r => classifyEsgCategory(r.inputCategory) === "soc");
  const govEntries = esgEntries.filter(r => classifyEsgCategory(r.inputCategory) === "gov");

  const enabledMetrics = metrics.filter(m => m.enabled);
  const metricValues = await Promise.all(
    enabledMetrics.map(m => storage.getMetricValuesForMetric(companyId, m.id, { scope: "all" }))
  );
  const currentMetricValues = metricValues.flat().filter(value =>
    hasMetricReportedValue(value) && (!value.period || value.period === currentPeriod)
  );

  const hasEnvData = envEntries.length > 0 || currentMetricValues.some(v => {
    const m = enabledMetrics.find(m => m.id === v.metricId);
    return m?.category === "environmental";
  });
  const hasSocData = socEntries.length > 0 || currentMetricValues.some(v => {
    const m = enabledMetrics.find(m => m.id === v.metricId);
    return m?.category === "social";
  });
  const hasGovData = govEntries.length > 0 || currentMetricValues.some(v => {
    const m = enabledMetrics.find(m => m.id === v.metricId);
    return m?.category === "governance";
  });

  const hasCoreEsgCategory = hasEnvData || hasSocData || hasGovData;
  if (!hasCoreEsgCategory) {
    missingCriticalItems.push(
      "At least one data entry in an ESG category (Environmental, Social, or Governance)"
    );
  }

  const isReportReady = onboardingComplete && hasCompanyProfile && hasCoreEsgCategory;

  const totalEntries = supportedRawData.length;
  const estimatedEntries = supportedRawData.filter(r => r.dataSourceType === "estimated").length;
  const actualEntries = supportedRawData.filter(r => r.dataSourceType !== "estimated").length;
  const estimatedRatio = totalEntries > 0 ? estimatedEntries / totalEntries : 0;

  const estimatedCoveragePercent = totalEntries > 0
    ? Math.round((estimatedEntries / totalEntries) * 100)
    : 0;

  const actualCoveragePercent = totalEntries > 0
    ? Math.round((actualEntries / totalEntries) * 100)
    : 0;

  const totalMetrics = enabledMetrics.length;
  const coveredMetricIds = new Set(
    currentMetricValues.map(v => v.metricId)
  );
  const dataCompleteness = totalMetrics > 0
    ? Math.round((coveredMetricIds.size / totalMetrics) * 100)
    : 0;

  let readinessReason: string;
  if (!onboardingComplete) {
    readinessReason = "Complete your account setup before generating a report.";
  } else if (!hasCompanyProfile) {
    readinessReason = "Your company profile needs more information before a report can be generated.";
  } else if (!hasCoreEsgCategory) {
    readinessReason = "Add at least one ESG data entry (Environmental, Social, or Governance) to generate a report.";
  } else if (estimatedRatio > 0.5) {
    readinessReason = "Report can be generated. Note: over half your data relies on estimates — indicated clearly in the report.";
  } else {
    readinessReason = "Report is ready to generate with your current data.";
  }

  let reportConfidenceLabel: string | null = null;
  if (isReportReady) {
    if (estimatedRatio > 0.5) {
      reportConfidenceLabel = "Draft";
    } else if (estimatedRatio >= 0.2) {
      reportConfidenceLabel = "Provisional";
    }
  }

  return {
    isReportReady,
    readinessReason,
    missingCriticalItems,
    estimatedCoveragePercent,
    actualCoveragePercent,
    dataCompleteness,
    reportConfidenceLabel,
  };
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
