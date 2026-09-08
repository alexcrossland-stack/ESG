import assert from "node:assert/strict";
import { getCategoryKey, getCategoryLabel } from "../../shared/categories";
import { groupMetricsByCategory } from "../../client/src/lib/metric-categories";

const aliases = [
  ["waste", "Waste", " WASTE "],
  ["energy", "Energy"],
  ["emissions", "Emissions"],
  ["water", "Water"],
  ["biodiversity", "Biodiversity"],
  ["workforce", "Workforce"],
  ["community", "Community"],
  ["supply_chain", "Supply Chain", " supply-chain ", "SUPPLY  CHAIN"],
  ["health_safety", "Health & Safety", "Health and Safety", "Health-Safety"],
  ["data_privacy", "Data & Privacy", "Data Privacy"],
];

for (const variants of aliases) {
  for (const variant of variants) {
    assert.equal(getCategoryKey(variant), variants[0], variant);
    assert.equal(getCategoryLabel(variant), getCategoryLabel(variants[0]), variant);
    assert.equal(getCategoryKey(getCategoryKey(variant)), getCategoryKey(variant));
    assert.equal(getCategoryKey(getCategoryLabel(variant)), getCategoryKey(variant));
  }
}
for (const empty of [null, undefined, "", "  ", "___"]) {
  assert.equal(getCategoryKey(empty), "uncategorised");
  assert.equal(getCategoryLabel(empty), "Uncategorised");
}
assert.equal(getCategoryLabel("health_safety"), "Health & Safety");
assert.equal(getCategoryLabel("esg_strategy"), "ESG Strategy");
assert.equal(getCategoryLabel("customer_success"), "Customer Success");
assert.notEqual(getCategoryKey("diversity"), getCategoryKey("Diversity & Inclusion"));
assert.notEqual(getCategoryKey("compliance"), getCategoryKey("Ethics & Compliance"));
assert.notEqual(getCategoryKey("board"), getCategoryKey("Governance Structure"));
assert.notEqual(getCategoryKey("development"), getCategoryKey("Training & Development"));
assert.equal(getCategoryKey("constructor"), "constructor");
assert.equal(getCategoryLabel("toString"), "Tostring");

const metrics = Object.freeze([
  Object.freeze({ id: "waste-a", pillar: "environmental", category: "waste", isActive: true, unit: "kg", value: 34 }),
  Object.freeze({ id: "waste-b", pillar: "environmental", category: "Waste", isActive: false, unit: "tonnes", value: 8 }),
  Object.freeze({ id: "supply-a", pillar: "social", category: "supply_chain", isActive: true, unit: "%", value: 5 }),
  Object.freeze({ id: "supply-b", pillar: "social", category: "Supply Chain", isActive: false, unit: "%", value: 15 }),
  Object.freeze({ id: "supply-c", pillar: "governance", category: "Supply Chain", isActive: true, unit: "%", value: 75 }),
  Object.freeze({ id: "missing", pillar: "social", category: null, isActive: true, unit: "%", value: 0 }),
]);
const grouped = groupMetricsByCategory(metrics);
assert.deepEqual(Object.keys(grouped.environmental), ["waste"]);
assert.deepEqual(grouped.environmental.waste.map((metric) => metric.id), ["waste-a", "waste-b"]);
assert.equal(grouped.environmental.waste.filter((metric) => metric.isActive).length, 1);
assert.equal(grouped.social.supply_chain.length, 2);
assert.equal(grouped.governance.supply_chain.length, 1, "same category in different pillars must stay separate");
assert.equal(grouped.social.uncategorised[0], metrics[5]);
const allGrouped = Object.values(grouped).flatMap((groups) => Object.values(groups).flat());
assert.equal(allGrouped.length, metrics.length);
for (const metric of metrics) {
  assert.equal(allGrouped.find((item) => item.id === metric.id), metric, "original records must be retained untouched");
}
assert.equal(Object.keys(groupMetricsByCategory([])).length, 0);
console.log("category normalisation tests passed");
