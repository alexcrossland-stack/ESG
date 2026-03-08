export interface EmissionFactorMap {
  electricity?: number;
  naturalGas?: number;
  diesel?: number;
  petrol?: number;
  companyCar?: number;
  domesticFlight?: number;
  shortHaulFlight?: number;
  longHaulFlight?: number;
  rail?: number;
  hotelNight?: number;
}

export function calculateScope1(gasKwh: number, vehicleFuelLitres: number, factors: EmissionFactorMap): number {
  const gasFactor = factors.naturalGas || 0.18293;
  const fuelFactor = factors.diesel || 2.70559;
  return (gasKwh * gasFactor + vehicleFuelLitres * fuelFactor) / 1000;
}

export function calculateScope2(electricityKwh: number, factors: EmissionFactorMap): number {
  const factor = factors.electricity || 0.20707;
  return (electricityKwh * factor) / 1000;
}

export function calculateRecyclingRate(recycledWaste: number, totalWaste: number): number | null {
  if (totalWaste <= 0) return null;
  return Math.round((recycledWaste / totalWaste) * 10000) / 100;
}

export function calculateBusinessTravelEmissions(
  travelData: {
    domesticFlightKm?: number;
    shortHaulFlightKm?: number;
    longHaulFlightKm?: number;
    railKm?: number;
    hotelNights?: number;
    carMiles?: number;
  },
  factors: EmissionFactorMap
): number {
  let total = 0;
  if (travelData.domesticFlightKm) total += travelData.domesticFlightKm * (factors.domesticFlight || 0.24587);
  if (travelData.shortHaulFlightKm) total += travelData.shortHaulFlightKm * (factors.shortHaulFlight || 0.15353);
  if (travelData.longHaulFlightKm) total += travelData.longHaulFlightKm * (factors.longHaulFlight || 0.19309);
  if (travelData.railKm) total += travelData.railKm * (factors.rail || 0.03549);
  if (travelData.hotelNights) total += travelData.hotelNights * (factors.hotelNight || 10.24);
  if (travelData.carMiles) total += travelData.carMiles * (factors.companyCar || 0.27436);
  return total / 1000;
}

export function calculateTurnoverRate(leavers: number, avgHeadcount: number): number | null {
  if (avgHeadcount <= 0) return null;
  return Math.round((leavers / avgHeadcount) * 10000) / 100;
}

export function calculateAbsenceRate(absenceDays: number, totalWorkingDays: number): number | null {
  if (totalWorkingDays <= 0) return null;
  return Math.round((absenceDays / totalWorkingDays) * 10000) / 100;
}

export function calculateTrainingHoursPerEmployee(totalHours: number, totalEmployees: number): number | null {
  if (totalEmployees <= 0) return null;
  return Math.round((totalHours / totalEmployees) * 100) / 100;
}

export function calculateDataPrivacyCompletion(trainedStaff: number, totalStaff: number): number | null {
  if (totalStaff <= 0) return null;
  return Math.round((trainedStaff / totalStaff) * 10000) / 100;
}

export function calculateSupplierCodeAdoption(signedSuppliers: number, totalSuppliers: number): number | null {
  if (totalSuppliers <= 0) return null;
  return Math.round((signedSuppliers / totalSuppliers) * 10000) / 100;
}

export function calculateLivingWageCoverage(livingWageEmployees: number, totalEmployees: number): number | null {
  if (totalEmployees <= 0) return null;
  return Math.round((livingWageEmployees / totalEmployees) * 10000) / 100;
}

export function calculateCarbonIntensity(
  scope1: number, scope2: number, travelEmissions: number,
  mode: "per_revenue" | "per_employee", divisor: number
): number | null {
  if (divisor <= 0) return null;
  const totalEmissions = scope1 + scope2 + travelEmissions;
  if (mode === "per_revenue") {
    return Math.round((totalEmissions / (divisor / 1000000)) * 100) / 100;
  }
  return Math.round((totalEmissions / divisor) * 100) / 100;
}

export function calculateManagementGenderDiversity(femaleManagers: number, totalManagers: number): number | null {
  if (totalManagers <= 0) return null;
  return Math.round((femaleManagers / totalManagers) * 10000) / 100;
}

export type TrafficLightStatus = "green" | "amber" | "red";

