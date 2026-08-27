export function getIncompletePlaywrightSummary(output: string): string | null {
  const match = output.match(/\b([1-9]\d*)\s+(?:skipped|did not run)\b/i);
  return match?.[0] ?? null;
}

export function shouldFailPlaywrightReleaseStep(exitStatus: number | null, output: string): boolean {
  return exitStatus !== 0 || getIncompletePlaywrightSummary(output) !== null;
}
