export const GUIDED_RAW_INPUT_DEFINITIONS = {
  electricity_kwh: { category: "environmental", unit: "kWh" },
  gas_kwh: { category: "environmental", unit: "kWh" },
  vehicle_fuel_litres: { category: "environmental", unit: "litres" },
  diesel_litres: { category: "environmental", unit: "litres" },
  petrol_litres: { category: "environmental", unit: "litres" },
  total_waste_tonnes: { category: "environmental", unit: "tonnes" },
  recycled_waste_tonnes: { category: "environmental", unit: "tonnes" },
  water_m3: { category: "environmental", unit: "m3" },
  domestic_flight_km: { category: "environmental", unit: "km" },
  short_haul_flight_km: { category: "environmental", unit: "km" },
  long_haul_flight_km: { category: "environmental", unit: "km" },
  rail_km: { category: "environmental", unit: "km" },
  hotel_nights: { category: "environmental", unit: "nights" },
  car_miles: { category: "environmental", unit: "miles" },
  employee_headcount: { category: "social", unit: "people" },
  employee_leavers: { category: "social", unit: "people" },
  absence_days: { category: "social", unit: "days" },
  total_working_days: { category: "social", unit: "days" },
  total_training_hours: { category: "social", unit: "hours" },
  female_managers: { category: "social", unit: "people" },
  total_managers: { category: "social", unit: "people" },
  living_wage_employees: { category: "social", unit: "people" },
  trained_staff: { category: "governance", unit: "people" },
  total_staff: { category: "governance", unit: "people" },
  signed_suppliers: { category: "governance", unit: "suppliers" },
  total_suppliers: { category: "governance", unit: "suppliers" },
} as const;

export type GuidedRawInputName = keyof typeof GUIDED_RAW_INPUT_DEFINITIONS;
export type GuidedRawInputCategory = (typeof GUIDED_RAW_INPUT_DEFINITIONS)[GuidedRawInputName]["category"];

export const GUIDED_RAW_INPUT_NAMES = Object.freeze(
  Object.keys(GUIDED_RAW_INPUT_DEFINITIONS) as GuidedRawInputName[],
);

export const GUIDED_RAW_INPUT_NAME_SET: ReadonlySet<string> = new Set(GUIDED_RAW_INPUT_NAMES);

// A request may address the complete supported catalogue, but cannot invent
// arbitrary readiness-bearing fields or submit an unbounded mutation.
export const MAX_GUIDED_RAW_INPUT_MUTATIONS = GUIDED_RAW_INPUT_NAMES.length;

export function isGuidedRawInputName(value: unknown): value is GuidedRawInputName {
  return typeof value === "string" && GUIDED_RAW_INPUT_NAME_SET.has(value);
}

export function guidedRawInputCategory(inputName: GuidedRawInputName): GuidedRawInputCategory {
  return GUIDED_RAW_INPUT_DEFINITIONS[inputName].category;
}
