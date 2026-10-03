import assert from "node:assert/strict";
import { aggregateMetricHistory, aggregateTrendValue } from "../../shared/esg-trends";
import { isMetricDueInMonth } from "../../shared/metric-cadence";
import { compatibleCarbonSources, compatibleCarbonMetricSources } from "../../client/src/lib/carbon-source-inputs";
import { loadColumnMappings, saveColumnMappings } from "../../client/src/lib/import-column-mappings";

const metric = { id: "energy", name: "Energy", unit: "kWh" };
const rows = [
  { period: "2026-08", value: "100" }, { period: "2026-08", value: "200" },
  { period: "2026-09", value: "110" }, { period: "2026-09", value: "220" },
  { period: "2026-11", value: "900" }, { period: "2026-11", value: "990" },
].map(row => ({ ...row, metricId: metric.id }));
assert.deepEqual(aggregateMetricHistory(metric, rows, "2026-09"), [{ period: "2026-08", value: 300 }, { period: "2026-09", value: 330 }]);
assert.deepEqual(aggregateMetricHistory(metric, [...rows, { metricId: metric.id, period: "2026-Q3", value: "55" }, { metricId: metric.id, period: "2026-Q4", value: "90" }], "2026-Q3"), [{ period: "2026-Q3", value: 55 }]);
assert.deepEqual(aggregateMetricHistory(metric, [{ metricId: metric.id, period: "2025", value: "0" }, { metricId: metric.id, period: "2026", value: "10" }], "2025"), [{ period: "2025", value: 0 }]);
assert.deepEqual(aggregateMetricHistory(metric, rows, "2026-Q3"), [{ period: "2026-Q3", value: 630 }]);
assert.deepEqual(aggregateMetricHistory(metric, rows, "FY 2027", { periodType: "annual", dateFrom: "2026-07-01", dateTo: "2027-06-30" }), [{ period: "FY 2027", value: 2520 }]);
assert.deepEqual(aggregateMetricHistory({ ...metric, unit: "yes/no", direction: "compliance_yes_no" }, [{ metricId: metric.id, period: "2026-09", valueBoolean: false }], "2026-09"), [{ period: "2026-09", value: 0 }]);
assert.deepEqual(aggregateMetricHistory(metric, [{ metricId: metric.id, period: "2026-09", value: "999", workflowStatus: "rejected" }], "2026-09"), []);
assert.equal(aggregateTrendValue(metric, [{ metricId: metric.id, period: "2026-09", value: "0" }]), 0);
assert.equal(aggregateTrendValue({ ...metric, unit: "%" }, rows.slice(0, 2).map((row, index) => ({ ...row, weight: index ? 3 : 1 }))), 175);
assert.equal(aggregateTrendValue({ ...metric, unit: "%" }, rows.slice(0, 2).map((row, index) => ({ ...row, weight: index ? undefined : 1 }))), 150);
for (const frequency of ["monthly", "one-off", "once", null, "unsupported"]) assert.ok(isMetricDueInMonth(frequency));
for (const frequency of ["quarterly", "annual"]) assert.ok(!isMetricDueInMonth(frequency));
const sources = [{ inputName: "gas_kwh", value: "0", period: "2026-09", siteId: null, dataSourceType: "estimated" }, { inputName: "electricity_kwh", value: "100", period: "2026-08", siteId: null }];
assert.deepEqual(compatibleCarbonSources(sources, "2026-09", null).map(row => [row.field, row.value, row.quality]), [["gas", "0", "estimated"]]);
assert.equal(compatibleCarbonSources(sources, "2026-09", "other-site").length, 0);
assert.equal(compatibleCarbonSources([...sources, sources[0]], "2026-09", null).length, 0);
const energyMetric = { id: "electricity", name: "Electricity Consumption", unit: "kWh", frequency: "monthly", metricType: "manual" };
const energyValues = [{ metricId: "electricity", value: "400", period: "2026-09", siteId: null }];
assert.equal(compatibleCarbonMetricSources([energyMetric], energyValues, "2026-09", null)[0].value, "400");
assert.equal(compatibleCarbonMetricSources([energyMetric], energyValues, "2026-08", null).length, 0);
assert.equal(compatibleCarbonMetricSources([energyMetric], energyValues, "2026-09", "other").length, 0);
assert.equal(compatibleCarbonMetricSources([energyMetric, { ...energyMetric, id: "ambiguous" }], energyValues, "2026-09", null).length, 0);
assert.equal(compatibleCarbonMetricSources([{ ...energyMetric, name: "Gas / Fuel Consumption" }], energyValues, "2026-09", null).length, 0);
assert.equal(compatibleCarbonMetricSources([{ ...energyMetric, unit: "MWh" }], energyValues, "2026-09", null).length, 0);
const store = new Map<string, string>();
const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
const mappings = [{ column: "Gas", inputKey: "gas_kwh" }, { column: "Ignored", inputKey: null }];
saveColumnMappings(storage, "tenant-a", mappings);
assert.deepEqual(loadColumnMappings(storage, "tenant-a", ["Ignored", "Gas"], ["gas_kwh"]), [...mappings].reverse());
assert.equal(loadColumnMappings(storage, "tenant-b", ["Gas", "Ignored"], ["gas_kwh"]), null);
assert.equal(loadColumnMappings(storage, "tenant-a", ["Gas", "Ignored"], []), null);
assert.equal(loadColumnMappings(storage, "tenant-a", ["Gas", "Gas"], ["gas_kwh"]), null);
console.log("PASS platform history, zero/weighted rates, cadence, carbon provenance and company-scoped import mapping regressions");
