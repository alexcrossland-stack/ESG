import {
  evaluateFrameworkRequirement,
  frameworkResponseSourceIsEligible,
  metricFactHasValue,
  type FrameworkMetricFact,
  type FrameworkRequirementResponseFact,
  type FrameworkReadinessMapping,
  type FrameworkReadinessMetricDefinition,
  type FrameworkReadinessRequirement,
} from "../../server/framework-readiness";
import { buildFrameworkReadinessSummaryReport } from "../../server/report-engine";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function check(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`  PASS  ${name}`);
  } catch (error: any) {
    results.push({ name, passed: false, detail: error?.message || String(error) });
    console.error(`  FAIL  ${name} - ${error?.message || String(error)}`);
  }
}

const companyId = "company-a";
const requirement: FrameworkReadinessRequirement = { id: "requirement-1", requirementType: "metric" };
const definition: FrameworkReadinessMetricDefinition = { id: "definition-1", evidenceRequired: true };
const directMapping: FrameworkReadinessMapping = {
  frameworkRequirementId: requirement.id,
  metricDefinitionId: definition.id,
  mappingStrength: "direct",
};

function fact(overrides: Partial<FrameworkMetricFact> = {}): FrameworkMetricFact {
  return {
    businessId: companyId,
    valueId: "value-1",
    metricDefinitionId: definition.id,
    siteId: null,
    period: "2025",
    valueNumeric: "12",
    approvalStatus: "draft",
    evidenceCount: 0,
    approvedEvidenceCount: 0,
    ...overrides,
  };
}

function evaluate(metricFacts: FrameworkMetricFact[], mapping = directMapping) {
  return evaluateFrameworkRequirement({
    requirement,
    mappings: [mapping],
    metricDefinitions: [definition],
    metricFacts,
    scope: { businessId: companyId, period: "2025", siteId: null },
  });
}

console.log("\n=== Unit contract: Framework Readiness Facts ===\n");

check("an empty company stays missing even when a catalogue mapping exists", () => {
  const result = evaluate([
    fact({ businessId: "company-b", approvalStatus: "approved", evidenceCount: 1 }),
  ]);

  assert(result.status === "missing", `expected missing, received ${result.status}`);
  assert(result.mappedMetricCount === 1, "the catalogue mapping should remain visible");
  assert(result.factSummary.enteredValues === 0, "another tenant's fact must not be counted");
});

check("a scoped entered value advances readiness to in progress", () => {
  const result = evaluate([fact({ valueNumeric: "0" })]);

  assert(result.status === "partial", `expected partial, received ${result.status}`);
  assert(result.factSummary.usableValues === 1, "numeric zero must count as an entered value");
  assert(result.factSummary.approvedValues === 0, "a draft value must not be reported as approved");
});

check("boolean false is a real entered value", () => {
  const booleanFact = fact({ valueNumeric: null, valueBoolean: false });
  assert(metricFactHasValue(booleanFact), "boolean false was treated as an empty value");
});

check("an approved value remains in progress when required evidence is absent", () => {
  const result = evaluate([fact({ approvalStatus: "approved" })]);

  assert(result.status === "partial", `expected partial, received ${result.status}`);
  assert(result.factSummary.approvedValues === 1, "approval should be represented explicitly");
  assert(result.factSummary.evidenceFiles === 0, "evidence should not be inferred");
});

check("a rejected value is visible but does not advance readiness", () => {
  const result = evaluate([fact({ approvalStatus: "rejected", evidenceCount: 1 })]);

  assert(result.status === "missing", `expected missing, received ${result.status}`);
  assert(result.factSummary.enteredValues === 1, "the rejected entry should remain visible");
  assert(result.factSummary.rejectedValues === 1, "the rejected state should be explicit");
  assert(result.factSummary.usableValues === 0, "rejected data must not count as usable");
});

