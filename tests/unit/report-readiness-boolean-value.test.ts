import assert from "node:assert/strict";
import { getReportReadiness } from "../../server/report-readiness";
import { storage } from "../../server/storage";

const currentPeriod = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
})();

const originals = {
  getCompany: storage.getCompany,
  getMetrics: storage.getMetrics,
  getRawDataByPeriod: storage.getRawDataByPeriod,
  getMetricValuesForMetric: storage.getMetricValuesForMetric,
};

try {
  (storage as any).getCompany = async () => ({
    name: "Boolean Readiness SME",
    industry: "Professional services",
    employeeCount: "1-10",
    country: "United Kingdom",
    locations: 1,
    onboardingComplete: true,
  });
  (storage as any).getMetrics = async () => ([{
    id: "governance-boolean",
    name: "Anti-Bribery Policy in Place",
    category: "governance",
    enabled: true,
  }]);
  (storage as any).getRawDataByPeriod = async () => [];
  (storage as any).getMetricValuesForMetric = async () => ([{
    id: "boolean-value",
    metricId: "governance-boolean",
    period: currentPeriod,
    value: null,
    valueBoolean: false,
    valueText: "No",
    valueJson: null,
  }]);

  const readiness = await getReportReadiness("company-boolean");
  assert.equal(readiness.isReportReady, true, "a saved No answer is still a reported governance fact");
  assert.equal(readiness.dataCompleteness, 100, "boolean-only values count toward completeness");
  assert(!readiness.missingCriticalItems.some((item) => item.includes("At least one data entry")));

  (storage as any).getMetricValuesForMetric = async () => ([{
    id: "stale-boolean-value",
    metricId: "governance-boolean",
    period: "1900-01",
    value: null,
    valueBoolean: false,
    valueText: "No",
    valueJson: null,
  }]);

  const staleReadiness = await getReportReadiness("company-boolean");
  assert.equal(staleReadiness.isReportReady, false, "a prior-period answer must not make the current report ready");
  assert.equal(staleReadiness.dataCompleteness, 0, "prior-period values do not count toward current completeness");
  assert(staleReadiness.missingCriticalItems.some((item) => item.includes("At least one data entry")));
  console.log("report readiness boolean-value test passed");
} finally {
  (storage as any).getCompany = originals.getCompany;
  (storage as any).getMetrics = originals.getMetrics;
  (storage as any).getRawDataByPeriod = originals.getRawDataByPeriod;
  (storage as any).getMetricValuesForMetric = originals.getMetricValuesForMetric;
}
