import { db } from "./storage";
import { emissionFactors, type InsertEmissionFactor } from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
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

type EmissionFactorCatalogueRow = {
  name: string;
  category: string;
  country: string;
  unit: string;
  factor: string | number;
  sourceLabel?: string | null;
  factorYear?: number | null;
  version?: number | null;
  fuelType?: string | null;
  methodology?: string | null;
};

const EMISSION_FACTOR_SEED_LOCK = "simplyesg:seed:emission-factors";

function optionalValue(value: unknown): unknown {
  return value ?? null;
}

/**
 * Return deterministic, human-readable reasons that the calculator's current
 * UK catalogue is not safe to use. Extra non-canonical factors are allowed,
 * but every canonical factor must exist exactly once and match its provenance.
 */
export function emissionFactorCatalogueErrors(rows: EmissionFactorCatalogueRow[]): string[] {
  const errors: string[] = [];

  for (const expected of UK_2026_EMISSION_FACTORS) {
    const matches = rows.filter((row) =>
      row.country === expected.country
      && row.factorYear === expected.factorYear
      && row.name === expected.name,
    );
    if (matches.length !== 1) {
      errors.push(`${expected.name}: expected exactly one row, found ${matches.length}`);
      continue;
    }

    const actual = matches[0];
    const mismatchedFields = [
      ["category", actual.category, expected.category],
      ["unit", actual.unit, expected.unit],
      ["sourceLabel", optionalValue(actual.sourceLabel), optionalValue(expected.sourceLabel)],
      ["version", optionalValue(actual.version), optionalValue(expected.version)],
      ["fuelType", optionalValue(actual.fuelType), optionalValue(expected.fuelType)],
      ["methodology", optionalValue(actual.methodology), optionalValue(expected.methodology)],
    ].filter(([, actualValue, expectedValue]) => actualValue !== expectedValue)
      .map(([field]) => field);
    if (Number(actual.factor) !== Number(expected.factor)) {
      mismatchedFields.push("factor");
    }
    if (mismatchedFields.length > 0) {
      errors.push(`${expected.name}: mismatched ${mismatchedFields.join(", ")}`);
    }
  }

  return errors;
}

export function assertCurrentEmissionFactorCatalogue(rows: EmissionFactorCatalogueRow[]): void {
  const errors = emissionFactorCatalogueErrors(rows);
  if (errors.length > 0) {
    throw new Error(
      `Required ${CURRENT_UK_FACTOR_YEAR} UK emission-factor catalogue is invalid: ${errors.join("; ")}`,
    );
  }
}

export async function seedCurrentEmissionFactors(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${EMISSION_FACTOR_SEED_LOCK}, 0))`);

    for (const factor of UK_2026_EMISSION_FACTORS) {
      await tx.insert(emissionFactors)
        .values(factor)
        .onConflictDoUpdate({
          target: [emissionFactors.country, emissionFactors.factorYear, emissionFactors.name],
          set: {
            category: factor.category,
            unit: factor.unit,
            factor: factor.factor,
            sourceLabel: factor.sourceLabel ?? null,
            version: factor.version ?? 1,
            fuelType: factor.fuelType ?? null,
            methodology: factor.methodology ?? null,
          },
        });
    }

    const rows = await tx.select().from(emissionFactors).where(and(
      eq(emissionFactors.country, "UK"),
      eq(emissionFactors.factorYear, CURRENT_UK_FACTOR_YEAR),
      inArray(emissionFactors.name, UK_2026_EMISSION_FACTORS.map((factor) => factor.name)),
    ));
    assertCurrentEmissionFactorCatalogue(rows);
  });

  console.log(
    `[seed-emission-factors] ${CURRENT_UK_FACTOR_SOURCE}: ${UK_2026_EMISSION_FACTORS.length} canonical factors reconciled and validated`,
  );
}
