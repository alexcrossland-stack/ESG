import assert from "node:assert/strict";
import {
  questionnaireCarbonCalculationIsInScope,
  questionnaireMetricValueIsInScope,
  type QuestionnaireContextBoundary,
} from "../../server/questionnaire-context";

const boundary: QuestionnaireContextBoundary = {
  siteId: "site-a",
  reportingPeriod: {
    id: "period-a",
    name: "FY 2026",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  },
};

assert.equal(questionnaireMetricValueIsInScope({
  siteId: "site-a",
  reportingPeriodId: "period-a",
  period: "2026-06",
}, boundary), true, "the exact saved site and reporting-period ID are included");

assert.equal(questionnaireMetricValueIsInScope({
  siteId: "site-b",
  reportingPeriodId: "period-a",
  period: "2026-06",
}, boundary), false, "another site's value must never enter questionnaire context");

assert.equal(questionnaireMetricValueIsInScope({
  siteId: "site-a",
  reportingPeriodId: "period-b",
  period: "2026-06",
}, boundary), false, "a different explicit reporting-period ID cannot match by date alone");

assert.equal(questionnaireMetricValueIsInScope({
  siteId: "site-a",
  reportingPeriodId: null,
  period: "2026-Q3",
}, boundary), true, "legacy values without an ID may match the saved date boundary");

assert.equal(questionnaireMetricValueIsInScope({
  siteId: "site-a",
  reportingPeriodId: null,
  period: "2025-12",
}, boundary), false, "legacy values outside the saved period are excluded");

assert.equal(questionnaireCarbonCalculationIsInScope({
  siteId: "site-a",
  reportingPeriod: "2026",
}, boundary), true, "carbon context accepts the saved annual date boundary");

assert.equal(questionnaireCarbonCalculationIsInScope({
  siteId: "site-b",
  reportingPeriod: "2026",
}, boundary), false, "another site's carbon calculation is excluded");

assert.equal(questionnaireCarbonCalculationIsInScope({
  siteId: "site-a",
  reportingPeriod: "2025",
}, boundary), false, "another period's carbon calculation is excluded");

console.log("questionnaire context scope tests passed");
