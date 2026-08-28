import { emissionFactorYearFromSet } from "@shared/emission-factor-metadata";
import type { EmissionFactorMap } from "./calculations";
import { storage } from "./storage";

export function buildEmissionFactorMap(dbFactors: any[]): EmissionFactorMap {
  const map: EmissionFactorMap = {};
  for (const factor of dbFactors) {
    const value = Number.parseFloat(factor.factor);
    if (!Number.isFinite(value)) continue;
    const category = String(factor.category || "").toLowerCase();
    const name = String(factor.name || "").toLowerCase();
    const fuelType = String(factor.fuelType || "").toLowerCase();
    switch (category) {
      case "electricity": map.electricity = value; break;
      case "gas": map.naturalGas = value; break;
      case "fuel":
        if (fuelType === "diesel" || name.includes("diesel")) map.diesel = value;
        else if (fuelType === "petrol" || name.includes("petrol")) map.petrol = value;
        break;
      case "vehicles":
        if (!fuelType || fuelType === "mixed" || fuelType === "average" || name.includes("average")) {
          map.companyCar = value;
        }
        break;
      case "travel":
        if (name.includes("domestic")) map.domesticFlight = value;
        else if (name.includes("short")) map.shortHaulFlight = value;
        else if (name.includes("long")) map.longHaulFlight = value;
        else if (name.includes("rail")) map.rail = value;
        else if (name.includes("hotel")) map.hotelNight = value;
        break;
    }
  }
  return map;
}

export async function getConfiguredEmissionFactors(companyId: string, country = "UK") {
  const settings = await storage.getCompanySettings(companyId);
  const configuredYear = emissionFactorYearFromSet(settings?.emissionFactorSet);
  const configured = await storage.getEmissionFactors(country, configuredYear);
  if (configured.length > 0) return configured;
  return storage.getEmissionFactors(country);
}
