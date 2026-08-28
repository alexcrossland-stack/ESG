import assert from "node:assert/strict";
import {
  buildCanonicalEnabledMetrics,
  buildMetricLibraryEntries,
} from "../../client/src/lib/metric-activation";

const definition = {
  id: "definition-carbon-intensity",
  code: "ENV-CARBON-INTENSITY",
  name: "Carbon Intensity",
  pillar: "environmental" as const,
  category: "Emissions",
  description: "Emissions per employee",
  dataType: "numeric",
  unit: "tCO2e/employee",
  inputFrequency: "quarterly",
  isCore: true,
  isActive: true,
  isDerived: false,
  formulaJson: null,
  frameworkTags: ["VSME"],
  scoringWeight: "1",
  evidenceRequired: false,
  rollupMethod: "average",
  sortOrder: 10,
};

const calculatedCompanyMetric = {
  id: "company-carbon-intensity",
  name: "  carbon intensity ",
  category: "environmental" as const,
  description: "Company calculation",
  unit: "tCO2e/employee",
  dataType: "numeric",
  enabled: true,
  metricType: "calculated",
  direction: "lower_is_better",
  helpText: "Calculated automatically",
  formulaText: "(Scope 1 + Scope 2) / Employees",
};

const library = buildMetricLibraryEntries([definition], [calculatedCompanyMetric]);
assert.equal(library.length, 1, "same-name definition and company metric must remain one library row");
assert.equal(library[0]?.companyMetricId, calculatedCompanyMetric.id);
assert.equal(library[0]?.metricType, "calculated");
assert.equal(library[0]?.formulaText, calculatedCompanyMetric.formulaText);
assert.deepEqual(library[0]?.formulaJson, {}, "calculated classification must survive a manual-looking definition");
assert.equal(library[0]?.isActive, true);

const canonical = buildCanonicalEnabledMetrics([definition], [calculatedCompanyMetric]);
assert.equal(canonical.length, 1, "same-name metrics must not duplicate the active Metrics surface");
assert.equal(canonical[0]?.source, "merged");
assert.equal(canonical[0]?.definitionId, definition.id);
assert.equal(canonical[0]?.id, calculatedCompanyMetric.id);
assert.equal(canonical[0]?.metricType, "calculated");
assert.equal(canonical[0]?.formulaText, calculatedCompanyMetric.formulaText);
assert.equal(canonical[0]?.missingCompanyMetric, false);

const disabledLibrary = buildMetricLibraryEntries(
  [{ ...definition, isActive: true }],
  [{ ...calculatedCompanyMetric, enabled: false }],
);
assert.equal(disabledLibrary[0]?.isActive, false, "company activation state must remain authoritative");

const supportedFrequencies = ["monthly", "quarterly", "annual"] as const;

for (const frequency of supportedFrequencies) {
  const syntheticCustomLibrary = buildMetricLibraryEntries([], [{
    id: `custom-${frequency}-water`,
    name: `${frequency} Water Audit`,
    category: "environmental",
    unit: "m3",
    frequency,
    enabled: true,
    metricType: "manual",
  }]);
  assert.equal(syntheticCustomLibrary.length, 1);
  assert.equal(
    syntheticCustomLibrary[0]?.inputFrequency,
    frequency,
    `synthetic custom metric frequency must remain ${frequency}`,
  );

  const mergedCustomLibrary = buildMetricLibraryEntries(
    [{
      ...definition,
      id: `definition-${frequency}-water`,
      code: `ENV-${frequency.toUpperCase()}-WATER`,
      name: `${frequency} Water Consumption`,
      inputFrequency: frequency === "monthly" ? "annual" : "monthly",
    }],
    [{
      id: `company-${frequency}-water`,
      name: ` ${frequency} water consumption `,
      category: "environmental",
      unit: "m3",
      frequency,
      enabled: true,
      metricType: "manual",
    }],
  );
  assert.equal(mergedCustomLibrary.length, 1);
  assert.equal(mergedCustomLibrary[0]?.companyMetricId, `company-${frequency}-water`);
  assert.equal(
    mergedCustomLibrary[0]?.inputFrequency,
    frequency,
    `same-name merged metric frequency must remain ${frequency}`,
  );
}

console.log("metric activation merge tests passed");
