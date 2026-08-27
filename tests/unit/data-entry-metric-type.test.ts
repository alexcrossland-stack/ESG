import assert from "node:assert/strict";
import { formatMetricDisplayValue, hasMetricReportedValue, resolveMetricDataType } from "../../shared/data-entry-metrics";

assert.equal(resolveMetricDataType({ unit: "yes/no" }), "boolean");
assert.equal(resolveMetricDataType({ unit: "Yes / No" }), "boolean");
assert.equal(resolveMetricDataType({ direction: "compliance_yes_no" }), "boolean");
assert.equal(resolveMetricDataType({ unit: "kg" }, "boolean"), "boolean");
assert.equal(resolveMetricDataType({ unit: "yes/no" }, "numeric"), "boolean");
assert.equal(resolveMetricDataType({ unit: "kWh" }), "numeric");
assert.equal(resolveMetricDataType({ unit: null }, "text"), "text");
assert.equal(formatMetricDisplayValue({ value: "303.2500" }), "303.25");
assert.equal(formatMetricDisplayValue({ value: "100.0000" }), "100");
assert.equal(formatMetricDisplayValue({ value: "001.500" }), "001.5");
assert.equal(formatMetricDisplayValue({ value: "not-a-number" }), "not-a-number");
assert.equal(formatMetricDisplayValue({ value: null, valueBoolean: true }), "Yes");
assert.equal(formatMetricDisplayValue({ value: null, valueBoolean: false }), "No");
assert.equal(hasMetricReportedValue({ value: null, valueBoolean: false }), true);
assert.equal(hasMetricReportedValue({ value: null, valueText: "Recorded narrative" }), true);
assert.equal(hasMetricReportedValue({ value: null, valueJson: { answer: "recorded" } }), true);
assert.equal(hasMetricReportedValue({ value: null, valueText: "" }), false);

console.log("data-entry metric type inference tests passed");