export function getTrafficLightStatus(
  value: number | null,
  target: number | null,
  direction: string,
  amberThreshold: number = 5,
  redThreshold: number = 15,
  targetMin?: number | null,
  targetMax?: number | null,
  previousValue?: number | null
): TrafficLightStatus {
  if (value === null || value === undefined) return "red";

  if (direction === "compliance_yes_no") {
    return value >= 1 ? "green" : "red";
  }

  if (direction === "target_range") {
    const min = targetMin ?? (target ? target * 0.8 : 0);
    const max = targetMax ?? (target ? target * 1.2 : Infinity);
    if (value >= min && value <= max) return "green";
    const distBelow = min - value;
    const distAbove = value - max;
    const maxDist = Math.max(distBelow, distAbove, 0);
    const rangeSize = max - min || 1;
    const pctOff = (maxDist / rangeSize) * 100;
    if (pctOff <= amberThreshold) return "amber";
    return "red";
  }

  if (target === null || target === undefined) {
    if (previousValue === null || previousValue === undefined) return "amber";
    if (direction === "higher_is_better") {
      return value >= previousValue ? "green" : value >= previousValue * 0.95 ? "amber" : "red";
    }
    return value <= previousValue ? "green" : value <= previousValue * 1.05 ? "amber" : "red";
  }

  if (direction === "higher_is_better") {
    if (value >= target) return "green";
    const pctBelow = ((target - value) / target) * 100;
    if (pctBelow <= amberThreshold) return "amber";
    return "red";
  }

  if (direction === "lower_is_better") {
    if (value <= target) return "green";
    const pctAbove = target > 0 ? ((value - target) / target) * 100 : 100;
    if (pctAbove <= amberThreshold) return "amber";
    return "red";
  }

  return "amber";
}

export function calculatePercentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 10000) / 100;
}

export interface RawInputs {
  [key: string]: number | undefined;
}

export function runCalculationsForPeriod(
  rawInputs: RawInputs,
  factors: EmissionFactorMap,
  existingMetricValues: Record<string, number | null>
): Record<string, number | null> {
  const results: Record<string, number | null> = {};

  const elecKwh = rawInputs.electricity_kwh ?? 0;
  const gasKwh = rawInputs.gas_kwh ?? 0;
  const vehicleFuelLitres = rawInputs.vehicle_fuel_litres ?? 0;
  const totalWaste = rawInputs.total_waste_tonnes ?? 0;
  const recycledWaste = rawInputs.recycled_waste_tonnes ?? 0;
  const headcount = rawInputs.employee_headcount ?? 0;
  const leavers = rawInputs.employee_leavers ?? 0;
  const absenceDays = rawInputs.absence_days ?? 0;
  const workingDays = rawInputs.total_working_days ?? 0;
  const trainedStaff = rawInputs.trained_staff ?? 0;
  const totalStaff = rawInputs.total_staff ?? headcount;
  const signedSuppliers = rawInputs.signed_suppliers ?? 0;
  const totalSuppliers = rawInputs.total_suppliers ?? 0;
  const livingWageEmployees = rawInputs.living_wage_employees ?? 0;
  const femaleManagers = rawInputs.female_managers ?? 0;
  const totalManagers = rawInputs.total_managers ?? 0;
  const annualRevenue = rawInputs.annual_revenue ?? 0;
  const trainingHours = rawInputs.total_training_hours ?? 0;

  const scope1 = calculateScope1(gasKwh, vehicleFuelLitres, factors);
  results["Scope 1 Emissions"] = scope1;

  const scope2 = calculateScope2(elecKwh, factors);
  results["Scope 2 Emissions"] = scope2;

  results["Recycling Rate"] = calculateRecyclingRate(recycledWaste, totalWaste);

  const travelEmissions = calculateBusinessTravelEmissions({
    domesticFlightKm: rawInputs.domestic_flight_km,
    shortHaulFlightKm: rawInputs.short_haul_flight_km,
    longHaulFlightKm: rawInputs.long_haul_flight_km,
    railKm: rawInputs.rail_km,
    hotelNights: rawInputs.hotel_nights,
    carMiles: rawInputs.car_miles,
  }, factors);
  results["Business Travel Emissions"] = travelEmissions;

  results["Employee Turnover Rate"] = calculateTurnoverRate(leavers, headcount);
  results["Absence Rate"] = calculateAbsenceRate(absenceDays, workingDays);
  results["Training Hours per Employee"] = calculateTrainingHoursPerEmployee(trainingHours, headcount);
  results["Data Privacy Training Completion"] = calculateDataPrivacyCompletion(trainedStaff, totalStaff);
  results["Supplier Code of Conduct Adoption"] = calculateSupplierCodeAdoption(signedSuppliers, totalSuppliers);
  results["Living Wage Coverage"] = calculateLivingWageCoverage(livingWageEmployees, headcount);
  results["Management Gender Diversity"] = calculateManagementGenderDiversity(femaleManagers, totalManagers);

  const s1 = scope1 !== null && scope1 !== undefined ? scope1 : (existingMetricValues["Scope 1 Emissions"] ?? 0);
  const s2 = scope2 !== null && scope2 !== undefined ? scope2 : (existingMetricValues["Scope 2 Emissions"] ?? 0);
  const travel = travelEmissions !== null && travelEmissions !== undefined ? travelEmissions : (existingMetricValues["Business Travel Emissions"] ?? 0);
  if (headcount > 0) {
    results["Carbon Intensity"] = calculateCarbonIntensity(s1, s2, travel, "per_employee", headcount);
  } else if (annualRevenue > 0) {
    results["Carbon Intensity"] = calculateCarbonIntensity(s1, s2, travel, "per_revenue", annualRevenue);
  }

  return results;
}
