import assert from "node:assert/strict";
import { canonicalMetricAliases, groupMetricAliases, projectMetricAliasValues } from "../../shared/metric-aliases";
import { buildCanonicalEnabledMetrics, buildCanonicalEvidenceMetrics, buildMetricLibraryEntries, resolveCanonicalMetricValueSource } from "../../client/src/lib/metric-activation";
import { canonicalPasteGrid, type GridResponse } from "../../client/src/lib/paste-grid-response";

const waste = { id: "waste", name: "Waste Generated", category: "environmental" as const, unit: "tonnes", frequency: "monthly", metricType: "manual", dataType: "numeric", enabled: true, isDefault: true };
const legacy = { ...waste, id: "legacy-waste", name: "Total Waste Generated", isDefault: false };
const recycled = { ...waste, id: "recycled", name: "Waste Recycled", isDefault: false };
const legacyRecycled = { ...recycled, id: "legacy-recycled", name: "Recycled Waste" };
const company = [legacy, legacyRecycled, waste, recycled];
const definitions = company.map((metric) => ({ ...metric, id: `def-${metric.id}`, code: metric.id, pillar: metric.category, category: "Waste", inputFrequency: metric.frequency, isActive: true, isCore: true, isDerived: false, formulaJson: null, evidenceRequired: true }));
const library = buildMetricLibraryEntries(definitions, company);
assert.equal(library.length, 2, "each waste concept is shown once, regardless of input order");
assert.deepEqual(library.map((metric) => metric.name), ["Waste Generated", "Waste Recycled"]);
assert.equal(library[0].companyMetricId, waste.id);
assert.deepEqual(library[0].aliasMetricIds, [waste.id, legacy.id]);
assert.equal(library[0].aliasDefinitionIds?.length, 2, "legacy definition deep links remain addressable");
assert.deepEqual(buildMetricLibraryEntries(definitions, [waste, { ...legacy, enabled: false }]).find((metric) => metric.name === waste.name)?.isActive, true, "a disabled sibling cannot hide an enabled concept");

const canonical = buildCanonicalEnabledMetrics(definitions, company);
assert.equal(canonical.length, 2, "the data workspace completion denominator has two concepts, not four rows");
assert.equal(canonical[0].id, waste.id, "guided/manual entry choose the same default source");
const value = { id: "saved-legacy-value", metricId: legacy.id, period: "2026-09", siteId: null, value: "0", locked: false, dataSourceType: "manual", workflowStatus: "draft" };
const inScope = (row: typeof value) => row.period === "2026-09" && row.siteId === null;
assert.equal(resolveCanonicalMetricValueSource(canonical[0], [value], inScope).id, legacy.id, "existing legacy values, including zero, keep their original editable ID");
assert.equal(resolveCanonicalMetricValueSource(canonical[0], [{ ...value, period: "2026-08" }], inScope).id, waste.id, "another period does not fill this period");
assert.equal(resolveCanonicalMetricValueSource(canonical[0], [value], () => false).id, waste.id, "another site does not fill this scope");
assert.equal(resolveCanonicalMetricValueSource(canonical[0], [], inScope, legacy.id).id, legacy.id, "explicit legacy entry deep links retain the requested ID");

const conflicts = [value, { ...value, id: "saved-primary-value", metricId: waste.id, value: "2" }];
const snapshot = JSON.stringify(conflicts);
const projected = projectMetricAliasValues(company, conflicts);
assert.equal(projected.length, 1);
assert.equal(projected[0].value, "2", "aliases are not summed");
assert.equal(projected[0].id, "saved-primary-value");
assert.equal(JSON.stringify(conflicts), snapshot, "projection never rewrites stored or caller-owned rows");
const fallback = projectMetricAliasValues(company, [value, { ...value, id: "blank-primary", metricId: waste.id, value: "" }]);
assert.equal(fallback[0].id, value.id, "a blank primary cannot hide reported legacy data");
assert.equal(fallback[0].metricId, waste.id, "only read-only summaries project the concept ID");
assert.equal(projectMetricAliasValues(company, [value, { ...value, id: "different-period", period: "2026-08" }, { ...value, id: "different-site", siteId: "site-b" }]).length, 3, "period/site boundaries remain separate");

for (const incompatible of [
  { ...legacy, unit: "kg" },
  { ...legacy, frequency: "annual" },
  { ...legacy, category: "social" as const },
  { ...legacy, metricType: "calculated", formulaText: "x * 2" },
  { ...legacy, dataType: "text" },
]) assert.equal(groupMetricAliases([waste, incompatible]).length, 2, "different measurement contracts must never collapse");
assert.equal(groupMetricAliases([{ ...waste, metricType: "calculated", formulaText: "x * 2" }, { ...legacy, metricType: "calculated", formulaText: "x * 3" }]).length, 2);
const gasDefinitions = [
  { ...definitions[0], id: "z", name: "Gas / Fuel Consumption", unit: "kWh" },
  { ...definitions[0], id: "a", name: "Natural Gas Consumption", unit: "m3" },
];
assert.equal(buildMetricLibraryEntries(gasDefinitions, [])[0].id, "z", "non-waste precedence is unchanged");
assert.equal(buildMetricLibraryEntries(gasDefinitions, [])[0].unit, "kWh");
const unitVariants = buildCanonicalEnabledMetrics([], [waste, { ...legacy, unit: "kg" }]);
const evidence = buildCanonicalEvidenceMetrics(unitVariants, [{ metricId: waste.id, metricName: waste.name, hasEvidence: true, dataSourceType: "evidenced" }]);
assert.equal(evidence.filter((metric) => metric.hasEvidence).length, 1, "evidence must not leak across same-label, different-unit groups");
assert.equal(evidence.find((metric) => metric.unit === "kg")?.dataSourceType, null);

const grid: GridResponse = { metrics: company.map((metric) => ({ ...metric, readOnly: false })), periods: ["2026-09"], values: [value], lockedPeriods: [] };
const single = canonicalPasteGrid(grid);
assert.equal(single.metrics.length, 2, "spreadsheet default view also tracks one row per concept");
assert.equal(single.metrics.find((metric) => metric.name === waste.name)?.id, legacy.id, "spreadsheet edits keep the populated legacy source ID");
assert.equal(single.metrics.find((metric) => metric.name === waste.name)?.readOnly, false);
assert.equal(single.values[0].metricId, legacy.id, "editable grid never rebinds value IDs");
const mixed = canonicalPasteGrid({ ...grid, values: conflicts });
assert.equal(mixed.metrics.find((metric) => metric.name === waste.name)?.readOnly, true, "mixed histories require explicit original-record selection before spreadsheet edits");
assert.equal(mixed.metrics.find((metric) => metric.name === waste.name)?.legacyReviewRequired, true);
assert.equal(JSON.stringify(conflicts), snapshot);
assert.equal(canonicalMetricAliases(company).length, 2);
console.log("metric alias presentation tests passed");
