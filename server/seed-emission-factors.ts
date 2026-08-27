import { storage } from "./storage";
import type { InsertEmissionFactor } from "@shared/schema";
import {
  CURRENT_UK_FACTOR_SOURCE,
  CURRENT_UK_FACTOR_SOURCE_URL,
  CURRENT_UK_FACTOR_YEAR,
} from "@shared/emission-factor-metadata";

/**
 * Curated factors used by the SME calculator. Values come from the corrected
 * July 2026 UK Government flat file. We retain the source row choice in the
 * methodology so a reviewer can reproduce every calculation.
 */
export const UK_2026_EMISSION_FACTORS: InsertEmissionFactor[] = [
  {
    name: "Grid Electricity",
    category: "electricity",
    country: "UK",
    unit: "kgCO2e/kWh",
    factor: "0.130960",
    sourceLabel: CURRENT_UK_FACTOR_SOURCE,
    factorYear: CURRENT_UK_FACTOR_YEAR,
    version: 2,
    methodology: `Scope 2, location-based UK electricity generated; ${CURRENT_UK_FACTOR_SOURCE_URL}`,
  },
  {
    name: "Natural Gas",
    category: "gas",
    country: "UK",
    unit: "kgCO2e/kWh",
    factor: "0.182310",
    sourceLabel: CURRENT_UK_FACTOR_SOURCE,
    factorYear: CURRENT_UK_FACTOR_YEAR,
    version: 2,
    fuelType: "natural_gas",
    methodology: `Scope 1 natural gas on a gross calorific-value basis; ${CURRENT_UK_FACTOR_SOURCE_URL}`,
  },
  {
    name: "Diesel",
    category: "fuel",
    country: "UK",
    unit: "kgCO2e/litre",
    factor: "2.583540",
    sourceLabel: CURRENT_UK_FACTOR_SOURCE,
    factorYear: CURRENT_UK_FACTOR_YEAR,
    version: 2,
    fuelType: "diesel",
    methodology: `Scope 1 diesel, average biofuel blend, per litre; ${CURRENT_UK_FACTOR_SOURCE_URL}`,
  },
  {
    name: "Petrol",
    category: "fuel",
    country: "UK",
    unit: "kgCO2e/litre",
    factor: "2.075000",
    sourceLabel: CURRENT_UK_FACTOR_SOURCE,
    factorYear: CURRENT_UK_FACTOR_YEAR,
    version: 2,
    fuelType: "petrol",
    methodology: `Scope 1 petrol, average biofuel blend, per litre; ${CURRENT_UK_FACTOR_SOURCE_URL}`,
  },
  {
    name: "LPG",
    category: "fuel",
    country: "UK",
    unit: "kgCO2e/litre",
    factor: "1.557130",
    sourceLabel: CURRENT_UK_FACTOR_SOURCE,
    factorYear: CURRENT_UK_FACTOR_YEAR,
    version: 2,
    fuelType: "lpg",
    methodology: `Scope 1 liquefied petroleum gas per litre; ${CURRENT_UK_FACTOR_SOURCE_URL}`,
  },
  {
    name: "Average Company Car",
    category: "vehicles",
    country: "UK",
    unit: "kgCO2e/mile",
    factor: "0.266990",
    sourceLabel: CURRENT_UK_FACTOR_SOURCE,
    factorYear: CURRENT_UK_FACTOR_YEAR,
    version: 2,
    fuelType: "mixed",
    methodology: `Scope 1 average car, unknown fuel, per mile; ${CURRENT_UK_FACTOR_SOURCE_URL}`,
  },
  {
    name: "Domestic Flight",
    category: "travel",
    country: "UK",
    unit: "kgCO2e/passenger-km",
    factor: "0.229280",
    sourceLabel: CURRENT_UK_FACTOR_SOURCE,
    factorYear: CURRENT_UK_FACTOR_YEAR,
    version: 2,
    methodology: `Scope 3 domestic flight to/from the UK, average passenger, with radiative forcing; ${CURRENT_UK_FACTOR_SOURCE_URL}`,
  },
  {
    name: "Short-haul Flight",
    category: "travel",
    country: "UK",
    unit: "kgCO2e/passenger-km",
    factor: "0.127860",
    sourceLabel: CURRENT_UK_FACTOR_SOURCE,
    factorYear: CURRENT_UK_FACTOR_YEAR,
    version: 2,
    methodology: `Scope 3 short-haul flight to/from the UK, average passenger, with radiative forcing; ${CURRENT_UK_FACTOR_SOURCE_URL}`,
  },
  {
    name: "Long-haul Flight",
    category: "travel",
    country: "UK",
    unit: "kgCO2e/passenger-km",
    factor: "0.152820",
    sourceLabel: CURRENT_UK_FACTOR_SOURCE,
    factorYear: CURRENT_UK_FACTOR_YEAR,
    version: 2,
    methodology: `Scope 3 long-haul flight to/from the UK, average passenger, with radiative forcing; ${CURRENT_UK_FACTOR_SOURCE_URL}`,
  },
  {
    name: "Rail Travel",
    category: "travel",
    country: "UK",
    unit: "kgCO2e/passenger-km",
    factor: "0.030920",
    sourceLabel: CURRENT_UK_FACTOR_SOURCE,
    factorYear: CURRENT_UK_FACTOR_YEAR,
    version: 2,
    methodology: `Scope 3 national rail per passenger-kilometre; ${CURRENT_UK_FACTOR_SOURCE_URL}`,
  },
  {
    name: "Hotel Nights",
    category: "travel",
    country: "UK",
    unit: "kgCO2e/room-night",
    factor: "10.400000",
    sourceLabel: CURRENT_UK_FACTOR_SOURCE,
    factorYear: CURRENT_UK_FACTOR_YEAR,
    version: 2,
    methodology: `Scope 3 UK hotel room per night; ${CURRENT_UK_FACTOR_SOURCE_URL}`,
  },
];

export async function seedCurrentEmissionFactors(): Promise<void> {
  const existing = await storage.getEmissionFactors("UK", CURRENT_UK_FACTOR_YEAR);
  const byName = new Map(existing.map((factor) => [factor.name, factor]));

  let created = 0;
  let updated = 0;
  for (const factor of UK_2026_EMISSION_FACTORS) {
    const current = byName.get(factor.name);
    if (!current) {
      await storage.createEmissionFactor(factor);
      created += 1;
      continue;
    }

    const needsUpdate =
      current.factor !== factor.factor
      || current.unit !== factor.unit
      || current.category !== factor.category
      || current.fuelType !== (factor.fuelType ?? null)
      || current.sourceLabel !== factor.sourceLabel
      || current.methodology !== factor.methodology;
    if (needsUpdate) {
      await storage.updateEmissionFactor(current.id, factor);
      updated += 1;
    }
  }

  console.log(
    `[seed-emission-factors] ${CURRENT_UK_FACTOR_SOURCE}: ${created} created, ${updated} updated`,
  );
}
