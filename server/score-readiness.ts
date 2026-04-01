import { storage } from "./storage";

export interface ScoreReadiness {
  isScoreReady: boolean;
  readinessReason: string;
  missingCriticalItems: string[];
  estimatedCoveragePercent: number;
  actualCoveragePercent: number;
  evidenceCoveragePercent: number;
  scoreConfidenceLabel: string | null;
}

const ENV_CATEGORIES = ["environmental", "energy", "emissions", "waste", "water", "climate"];
const SOC_CATEGORIES = ["social", "people", "hr", "health", "safety", "diversity", "training"];
const GOV_CATEGORIES = ["governance", "policy", "compliance", "risk", "board"];

function normaliseCategory(cat: unknown): string {
  return typeof cat === "string" ? cat.toLowerCase() : "";
}

function isEsgCategory(cat: unknown): boolean {
  const lower = normaliseCategory(cat);
  return (
    ENV_CATEGORIES.some(k => lower.includes(k)) ||
    SOC_CATEGORIES.some(k => lower.includes(k)) ||
    GOV_CATEGORIES.some(k => lower.includes(k))
  );
}

export async function getScoreReadiness(companyId: string): Promise<ScoreReadiness> {
  const [metrics, rawData, evidenceFiles] = await Promise.all([
    storage.getMetrics(companyId),
    storage.getRawDataByPeriod(companyId, getCurrentPeriod()),
    storage.getEvidenceFiles(companyId),
  ]);

  const enabledMetrics = metrics.filter(m => m.enabled);
  const totalMetrics = enabledMetrics.length;

  const missingCriticalItems: string[] = [];

  const totalEntries = rawData.length;
  const estimatedEntries = rawData.filter(r => r.dataSourceType === "estimated").length;
  const actualEntries = rawData.filter(r => r.dataSourceType !== "estimated").length;

  const esgEntries = rawData.filter(r => isEsgCategory(r.inputCategory));
  const envEntries = esgEntries.filter(r => {
    const lower = normaliseCategory(r.inputCategory);
    return ENV_CATEGORIES.some(k => lower.includes(k));
  });
  const socEntries = esgEntries.filter(r => {
    const lower = normaliseCategory(r.inputCategory);
    return SOC_CATEGORIES.some(k => lower.includes(k));
  });
  const govEntries = esgEntries.filter(r => {
    const lower = normaliseCategory(r.inputCategory);
    return GOV_CATEGORIES.some(k => lower.includes(k));
  });

  const metricValues = await Promise.all(
    enabledMetrics.map(m => storage.getMetricValues(m.id))
  );
  const allMetricValues = metricValues.flat();
  const metricValuesWithData = allMetricValues.filter(v => v.value !== null && v.value !== undefined);

  const envMetrics = enabledMetrics.filter(m => m.category === "environmental");
  const socMetrics = enabledMetrics.filter(m => m.category === "social");
  const govMetrics = enabledMetrics.filter(m => m.category === "governance");

  const hasEnvValue = envEntries.length > 0 || metricValuesWithData.some(v => {
    const m = enabledMetrics.find(m => m.id === v.metricId);
    return m?.category === "environmental";
  });
  const hasSocValue = socEntries.length > 0 || metricValuesWithData.some(v => {
    const m = enabledMetrics.find(m => m.id === v.metricId);
    return m?.category === "social";
  });
  const hasGovValue = govEntries.length > 0 || metricValuesWithData.some(v => {
    const m = enabledMetrics.find(m => m.id === v.metricId);
    return m?.category === "governance";
  });

  const hasMeaningfulEsgData = hasEnvValue || hasSocValue || hasGovValue;

  if (!hasMeaningfulEsgData) {
    if (envMetrics.length > 0 && !hasEnvValue) {
      missingCriticalItems.push("At least one Environmental data entry");
    }
    if (socMetrics.length > 0 && !hasSocValue) {
      missingCriticalItems.push("At least one Social data entry");
    }
    if (govMetrics.length > 0 && !hasGovValue) {
      missingCriticalItems.push("At least one Governance data entry");
    }
    if (missingCriticalItems.length === 0) {
      missingCriticalItems.push("At least one meaningful ESG category data entry (Environmental, Social, or Governance)");
    }
  }

  const evidenceLinkedCount = evidenceFiles.filter(e =>
    e.linkedModule === "metric_value" || e.linkedModule === "metrics" || e.linkedModule === "raw_data"
  ).length;

  const estimatedCoveragePercent = totalEntries > 0
    ? Math.round((estimatedEntries / totalEntries) * 100)
    : 0;

  const actualCoveragePercent = totalEntries > 0
    ? Math.round((actualEntries / totalEntries) * 100)
    : 0;

  const evidenceCoveragePercent = totalMetrics > 0
    ? Math.round((evidenceLinkedCount / totalMetrics) * 100)
    : 0;

  const isScoreReady = hasMeaningfulEsgData;

  let readinessReason: string;
  if (!isScoreReady) {
    readinessReason = "No ESG data entered yet in Environmental, Social, or Governance categories. Add at least one metric value to generate a score.";
  } else if (totalEntries > 0 && estimatedCoveragePercent === 100) {
    readinessReason = "Score available, but all data is estimated. Actual readings will improve confidence.";
  } else {
    readinessReason = "Score ready — your ESG data is sufficient to generate a score.";
  }

  let scoreConfidenceLabel: string | null = null;
  if (!isScoreReady) {
    scoreConfidenceLabel = "Score in progress";
  } else if (estimatedCoveragePercent > 50) {
    scoreConfidenceLabel = "Draft";
  } else if (estimatedCoveragePercent >= 20) {
    scoreConfidenceLabel = "Provisional";
  }

  return {
    isScoreReady,
    readinessReason,
    missingCriticalItems,
    estimatedCoveragePercent,
    actualCoveragePercent,
    evidenceCoveragePercent,
    scoreConfidenceLabel,
  };
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
