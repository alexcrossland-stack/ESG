type RawSource = { inputName: string; value: string | number | null; siteId?: string | null; period?: string; dataSourceType?: string | null; workflowStatus?: string | null };
const SOURCES = [
  { inputName: "electricity_kwh", field: "electricity", label: "Electricity", unit: "kWh" },
  { inputName: "gas_kwh", field: "gas", label: "Gas", unit: "kWh" },
] as const;

// Exact raw-input contracts only. Vehicle fuel, employees and similarly named
// metrics are intentionally not guessed or combined across site boundaries.
export function compatibleCarbonSources(rows: RawSource[], period: string, siteId: string | null) {
  return SOURCES.flatMap(source => {
    const matches = rows.filter(row => row.inputName === source.inputName && row.period === period && (row.siteId ?? null) === siteId && !["rejected", "archived"].includes(row.workflowStatus || ""));
    if (matches.length !== 1) return [];
    const row = matches[0];
    if (row.value === null || String(row.value).trim() === "" || !Number.isFinite(Number(row.value)) || Number(row.value) < 0) return [];
    return [{ ...source, value: String(row.value), quality: row.dataSourceType === "estimated" ? "estimated" as const : "actual" as const }];
  });
}

type RecordedMetric = { id: string; name: string; unit?: string | null; frequency?: string | null; metricType?: string | null };
type RecordedValue = Omit<RawSource, "inputName"> & { metricId: string };

// These exact canonical metric names/units are established input contracts.
// In particular, "Gas / Fuel Consumption" is not necessarily natural gas.
// Never guess from partial names or combine multiple records into an estimate.
export function compatibleCarbonMetricSources(metrics: RecordedMetric[], values: RecordedValue[], period: string, siteId: string | null) {
  const contracts = [
    { name: "Electricity Consumption", inputName: "electricity_kwh" },
    { name: "Natural Gas Consumption", inputName: "gas_kwh" },
  ];
  const rows = contracts.flatMap(contract => {
    const matches = metrics.filter(metric => metric.name === contract.name && metric.unit === "kWh" && metric.frequency === "monthly" && metric.metricType !== "calculated");
    if (matches.length !== 1) return [];
    return values.filter(value => value.metricId === matches[0].id).map(value => ({ ...value, inputName: contract.inputName }));
  });
  return compatibleCarbonSources(rows, period, siteId);
}