check("an approved value with attached evidence becomes ready", () => {
  const result = evaluate([fact({ approvalStatus: "approved", evidenceCount: 1 })]);

  assert(result.status === "covered", `expected covered, received ${result.status}`);
  assert(result.factSummary.approvedValues === 1, "approved value count should be explicit");
  assert(result.factSummary.evidencedValues === 1, "evidenced value count should be explicit");
  assert(result.factSummary.evidenceFiles === 1, "attached evidence count should be explicit");
});

check("an approved sub-period value cannot cover a longer reporting period", () => {
  const result = evaluate([fact({
    approvalStatus: "approved",
    evidenceCount: 1,
    periodCoverage: "subperiod",
  })]);

  assert(result.status === "partial", `expected partial, received ${result.status}`);
  assert(result.factSummary.subperiodValues === 1, "sub-period fact count should be explicit");
  assert(
    result.additionalNeeded.some((item) => item.includes("full reporting period")),
    `expected full-period next step, received ${result.additionalNeeded.join("; ")}`,
  );
});

check("period and site filters exclude otherwise ready facts", () => {
  const wrongPeriod = evaluate([fact({ approvalStatus: "approved", evidenceCount: 1, period: "2024" })]);
  const wrongSite = evaluate([fact({ approvalStatus: "approved", evidenceCount: 1, siteId: "site-1" })]);

  assert(wrongPeriod.status === "missing", "a value from another period was counted");
  assert(wrongSite.status === "missing", "a value from another site scope was counted");
});

check("a partial catalogue mapping cannot become ready", () => {
  const result = evaluate(
    [fact({ approvalStatus: "approved", evidenceCount: 1 })],
    { ...directMapping, mappingStrength: "partial" },
  );

  assert(result.status === "partial", `expected partial, received ${result.status}`);
});

check("non-metric requirements are never satisfied by catalogue or metric facts", () => {
  const requirementTypes: FrameworkReadinessRequirement["requirementType"][] = [
    "policy", "target", "risk", "evidence", "narrative",
  ];

  for (const requirementType of requirementTypes) {
    const nonMetricRequirement: FrameworkReadinessRequirement = { id: `requirement-${requirementType}`, requirementType };
    const result = evaluateFrameworkRequirement({
      requirement: nonMetricRequirement,
      mappings: [{ ...directMapping, frameworkRequirementId: nonMetricRequirement.id }],
      metricDefinitions: [definition],
      metricFacts: [fact({ approvalStatus: "approved", evidenceCount: 1 })],
      scope: { businessId: companyId, period: "2025", siteId: null },
    });

    assert(result.status === "missing", `${requirementType} was inferred from a catalogue metric mapping`);
    assert(result.factSummary.requirementLinkedEvidence === 0, `${requirementType} inferred requirement evidence`);
  }
});

check("explicit reviewed evidence can satisfy an evidence requirement", () => {
  const evidenceRequirement: FrameworkReadinessRequirement = { id: "requirement-evidence", requirementType: "evidence" };
  const result = evaluateFrameworkRequirement({
    requirement: evidenceRequirement,
    mappings: [],
    metricDefinitions: [definition],
    metricFacts: [],
    requirementEvidenceFacts: [{
      businessId: companyId,
      requirementId: evidenceRequirement.id,
      siteId: null,
      period: "2025",
      evidenceStatus: "reviewed",
    }],
    scope: { businessId: companyId, period: "2025", siteId: null },
  });

  assert(result.status === "covered", `expected covered, received ${result.status}`);
  assert(result.factSummary.approvedRequirementLinkedEvidence === 1, "reviewed evidence should be explicit");
});

check("unperioded requirement evidence is not reused by a period-scoped readiness view", () => {
  const evidenceRequirement: FrameworkReadinessRequirement = { id: "requirement-period-evidence", requirementType: "evidence" };
  const result = evaluateFrameworkRequirement({
    requirement: evidenceRequirement,
    mappings: [],
    metricDefinitions: [definition],
    metricFacts: [],
    requirementEvidenceFacts: [{
      businessId: companyId,
      requirementId: evidenceRequirement.id,
      siteId: null,
      period: null,
      evidenceStatus: "approved",
    }],
    scope: { businessId: companyId, period: "2025", siteId: null },
  });

  assert(result.status === "missing", `unperioded evidence incorrectly produced ${result.status}`);
  assert(result.factSummary.requirementLinkedEvidence === 0, "unperioded evidence leaked into the selected period");
});

