/** Size bands are descriptive, never a substitute for an exact headcount. */
export const EMPLOYEE_SIZE_BANDS = ["1-10", "11-50", "51-200", "51-250", "201-500", "251-500", "251-1000", "501-1000", "500+", "1001-5000", "5001+"];

export function parseEmployeeSize(value: unknown):
  | { ok: true; value: number | null; band: string | null }
  | { ok: false; error: string } {
  const raw = String(value ?? "").trim();
  if (EMPLOYEE_SIZE_BANDS.includes(raw)) return { ok: true, value: null, band: raw };
  if (/^\d+$/.test(raw) && Number.isSafeInteger(Number(raw))) return { ok: true, value: Number(raw), band: null };
  return { ok: false, error: "Enter a whole employee count or choose a company-size range." };
}
