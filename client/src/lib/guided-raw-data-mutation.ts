export type GuidedRawDataRecord = {
  inputName?: string | null;
  value?: unknown;
};

function normalizedComparisonValue(value: unknown): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? String(numeric) : trimmed;
}

export function buildGuidedRawDataMutation(options: {
  rawInputs: Record<string, string>;
  persistedRawData: GuidedRawDataRecord[];
  visibleInputKeys: ReadonlySet<string>;
}): { inputs: Record<string, string>; clearInputs: string[] } {
  const persistedRawValues = new Map<string, string>();
  for (const entry of options.persistedRawData) {
    const inputName = String(entry.inputName ?? "");
    if (options.visibleInputKeys.has(inputName)) {
      persistedRawValues.set(inputName, normalizedComparisonValue(entry.value));
    }
  }

  const inputs: Record<string, string> = {};
  for (const [inputName, value] of Object.entries(options.rawInputs)) {
    if (!options.visibleInputKeys.has(inputName) || value.trim() === "") continue;
    if (!persistedRawValues.has(inputName)
      || normalizedComparisonValue(value) !== persistedRawValues.get(inputName)) {
      inputs[inputName] = value;
    }
  }

  const clearInputs = options.persistedRawData
    .map((entry) => String(entry.inputName ?? ""))
    .filter((inputName) =>
      options.visibleInputKeys.has(inputName)
      && (options.rawInputs[inputName] ?? "").trim() === "");

  return { inputs, clearInputs };
}