check("draft and submitted narrative responses are partial until approved", () => {
  const narrativeRequirement: FrameworkReadinessRequirement = { id: "requirement-narrative", requirementType: "narrative" };
  const evaluateNarrative = (responseStatus: string) => evaluateFrameworkRequirement({
    requirement: narrativeRequirement,
    mappings: [],
    metricDefinitions: [],
    metricFacts: [],
    requirementResponseFacts: [{
      businessId: companyId,
      requirementId: narrativeRequirement.id,
      siteId: null,
      period: "2025",
      responseText: "The board reviews material ESG matters quarterly.",
      responseStatus,
      sourceIsEligible: true,
    }],
    scope: { businessId: companyId, period: "2025", siteId: null },
  });

  assert(evaluateNarrative("draft").status === "partial", "draft narrative should be partial");
  assert(evaluateNarrative("submitted").status === "partial", "submitted narrative should be partial");
  const approved = evaluateNarrative("approved");
  assert(approved.status === "covered", "approved narrative should be covered");
  assert(approved.factSummary.requirementResponses === 1, "response count should be explicit");
  assert(approved.factSummary.approvedRequirementResponses === 1, "approved response count should be explicit");
});

check("an approved linked response only covers a matching eligible source", () => {
  const policyRequirement: FrameworkReadinessRequirement = { id: "requirement-policy", requirementType: "policy" };
  const evaluatePolicy = (sourceIsEligible: boolean, linkedEntityType: "policy" | "target" = "policy") => evaluateFrameworkRequirement({
    requirement: policyRequirement,
    mappings: [],
    metricDefinitions: [],
    metricFacts: [],
    requirementResponseFacts: [{
      businessId: companyId,
      requirementId: policyRequirement.id,
      siteId: null,
      period: "2025",
      linkedEntityType,
      linkedEntityId: "policy-1",
      responseStatus: "approved",
      sourceIsEligible,
    }],
    scope: { businessId: companyId, period: "2025", siteId: null },
  });

  assert(evaluatePolicy(true).status === "covered", "eligible policy should cover the requirement");
  const ineligible = evaluatePolicy(false);
  assert(ineligible.status === "partial", "an ineligible approved source should remain partial");
  assert(ineligible.factSummary.invalidRequirementResponses === 1, "invalid response count should be explicit");
  assert(evaluatePolicy(true, "target").status === "partial", "wrong linked source type must not cover policy requirement");
});

check("response facts remain tenant, period, and site scoped", () => {
  const targetRequirement: FrameworkReadinessRequirement = { id: "requirement-target", requirementType: "target" };
  const baseResponse: FrameworkRequirementResponseFact = {
    businessId: companyId,
    requirementId: targetRequirement.id,
    siteId: null,
    period: "2025",
    linkedEntityType: "target" as const,
    linkedEntityId: "target-1",
    responseStatus: "approved",
    sourceIsEligible: true,
  };
  const evaluateResponse = (overrides: Partial<FrameworkRequirementResponseFact>) => evaluateFrameworkRequirement({
    requirement: targetRequirement,
    mappings: [],
    metricDefinitions: [],
    metricFacts: [],
    requirementResponseFacts: [{ ...baseResponse, ...overrides }],
    scope: { businessId: companyId, period: "2025", siteId: null },
  });

  assert(evaluateResponse({ businessId: "company-b" }).status === "missing", "another tenant response was counted");
  assert(evaluateResponse({ period: "2024" }).status === "missing", "another period response was counted");
  assert(evaluateResponse({ siteId: "site-1" }).status === "missing", "another site response was counted");
});

