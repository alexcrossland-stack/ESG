import assert from "node:assert/strict";
import {
  calculateBusinessTravelEmissions,
  calculateScope1,
  calculateScope2,
  type EmissionFactorMap,
} from "../../server/calculations";
import { UK_2026_EMISSION_FACTORS } from "../../server/seed-emission-factors";
import {
  CURRENT_UK_FACTOR_SOURCE_URL,
  CURRENT_UK_FACTOR_YEAR,
  emissionFactorYearFromSet,
} from "../../shared/emission-factor-metadata";

function asMap(): EmissionFactorMap {
  const value = (name: string) => Number(UK_2026_EMISSION_FACTORS.find((factor) => factor.name === name)?.factor);
  return {
    electricity: value("Grid Electricity"),
    naturalGas: value("Natural Gas"),
    diesel: value("Diesel"),
    petrol: value("Petrol"),
    companyCar: value("Average Company Car"),
    domesticFlight: value("Domestic Flight"),
    shortHaulFlight: value("Short-haul Flight"),
    longHaulFlight: value("Long-haul Flight"),
    rail: value("Rail Travel"),
    hotelNight: value("Hotel Nights"),
  };
}

assert.equal(UK_2026_EMISSION_FACTORS.length, 11);
assert.ok(UK_2026_EMISSION_FACTORS.every((factor) => factor.factorYear === CURRENT_UK_FACTOR_YEAR));
assert.ok(UK_2026_EMISSION_FACTORS.every((factor) => factor.methodology?.includes(CURRENT_UK_FACTOR_SOURCE_URL)));

const factors = asMap();
assert.ok(Math.abs(calculateScope1(10_000, 100, factors) - 2.081454) < 1e-9);
assert.ok(Math.abs(calculateScope2(10_000, factors) - 1.3096) < 1e-9);
assert.ok(Math.abs(
  calculateBusinessTravelEmissions({ domesticFlightKm: 1_000, railKm: 1_000 }, factors) - 0.2602,
) < 1e-9);

assert.throws(
  () => calculateScope2(1_000, {}),
  /No valid emission factor is configured for UK grid electricity/,
);
assert.doesNotThrow(() => calculateScope2(0, {}));

assert.equal(emissionFactorYearFromSet("UK_GOVERNMENT_2026"), 2026);
assert.equal(emissionFactorYearFromSet("UK_DEFRA_2024"), 2024);
assert.equal(emissionFactorYearFromSet(undefined), CURRENT_UK_FACTOR_YEAR);

console.log("emission factor provenance tests passed");
