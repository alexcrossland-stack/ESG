export interface BenchmarkDefinition {
  metricKey: string;
  label: string;
  unit: string;
  rangeLow: number;
  rangeMedian: number;
  rangeHigh: number;
  source: string;
  notes?: string;
  direction: "lower_is_better" | "higher_is_better";
}

export const SME_BENCHMARKS: BenchmarkDefinition[] = [
  {
    metricKey: "energy_intensity",
    label: "Energy Intensity",
    unit: "kWh/employee",
    rangeLow: 3000,
    rangeMedian: 5500,
    rangeHigh: 9000,
    source: "Suggested SME reference range based on UK commercial energy consumption data",
    notes: "Varies significantly by sector; office-based businesses typically at the lower end",
    direction: "lower_is_better",
  },
  {
    metricKey: "carbon_intensity",
    label: "Carbon Intensity",
    unit: "tCO2e/employee",
    rangeLow: 1.5,
    rangeMedian: 3.2,
    rangeHigh: 6.0,
    source: "Internal benchmark guidance derived from DEFRA emission factor modelling",
    notes: "Scope 1 and 2 only; Scope 3 inclusion would increase these ranges",
    direction: "lower_is_better",
  },
  {
    metricKey: "waste_recycling_rate",
    label: "Waste Recycling Rate",
    unit: "%",
    rangeLow: 30,
    rangeMedian: 55,
    rangeHigh: 80,
    source: "Suggested SME reference range",
    notes: "UK average recycling rate for commercial waste is approximately 50-55%",
    direction: "higher_is_better",
  },
  {
    metricKey: "absence_rate",
    label: "Staff Absence Rate",
    unit: "%",
    rangeLow: 1.5,
    rangeMedian: 3.5,
    rangeHigh: 6.0,
    source: "Internal benchmark guidance aligned with CIPD absence management survey patterns",
    notes: "Sector and company size significantly affect these ranges",
    direction: "lower_is_better",
  },
  {
    metricKey: "training_hours",
    label: "Training Hours per Employee",
    unit: "hours/employee",
    rangeLow: 8,
    rangeMedian: 20,
    rangeHigh: 40,
    source: "Suggested SME reference range",
    notes: "Includes formal and informal training; sector-dependent",
    direction: "higher_is_better",
  },
  {
    metricKey: "gender_diversity",
    label: "Gender Diversity in Management",
    unit: "%",
    rangeLow: 20,
    rangeMedian: 35,
    rangeHigh: 50,
    source: "Internal benchmark guidance",
    notes: "Percentage of women in management positions; varies by sector",
    direction: "higher_is_better",
  },
  {
    metricKey: "living_wage",
    label: "Living Wage Compliance",
    unit: "%",
    rangeLow: 70,
    rangeMedian: 90,
    rangeHigh: 100,
    source: "Suggested SME reference range",
    notes: "Percentage of employees receiving at least the real Living Wage",
    direction: "higher_is_better",
  },
];

export function compareAgainstBenchmarks(
  companyMetrics: { metricKey: string; value: number }[],
  benchmarks: BenchmarkDefinition[] = SME_BENCHMARKS
): {
  metricKey: string;
  label: string;
  unit: string;
  companyValue: number;
  rangeLow: number;
  rangeMedian: number;
  rangeHigh: number;
  rating: "below_range" | "within_range" | "above_range";
  source: string;
}[] {
  return companyMetrics
    .map(cm => {
      const benchmark = benchmarks.find(b => b.metricKey === cm.metricKey);
      if (!benchmark) return null;

      let rating: "below_range" | "within_range" | "above_range";
      if (cm.value < benchmark.rangeLow) {
        rating = "below_range";
      } else if (cm.value > benchmark.rangeHigh) {
        rating = "above_range";
      } else {
        rating = "within_range";
      }

      return {
        metricKey: benchmark.metricKey,
        label: benchmark.label,
        unit: benchmark.unit,
        companyValue: cm.value,
        rangeLow: benchmark.rangeLow,
        rangeMedian: benchmark.rangeMedian,
        rangeHigh: benchmark.rangeHigh,
        rating,
        source: benchmark.source,
      };
    })
    .filter(Boolean) as any[];
}
