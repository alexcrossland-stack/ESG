import assert from "node:assert/strict";
import { runCalculationsForPeriod } from "../../server/calculations";
import { selectGuidedInputMetric } from "../../server/raw-data-metric-sync";

const candidates = [
  { id: "disabled-default", name: "Total Employees", metricType: "manual", enabled: false, isDefault: true },
  { id: "derived-alias", name: "Employee Headcount", metricType: "derived", enabled: true, isDefault: false },
  { id: "active-alias", name: "Total Headcount", metricType: "manual", enabled: true, isDefault: false },
];

assert.equal(
  selectGuidedInputMetric(candidates, "employee_headcount")?.id,
  "active-alias",
  "guided inputs must select an enabled, directly editable alias",
);
assert.equal(
  selectGuidedInputMetric(candidates, "annual_revenue"),
  null,
  "formula operands must not be mapped to unrelated tracked metrics",
);

for (const [inputName, metricName] of [
  ["electricity_kwh", "Electricity Consumption"],
  ["gas_kwh", "Natural Gas Consumption"],
  ["vehicle_fuel_litres", "Company Vehicle Fuel Use"],
  ["diesel_litres", "Diesel Fuel Use"],
  ["petrol_litres", "Petrol Fuel Use"],
  ["total_waste_tonnes", "Waste Generated"],
  ["recycled_waste_tonnes", "Waste Recycled"],
  ["water_m3", "Water Consumption"],
  ["employee_headcount", "Total Employees"],
  ["employee_leavers", "Employee Leavers"],
  ["absence_days", "Total Absence Days"],
  ["total_training_hours", "Total Training Hours"],
] as const) {
  const selected = selectGuidedInputMetric([
    { id: inputName, name: metricName, metricType: "manual", enabled: true, isDefault: true },
  ], inputName);
  assert.equal(selected?.id, inputName, `${inputName} should map to ${metricName}`);
}

assert.equal(
  selectGuidedInputMetric([
    { id: "alias-first", name: "Total Employees", metricType: "manual", enabled: true, isDefault: false },
    { id: "default-second", name: "Employee Headcount", metricType: "manual", enabled: true, isDefault: true },
  ], "employee_headcount")?.id,
  "default-second",
  "an enabled default metric should win when more than one valid alias exists",
);
assert.equal(
  selectGuidedInputMetric([
    { id: "legacy", name: "Electricity Consumption", metricType: null, enabled: null, isDefault: null },
  ], "electricity_kwh")?.id,
  "legacy",
  "legacy directly editable metrics with nullable flags should remain eligible",
);
assert.equal(
  selectGuidedInputMetric([
    { id: "disabled", name: "Electricity Consumption", metricType: "manual", enabled: false, isDefault: true },
    { id: "derived", name: "Electricity Consumption", metricType: "derived", enabled: true, isDefault: false },
  ], "electricity_kwh"),
  null,
  "guided input must not bypass metric activation or overwrite a derived metric",
);

const factors = {
  electricity: 0.13,
  naturalGas: 0.18,
  diesel: 2.5,
  petrol: 2,
  companyCar: 0.17,
  domesticFlight: 0.25,
  shortHaulFlight: 0.15,
  longHaulFlight: 0.12,
  rail: 0.04,
  hotelNight: 6,
};

const electricityOnly = runCalculationsForPeriod({ electricity_kwh: 1_000 }, factors, {});
assert.equal(electricityOnly["Scope 2 Emissions"], 0.13);
assert.equal(electricityOnly["Scope 1 Emissions"], null);
assert.equal(electricityOnly["Business Travel Emissions"], null);
assert.equal(electricityOnly["Employee Turnover Rate"], null);
assert.equal(electricityOnly["Data Privacy Training Completion"], null);
assert.equal(electricityOnly["Carbon Intensity"], null);

const revenueWithoutHeadcount = runCalculationsForPeriod({ electricity_kwh: 1_000, annual_revenue: 2_000_000 }, factors, {});
assert.equal(
  revenueWithoutHeadcount["Carbon Intensity"],
  null,
  "revenue intensity must not be written into the canonical per-employee metric",
);

const explicitZero = runCalculationsForPeriod({ gas_kwh: 0 }, factors, {});
assert.equal(
  explicitZero["Scope 1 Emissions"],
  0,
  "an explicit zero is a real reported value and must remain distinguishable from a missing input",
);

const legacyCombinedFuel = runCalculationsForPeriod({ vehicle_fuel_litres: 100 }, factors, {});
assert.equal(
  legacyCombinedFuel["Scope 1 Emissions"],
  0.25,
  "legacy combined vehicle fuel must remain supported with its historic diesel-factor assumption",
);

const separatedFuel = runCalculationsForPeriod({ diesel_litres: 100, petrol_litres: 100 }, factors, {});
assert.equal(
  separatedFuel["Scope 1 Emissions"],
  0.45,
  "separate diesel and petrol raw inputs must use their respective emission factors",
);

const separatedFuelWithDisplayAggregate = runCalculationsForPeriod({
  vehicle_fuel_litres: 200,
  diesel_litres: 100,
  petrol_litres: 100,
}, factors, {});
assert.equal(
  separatedFuelWithDisplayAggregate["Scope 1 Emissions"],
  0.45,
  "the display aggregate must not be double counted when fuel-specific inputs are present",
);

const explicitZeroPetrol = runCalculationsForPeriod({ petrol_litres: 0 }, factors, {});
assert.equal(
  explicitZeroPetrol["Scope 1 Emissions"],
  0,
  "an explicitly reported zero petrol value must produce a real zero Scope 1 result",
);

const measuredRatio = runCalculationsForPeriod({ employee_headcount: 40, employee_leavers: 2 }, factors, {});
assert.equal(measuredRatio["Employee Turnover Rate"], 5);

const staleFormulaComponents = runCalculationsForPeriod(
  { employee_headcount: 10 },
  {},
  { "Scope 1 Emissions": 10 },
);
assert.equal(
  staleFormulaComponents["Scope 1 Emissions"],
  null,
  "a missing current Scope 1 input must invalidate a same-period formula-managed value",
);
assert.equal(
  staleFormulaComponents["Carbon Intensity"],
  null,
  "carbon intensity must not be derived from a stale formula-managed emissions component",
);

const currentEmissionsWithStaleSibling = runCalculationsForPeriod(
  { electricity_kwh: 1_000, employee_headcount: 10 },
  factors,
  { "Scope 1 Emissions": 10 },
);
assert.equal(
  currentEmissionsWithStaleSibling["Carbon Intensity"],
  0.01,
  "current-period guided emissions must still produce intensity without stale sibling components",
);

const protectedExistingComponent = runCalculationsForPeriod(
  { gas_kwh: 10_000, employee_headcount: 10 },
  factors,
  { "Scope 1 Emissions": 999 },
  { "Scope 1 Emissions": 10 },
);
assert.equal(protectedExistingComponent["Scope 1 Emissions"], 1.8);
assert.equal(
  protectedExistingComponent["Carbon Intensity"],
  1,
  "an explicitly protected component must take precedence because its persisted row remains frozen",
);

console.log("guided data metric sync tests passed");
