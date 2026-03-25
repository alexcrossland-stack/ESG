import type { EstimateConfidence } from "@shared/value-source";

export interface EstimateResult {
  metricKey: string;
  estimatedValue: number | null;
  unit: string;
  sourceType: "actual" | "estimated" | "missing";
  estimateMethod: string | null;
  estimateConfidence: EstimateConfidence | null;
  estimateBasisJson: Record<string, unknown> | null;
  methodologyNote: string;
  isClamped: boolean;
  sanityFlag: string | null;
  lastEstimatedAt: string | null;
}

export interface CompanyProfile {
  employeeCount?: number | null;
  floorAreaM2?: number | null;
  industry?: string | null;
  siteType?: string | null;
  country?: string | null;
  annualSpendElectricityGbp?: number | null;
  annualSpendGasGbp?: number | null;
  annualSpendTravelGbp?: number | null;
}

interface SectorBenchmark {
  electricityKwhPerEmployee: number;
  electricityKwhPerM2: number;
  gasKwhPerEmployee: number;
  waterM3PerEmployee: number;
  wasteKgPerEmployee: number;
  travelKmPerEmployee: number;
}

const SECTOR_BENCHMARKS: Record<string, SectorBenchmark> = {
  office: {
    electricityKwhPerEmployee: 3200,
    electricityKwhPerM2: 80,
    gasKwhPerEmployee: 2800,
    waterM3PerEmployee: 10,
    wasteKgPerEmployee: 120,
    travelKmPerEmployee: 1500,
  },
  retail: {
    electricityKwhPerEmployee: 4500,
    electricityKwhPerM2: 200,
    gasKwhPerEmployee: 1800,
    waterM3PerEmployee: 8,
    wasteKgPerEmployee: 200,
    travelKmPerEmployee: 800,
  },
  manufacturing: {
    electricityKwhPerEmployee: 12000,
    electricityKwhPerM2: 120,
    gasKwhPerEmployee: 14000,
    waterM3PerEmployee: 40,
    wasteKgPerEmployee: 600,
    travelKmPerEmployee: 1200,
  },
  warehouse: {
    electricityKwhPerEmployee: 5000,
    electricityKwhPerM2: 60,
    gasKwhPerEmployee: 3000,
    waterM3PerEmployee: 6,
    wasteKgPerEmployee: 250,
    travelKmPerEmployee: 2000,
  },
  data_centre: {
    electricityKwhPerEmployee: 40000,
    electricityKwhPerM2: 800,
    gasKwhPerEmployee: 1000,
    waterM3PerEmployee: 15,
    wasteKgPerEmployee: 100,
    travelKmPerEmployee: 2500,
  },
  hospitality: {
    electricityKwhPerEmployee: 5500,
    electricityKwhPerM2: 150,
    gasKwhPerEmployee: 6000,
    waterM3PerEmployee: 80,
    wasteKgPerEmployee: 400,
    travelKmPerEmployee: 500,
  },
  healthcare: {
    electricityKwhPerEmployee: 6000,
    electricityKwhPerM2: 180,
    gasKwhPerEmployee: 5000,
    waterM3PerEmployee: 50,
    wasteKgPerEmployee: 300,
    travelKmPerEmployee: 800,
  },
  default: {
    electricityKwhPerEmployee: 3500,
    electricityKwhPerM2: 90,
    gasKwhPerEmployee: 3000,
    waterM3PerEmployee: 12,
    wasteKgPerEmployee: 150,
    travelKmPerEmployee: 1200,
  },
};

const UK_ELECTRICITY_PRICE_PER_KWH = 0.28;
const UK_GAS_PRICE_PER_KWH = 0.07;
const ELECTRICITY_EMISSION_FACTOR_KG_CO2_PER_KWH = 0.207;
const GAS_EMISSION_FACTOR_KG_CO2_PER_KWH = 0.183;
const AVERAGE_FLIGHT_EMISSION_KG_CO2_PER_KM = 0.255;

const SANITY_RANGES: Record<string, { min: number; max: number }> = {
  electricity_kwh: { min: 0, max: 5_000_000 },
  electricity_kgco2e: { min: 0, max: 1_500_000 },
  gas_kwh: { min: 0, max: 3_000_000 },
  gas_kgco2e: { min: 0, max: 600_000 },
  water_m3: { min: 0, max: 500_000 },
  waste_kg: { min: 0, max: 1_000_000 },
  travel_km: { min: 0, max: 5_000_000 },
  travel_kgco2e: { min: 0, max: 1_000_000 },
};