check("direct evidence cannot replace a narrative, policy, target, or risk response", () => {
  const policyRequirement: FrameworkReadinessRequirement = { id: "requirement-policy-evidence-only", requirementType: "policy" };
  const result = evaluateFrameworkRequirement({
    requirement: policyRequirement,
    mappings: [],
    metricDefinitions: [],
    metricFacts: [],
    requirementEvidenceFacts: [{
      businessId: companyId,
      requirementId: policyRequirement.id,
      siteId: null,
      period: "2025",
      evidenceStatus: "approved",
    }],
    scope: { businessId: companyId, period: "2025", siteId: null },
  });

  assert(result.status === "missing", "policy requirement was advanced by evidence without a response");
  assert(result.factSummary.approvedRequirementLinkedEvidence === 1, "supporting evidence should still be counted");
});

check("linked source eligibility requires an active policy, quantified target, or scored risk", () => {
  assert(frameworkResponseSourceIsEligible({ linkedEntityType: "policy", status: "active" }), "active policy should be eligible");
  assert(!frameworkResponseSourceIsEligible({ linkedEntityType: "policy", status: "draft" }), "draft policy should be ineligible");
  assert(frameworkResponseSourceIsEligible({ linkedEntityType: "target", status: "in_progress", targetValue: "10", targetYear: 2030 }), "quantified target should be eligible");
  assert(!frameworkResponseSourceIsEligible({ linkedEntityType: "target", status: "cancelled", targetValue: "10", targetYear: 2030 }), "cancelled target should be ineligible");
  assert(frameworkResponseSourceIsEligible({ linkedEntityType: "risk", riskScore: 0 }), "a completed zero risk score should be eligible");
  assert(!frameworkResponseSourceIsEligible({ linkedEntityType: "risk", riskScore: null }), "unscored risk should be ineligible");
});

check("framework readiness export consumes the storage contract and reports strict covered, partial, and missing counts", () => {
  const framework = { id: "framework-1", code: "VSME", name: "VSME" };
  const report = buildFrameworkReadinessSummaryReport({
    company: { name: "Example SME" },
    selectedFrameworks: [framework],
    period: "2025",
    siteId: null,
    frameworkReadiness: [{
      framework,
      summary: { covered: 1, partial: 1, missing: 1, total: 3 },
      requirements: [
        { code: "C1", title: "Covered requirement", status: "covered", additionalNeeded: [] },
        { code: "C2", title: "Partial requirement", status: "partial", additionalNeeded: ["Approve the response"] },
        { code: "C3", title: "Missing requirement", status: "missing", additionalNeeded: ["Add evidence"] },
      ],
      scope: { period: "2025", siteMode: "organisation", siteId: null },
    }],
  });

  const overview = report.sections.find((section) => section.title === "Framework Readiness Overview");
  assert(overview?.content?.includes("2025"), "the exported overview omitted the readiness period");
  assert(overview?.content?.includes("Organisation-wide records only"), "the exported overview omitted the organisation scope");

  const alignment = report.sections.find((section) => section.title === "Framework Alignment Status");
  assert(
    JSON.stringify(alignment?.tableRows?.[0]) === JSON.stringify(["VSME", "33%", "1", "1", "1", "Partial"]),
    `unexpected storage-shaped readiness row: ${JSON.stringify(alignment?.tableRows?.[0])}`,
  );

  const gaps = report.sections.find((section) => section.title === "Readiness Gaps")?.items ?? [];
  assert(gaps.some((item) => item.includes("C2") && item.includes("partial")), "partial requirement missing from export gaps");
  assert(gaps.some((item) => item.includes("C3") && item.includes("missing")), "missing requirement missing from export gaps");
  assert(!gaps.some((item) => item.includes("C1")), "covered requirement was incorrectly exported as a gap");

  const methodology = report.sections.find((section) => section.title === "Methodology Note")?.content ?? "";
  assert(methodology.includes("approved requirement response"), "methodology omitted response approval requirements");
  assert(methodology.includes("reviewed or approved requirement-linked evidence"), "methodology omitted evidence review requirements");
  assert(!methodology.includes("reported data for the period"), "methodology still claims any reported metric covers a requirement");
});

const passed = results.filter((result) => result.passed).length;
console.log(`\n=== Framework Readiness Facts: ${passed}/${results.length} passed ===\n`);
if (passed !== results.length) process.exit(1);
