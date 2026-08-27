export const CURRENT_UK_FACTOR_YEAR = 2026;
export const CURRENT_UK_FACTOR_SET = `UK_GOVERNMENT_${CURRENT_UK_FACTOR_YEAR}`;
export const CURRENT_UK_FACTOR_SOURCE = "UK Government GHG Conversion Factors 2026 (v1.2)";
export const CURRENT_UK_FACTOR_SOURCE_URL =
  "https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2026";

export function emissionFactorYearFromSet(
  factorSet: string | null | undefined,
  fallbackYear = CURRENT_UK_FACTOR_YEAR,
): number {
  const match = factorSet?.match(/_(\d{4})$/);
  return match ? Number(match[1]) : fallbackYear;
}