function resolveBenchmark(profile: CompanyProfile): SectorBenchmark {
  const key = (profile.siteType || profile.industry || "").toLowerCase();
  for (const [sector, bench] of Object.entries(SECTOR_BENCHMARKS)) {
    if (key.includes(sector)) return bench;
  }
  return SECTOR_BENCHMARKS.default;
}

function clampAndFlag(
  value: number,
  key: keyof typeof SANITY_RANGES
): { value: number; isClamped: boolean; sanityFlag: string | null } {
  const range = SANITY_RANGES[key];
  if (!range) return { value, isClamped: false, sanityFlag: null };
  if (value < range.min) {
    return { value: range.min, isClamped: true, sanityFlag: `Value below plausible minimum for ${key}` };
  }
  if (value > range.max) {
    return { value: range.max, isClamped: true, sanityFlag: `Value exceeds plausible maximum for ${key} — clamped to ${range.max}` };
  }
  return { value, isClamped: false, sanityFlag: null };
}

function roundSensibly(value: number): number {
  if (value >= 1000) return Math.round(value);
  if (value >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

function nowIso(): string {
  return new Date().toISOString();
}

function missingResult(metricKey: string, unit: string, note: string): EstimateResult {
  return {
    metricKey,
    estimatedValue: null,
    unit,
    sourceType: "missing",
    estimateMethod: null,
    estimateConfidence: null,
    estimateBasisJson: null,
    methodologyNote: note,
    isClamped: false,
    sanityFlag: null,
    lastEstimatedAt: null,
  };
}

export function estimateElectricityKwh(
  profile: CompanyProfile,
  actualKwh?: number | null
): EstimateResult {
  const metricKey = "electricity_kwh";
  const unit = "kWh";

  if (actualKwh != null && actualKwh > 0) {
    return {
      metricKey,
      estimatedValue: roundSensibly(actualKwh),
      unit,
      sourceType: "actual",
      estimateMethod: null,
      estimateConfidence: null,
      estimateBasisJson: null,
      methodologyNote: "Actual electricity consumption provided.",
      isClamped: false,
      sanityFlag: null,
      lastEstimatedAt: null,
    };
  }

  if (profile.annualSpendElectricityGbp && profile.annualSpendElectricityGbp > 0) {
    const raw = profile.annualSpendElectricityGbp / UK_ELECTRICITY_PRICE_PER_KWH;
    const { value, isClamped, sanityFlag } = clampAndFlag(raw, metricKey);
    return {
      metricKey,
      estimatedValue: roundSensibly(value),
      unit,
      sourceType: "estimated",
      estimateMethod: "spend_proxy",
      estimateConfidence: "medium",
      estimateBasisJson: {
        annualSpendGbp: profile.annualSpendElectricityGbp,
        pricePerKwh: UK_ELECTRICITY_PRICE_PER_KWH,
      },
      methodologyNote: `Estimated from annual electricity spend (£${profile.annualSpendElectricityGbp}) ÷ UK average unit price (${UK_ELECTRICITY_PRICE_PER_KWH} £/kWh).`,
      isClamped,
      sanityFlag,
      lastEstimatedAt: nowIso(),
    };
  }

  const bench = resolveBenchmark(profile);

  if (profile.floorAreaM2 && profile.floorAreaM2 > 0) {
    const raw = bench.electricityKwhPerM2 * profile.floorAreaM2;
    const { value, isClamped, sanityFlag } = clampAndFlag(raw, metricKey);
    return {
      metricKey,
      estimatedValue: roundSensibly(value),
      unit,
      sourceType: "estimated",
      estimateMethod: "floor_area_benchmark",
      estimateConfidence: "medium",
      estimateBasisJson: {
        floorAreaM2: profile.floorAreaM2,
        kwhPerM2: bench.electricityKwhPerM2,
        sector: profile.siteType || profile.industry || "default",
      },
      methodologyNote: `Estimated from floor area (${profile.floorAreaM2} m²) × sector benchmark (${bench.electricityKwhPerM2} kWh/m²).`,
      isClamped,
      sanityFlag,
      lastEstimatedAt: nowIso(),
    };
  }

  if (profile.employeeCount && profile.employeeCount > 0) {
    const raw = bench.electricityKwhPerEmployee * profile.employeeCount;
    const { value, isClamped, sanityFlag } = clampAndFlag(raw, metricKey);
    return {
      metricKey,
      estimatedValue: roundSensibly(value),
      unit,
      sourceType: "estimated",
      estimateMethod: "employee_count_benchmark",
      estimateConfidence: "low",
      estimateBasisJson: {
        employeeCount: profile.employeeCount,
        kwhPerEmployee: bench.electricityKwhPerEmployee,
        sector: profile.siteType || profile.industry || "default",
      },
      methodologyNote: `Estimated from headcount (${profile.employeeCount}) × sector benchmark (${bench.electricityKwhPerEmployee} kWh/employee). Replace with actual meter data when available.`,
      isClamped,
      sanityFlag,
      lastEstimatedAt: nowIso(),
    };
  }

  return missingResult(metricKey, unit, "Insufficient profile data to estimate electricity use. Provide employee count, floor area, or spend.");
}

export function estimateElectricityEmissions(
  profile: CompanyProfile,
  actualKwh?: number | null
): EstimateResult {
  const metricKey = "electricity_kgco2e";
  const unit = "kgCO2e";
  const kwhResult = estimateElectricityKwh(profile, actualKwh);

  if (kwhResult.estimatedValue == null) {
    return missingResult(metricKey, unit, "Cannot estimate electricity emissions without electricity consumption estimate.");
  }

  const raw = kwhResult.estimatedValue * ELECTRICITY_EMISSION_FACTOR_KG_CO2_PER_KWH;
  const { value, isClamped, sanityFlag } = clampAndFlag(raw, metricKey);

  return {
    metricKey,
    estimatedValue: roundSensibly(value),
    unit,
    sourceType: kwhResult.sourceType,
    estimateMethod: kwhResult.estimateMethod,
    estimateConfidence: kwhResult.estimateConfidence,
    estimateBasisJson: {
      ...(kwhResult.estimateBasisJson ?? {}),
      emissionFactorKgCo2ePerKwh: ELECTRICITY_EMISSION_FACTOR_KG_CO2_PER_KWH,
      source: "UK DEFRA 2024",
    },
    methodologyNote: `${kwhResult.methodologyNote} Emissions calculated using UK DEFRA 2024 grid emission factor (${ELECTRICITY_EMISSION_FACTOR_KG_CO2_PER_KWH} kgCO2e/kWh).`,
    isClamped,
    sanityFlag,
    lastEstimatedAt: nowIso(),
  };
}

export function estimateGasKwh(
  profile: CompanyProfile,
  actualKwh?: number | null
): EstimateResult {
  const metricKey = "gas_kwh";
  const unit = "kWh";

  if (actualKwh != null && actualKwh > 0) {
    return {
      metricKey,
      estimatedValue: roundSensibly(actualKwh),
      unit,
      sourceType: "actual",
      estimateMethod: null,
      estimateConfidence: null,
      estimateBasisJson: null,
      methodologyNote: "Actual gas consumption provided.",
      isClamped: false,
      sanityFlag: null,
      lastEstimatedAt: null,
    };
  }

  if (profile.annualSpendGasGbp && profile.annualSpendGasGbp > 0) {
    const raw = profile.annualSpendGasGbp / UK_GAS_PRICE_PER_KWH;
    const { value, isClamped, sanityFlag } = clampAndFlag(raw, metricKey);
    return {
      metricKey,
      estimatedValue: roundSensibly(value),
      unit,
      sourceType: "estimated",
      estimateMethod: "spend_proxy",
      estimateConfidence: "medium",
      estimateBasisJson: {
        annualSpendGbp: profile.annualSpendGasGbp,
        pricePerKwh: UK_GAS_PRICE_PER_KWH,
      },
      methodologyNote: `Estimated from annual gas spend (£${profile.annualSpendGasGbp}) ÷ UK average unit price (${UK_GAS_PRICE_PER_KWH} £/kWh).`,
      isClamped,
      sanityFlag,
      lastEstimatedAt: nowIso(),
    };
  }

  const bench = resolveBenchmark(profile);

  if (profile.floorAreaM2 && profile.floorAreaM2 > 0) {
    const gasKwhPerM2 = bench.gasKwhPerEmployee / 12;
    const raw = gasKwhPerM2 * profile.floorAreaM2;
    const { value, isClamped, sanityFlag } = clampAndFlag(raw, metricKey);
    return {
      metricKey,
      estimatedValue: roundSensibly(value),
      unit,
      sourceType: "estimated",
      estimateMethod: "floor_area_benchmark",
      estimateConfidence: "medium",
      estimateBasisJson: {
        floorAreaM2: profile.floorAreaM2,
        kwhPerM2: gasKwhPerM2,
        sector: profile.siteType || profile.industry || "default",
      },
      methodologyNote: `Estimated from floor area (${profile.floorAreaM2} m²) × sector benchmark (${gasKwhPerM2.toFixed(1)} kWh/m²).`,
      isClamped,
      sanityFlag,
      lastEstimatedAt: nowIso(),
    };
  }

  if (profile.employeeCount && profile.employeeCount > 0) {
    const raw = bench.gasKwhPerEmployee * profile.employeeCount;
    const { value, isClamped, sanityFlag } = clampAndFlag(raw, metricKey);
    return {
      metricKey,
      estimatedValue: roundSensibly(value),
      unit,
      sourceType: "estimated",
      estimateMethod: "employee_count_benchmark",
      estimateConfidence: "low",
      estimateBasisJson: {
        employeeCount: profile.employeeCount,
        kwhPerEmployee: bench.gasKwhPerEmployee,
        sector: profile.siteType || profile.industry || "default",
      },
      methodologyNote: `Estimated from headcount (${profile.employeeCount}) × sector benchmark (${bench.gasKwhPerEmployee} kWh/employee). Replace with actual gas meter data when available.`,
      isClamped,
      sanityFlag,
      lastEstimatedAt: nowIso(),
    };
  }

  return missingResult(metricKey, unit, "Insufficient profile data to estimate gas use. Provide employee count, floor area, or annual gas spend.");
}

export function estimateGasEmissions(
  profile: CompanyProfile,
  actualKwh?: number | null
): EstimateResult {
  const metricKey = "gas_kgco2e";
  const unit = "kgCO2e";
  const kwhResult = estimateGasKwh(profile, actualKwh);

  if (kwhResult.estimatedValue == null) {
    return missingResult(metricKey, unit, "Cannot estimate gas emissions without gas consumption estimate.");
  }

  const raw = kwhResult.estimatedValue * GAS_EMISSION_FACTOR_KG_CO2_PER_KWH;
  const { value, isClamped, sanityFlag } = clampAndFlag(raw, metricKey);

  return {
    metricKey,
    estimatedValue: roundSensibly(value),
    unit,
    sourceType: kwhResult.sourceType,
    estimateMethod: kwhResult.estimateMethod,
    estimateConfidence: kwhResult.estimateConfidence,
    estimateBasisJson: {
      ...(kwhResult.estimateBasisJson ?? {}),
      emissionFactorKgCo2ePerKwh: GAS_EMISSION_FACTOR_KG_CO2_PER_KWH,
      source: "UK DEFRA 2024",
    },
    methodologyNote: `${kwhResult.methodologyNote} Emissions calculated using UK DEFRA 2024 natural gas factor (${GAS_EMISSION_FACTOR_KG_CO2_PER_KWH} kgCO2e/kWh).`,
    isClamped,
    sanityFlag,
    lastEstimatedAt: nowIso(),
  };
}

export function estimateWater(
  profile: CompanyProfile,
  actualM3?: number | null
): EstimateResult {
  const metricKey = "water_m3";
  const unit = "m³";

  if (actualM3 != null && actualM3 > 0) {
    return {
      metricKey,
      estimatedValue: roundSensibly(actualM3),
      unit,
      sourceType: "actual",
      estimateMethod: null,
      estimateConfidence: null,
      estimateBasisJson: null,
      methodologyNote: "Actual water consumption provided.",
      isClamped: false,
      sanityFlag: null,
      lastEstimatedAt: null,
    };
  }

  const bench = resolveBenchmark(profile);

  if (profile.floorAreaM2 && profile.floorAreaM2 > 0) {
    const waterM3PerM2 = bench.waterM3PerEmployee / 15;
    const raw = waterM3PerM2 * profile.floorAreaM2;
    const { value, isClamped, sanityFlag } = clampAndFlag(raw, metricKey);
    return {
      metricKey,
      estimatedValue: roundSensibly(value),
      unit,
      sourceType: "estimated",
      estimateMethod: "floor_area_benchmark",
      estimateConfidence: "medium",
      estimateBasisJson: {
        floorAreaM2: profile.floorAreaM2,
        m3PerM2: waterM3PerM2,
        sector: profile.siteType || profile.industry || "default",
      },
      methodologyNote: `Estimated from floor area (${profile.floorAreaM2} m²) × sector benchmark (${waterM3PerM2.toFixed(2)} m³/m²).`,
      isClamped,
      sanityFlag,
      lastEstimatedAt: nowIso(),
    };
  }

  if (profile.employeeCount && profile.employeeCount > 0) {
    const raw = bench.waterM3PerEmployee * profile.employeeCount;
    const { value, isClamped, sanityFlag } = clampAndFlag(raw, metricKey);
    return {
      metricKey,
      estimatedValue: roundSensibly(value),
      unit,
      sourceType: "estimated",
      estimateMethod: "employee_count_benchmark",
      estimateConfidence: "low",
      estimateBasisJson: {
        employeeCount: profile.employeeCount,
        m3PerEmployee: bench.waterM3PerEmployee,
        sector: profile.siteType || profile.industry || "default",
      },
      methodologyNote: `Estimated from headcount (${profile.employeeCount}) × sector benchmark (${bench.waterM3PerEmployee} m³/employee). Replace with actual meter data when available.`,
      isClamped,
      sanityFlag,
      lastEstimatedAt: nowIso(),
    };
  }

  return missingResult(metricKey, unit, "Insufficient profile data to estimate water use. Provide employee count or floor area.");
}

export function estimateWaste(
  profile: CompanyProfile,
  actualKg?: number | null
): EstimateResult {
  const metricKey = "waste_kg";
  const unit = "kg";

  if (actualKg != null && actualKg > 0) {
    return {
      metricKey,
      estimatedValue: roundSensibly(actualKg),
      unit,
      sourceType: "actual",
      estimateMethod: null,
      estimateConfidence: null,
      estimateBasisJson: null,
      methodologyNote: "Actual waste generation provided.",
      isClamped: false,
      sanityFlag: null,
      lastEstimatedAt: null,
    };
  }

  const bench = resolveBenchmark(profile);

  if (profile.floorAreaM2 && profile.floorAreaM2 > 0) {
    const wasteKgPerM2 = bench.wasteKgPerEmployee / 10;
    const raw = wasteKgPerM2 * profile.floorAreaM2;
    const { value, isClamped, sanityFlag } = clampAndFlag(raw, metricKey);
    return {
      metricKey,
      estimatedValue: roundSensibly(value),
      unit,
      sourceType: "estimated",
      estimateMethod: "floor_area_benchmark",
      estimateConfidence: "medium",
      estimateBasisJson: {
        floorAreaM2: profile.floorAreaM2,
        kgPerM2: wasteKgPerM2,
        sector: profile.siteType || profile.industry || "default",
      },
      methodologyNote: `Estimated from floor area (${profile.floorAreaM2} m²) × sector benchmark (${wasteKgPerM2.toFixed(1)} kg/m² per year).`,
      isClamped,
      sanityFlag,
      lastEstimatedAt: nowIso(),
    };
  }

  if (profile.employeeCount && profile.employeeCount > 0) {
    const raw = bench.wasteKgPerEmployee * profile.employeeCount;
    const { value, isClamped, sanityFlag } = clampAndFlag(raw, metricKey);
    return {
      metricKey,
      estimatedValue: roundSensibly(value),
      unit,
      sourceType: "estimated",
      estimateMethod: "employee_count_benchmark",
      estimateConfidence: "low",
      estimateBasisJson: {
        employeeCount: profile.employeeCount,
        kgPerEmployee: bench.wasteKgPerEmployee,
        sector: profile.siteType || profile.industry || "default",
      },
      methodologyNote: `Estimated from headcount (${profile.employeeCount}) × sector benchmark (${bench.wasteKgPerEmployee} kg/employee per year). Replace with actual waste records when available.`,
      isClamped,
      sanityFlag,
      lastEstimatedAt: nowIso(),
    };
  }

  return missingResult(metricKey, unit, "Insufficient profile data to estimate waste generation. Provide employee count or floor area.");
}

export function estimateBusinessTravel(
  profile: CompanyProfile,
  actualKm?: number | null
): EstimateResult {
  const metricKey = "travel_km";
  const unit = "km";

  if (actualKm != null && actualKm > 0) {
    return {
      metricKey,
      estimatedValue: roundSensibly(actualKm),
      unit,
      sourceType: "actual",
      estimateMethod: null,
      estimateConfidence: null,
      estimateBasisJson: null,
      methodologyNote: "Actual business travel distance provided.",
      isClamped: false,
      sanityFlag: null,
      lastEstimatedAt: null,
    };
  }

  if (profile.annualSpendTravelGbp && profile.annualSpendTravelGbp > 0) {
    const costPerKm = 0.15;
    const raw = profile.annualSpendTravelGbp / costPerKm;
    const { value, isClamped, sanityFlag } = clampAndFlag(raw, metricKey);
    return {
      metricKey,
      estimatedValue: roundSensibly(value),
      unit,
      sourceType: "estimated",
      estimateMethod: "spend_proxy",
      estimateConfidence: "medium",
      estimateBasisJson: {
        annualSpendGbp: profile.annualSpendTravelGbp,
        costPerKm,
      },
      methodologyNote: `Estimated from annual travel spend (£${profile.annualSpendTravelGbp}) ÷ blended cost proxy (£${costPerKm}/km).`,
      isClamped,
      sanityFlag,
      lastEstimatedAt: nowIso(),
    };
  }

  const bench = resolveBenchmark(profile);

  if (profile.employeeCount && profile.employeeCount > 0) {
    const raw = bench.travelKmPerEmployee * profile.employeeCount;
    const { value, isClamped, sanityFlag } = clampAndFlag(raw, metricKey);
    return {
      metricKey,
      estimatedValue: roundSensibly(value),
      unit,
      sourceType: "estimated",
      estimateMethod: "employee_count_benchmark",
      estimateConfidence: "low",
      estimateBasisJson: {
        employeeCount: profile.employeeCount,
        kmPerEmployee: bench.travelKmPerEmployee,
        sector: profile.siteType || profile.industry || "default",
      },
      methodologyNote: `Estimated from headcount (${profile.employeeCount}) × sector benchmark (${bench.travelKmPerEmployee} km/employee per year). Replace with actual travel records when available.`,
      isClamped,
      sanityFlag,
      lastEstimatedAt: nowIso(),
    };
  }

  return missingResult(metricKey, unit, "Insufficient profile data to estimate business travel. Provide employee count or travel spend.");
}

export function estimateBusinessTravelEmissions(
  profile: CompanyProfile,
  actualKm?: number | null
): EstimateResult {
  const metricKey = "travel_kgco2e";
  const unit = "kgCO2e";
  const kmResult = estimateBusinessTravel(profile, actualKm);

  if (kmResult.estimatedValue == null) {
    return missingResult(metricKey, unit, "Cannot estimate travel emissions without travel distance estimate.");
  }

  const raw = kmResult.estimatedValue * AVERAGE_FLIGHT_EMISSION_KG_CO2_PER_KM;
  const { value, isClamped, sanityFlag } = clampAndFlag(raw, metricKey);

  return {
    metricKey,
    estimatedValue: roundSensibly(value),
    unit,
    sourceType: kmResult.sourceType,
    estimateMethod: kmResult.estimateMethod,
    estimateConfidence: kmResult.estimateConfidence,
    estimateBasisJson: {
      ...(kmResult.estimateBasisJson ?? {}),
      emissionFactorKgCo2ePerKm: AVERAGE_FLIGHT_EMISSION_KG_CO2_PER_KM,
      source: "UK DEFRA 2024 (average passenger flight)",
    },
    methodologyNote: `${kmResult.methodologyNote} Emissions calculated using a blended UK DEFRA 2024 average travel factor (${AVERAGE_FLIGHT_EMISSION_KG_CO2_PER_KM} kgCO2e/km).`,
    isClamped,
    sanityFlag,
    lastEstimatedAt: nowIso(),
  };
}

export function runEstimationEngine(
  profile: CompanyProfile,
  actuals?: {
    electricityKwh?: number | null;
    gasKwh?: number | null;
    waterM3?: number | null;
    wasteKg?: number | null;
    travelKm?: number | null;
  }
): EstimateResult[] {
  return [
    estimateElectricityKwh(profile, actuals?.electricityKwh),
    estimateElectricityEmissions(profile, actuals?.electricityKwh),
    estimateGasKwh(profile, actuals?.gasKwh),
    estimateGasEmissions(profile, actuals?.gasKwh),
    estimateWater(profile, actuals?.waterM3),
    estimateWaste(profile, actuals?.wasteKg),
    estimateBusinessTravel(profile, actuals?.travelKm),
    estimateBusinessTravelEmissions(profile, actuals?.travelKm),
  ];
}
