import assert from "node:assert/strict";
import { buildGuidedRawDataMutation } from "../../client/src/lib/guided-raw-data-mutation";

const visibleInputKeys = new Set(["electricity_kwh", "vehicle_fuel_litres"]);
const persistedRawData = [
  { inputName: "electricity_kwh", value: "456.0000" },
  { inputName: "diesel_litres", value: "500.0000" },
  { inputName: "petrol_litres", value: "200.0000" },
  { inputName: "vehicle_fuel_litres", value: "700.0000" },
];
const importedFormState = {
  electricity_kwh: "456",
  diesel_litres: "500",
  petrol_litres: "200",
  vehicle_fuel_litres: "700",
};

assert.deepEqual(
  buildGuidedRawDataMutation({ rawInputs: importedFormState, persistedRawData, visibleInputKeys }),
  { inputs: {}, clearInputs: [] },
  "an untouched form must not resubmit the visible fuel aggregate or hidden typed fuels",
);

assert.deepEqual(
  buildGuidedRawDataMutation({
    rawInputs: { ...importedFormState, electricity_kwh: "500" },
    persistedRawData,
    visibleInputKeys,
  }),
  { inputs: { electricity_kwh: "500" }, clearInputs: [] },
  "an unrelated guided edit must leave the imported fuel representation untouched",
);

assert.deepEqual(
  buildGuidedRawDataMutation({
    rawInputs: { ...importedFormState, vehicle_fuel_litres: "300" },
    persistedRawData,
    visibleInputKeys,
  }),
  { inputs: { vehicle_fuel_litres: "300" }, clearInputs: [] },
  "an explicit combined-fuel edit must be sent without hidden typed values",
);

assert.deepEqual(
  buildGuidedRawDataMutation({
    rawInputs: { ...importedFormState, vehicle_fuel_litres: "" },
    persistedRawData,
    visibleInputKeys,
  }),
  { inputs: {}, clearInputs: ["vehicle_fuel_litres"] },
  "clearing the visible combined-fuel field must request its removal",
);

console.log("guided raw data mutation tests passed");
