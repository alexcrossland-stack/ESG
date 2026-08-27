export function getIncompletePlaywrightSummary(output: string): string | null {
  const match = output.match(/\b([1-9]\d*)\s+(?:skipped|did not run)\b/i);
  return match?.[0] ?? null;
}

export function shouldFailPlaywrightReleaseStep(exitStatus: number | null, output: string): boolean {
  return exitStatus !== 0 || getIncompletePlaywrightSummary(output) !== null;
}

export const RELEASE_STEP_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

type ReleaseStepFailure = {
  output: string;
  status: number | null;
  signal?: string | null;
  errorMessage?: string | null;
};

export function formatReleaseStepFailure(
  failure: ReleaseStepFailure,
  tailLength = 12_000,
): string {
  const metadata = [
    failure.errorMessage ? `spawn error: ${failure.errorMessage}` : null,
    failure.status === null ? "exit=unknown" : `exit=${failure.status}`,
    failure.signal ? `signal=${failure.signal}` : null,
  ].filter(Boolean).join(", ");
  const output = failure.output.trim();

  if (!output) return metadata;
  if (output.length <= tailLength) return `${metadata}\n${output}`;

  return `${metadata}\n[showing final ${tailLength} characters]\n${output.slice(-tailLength)}`;
}
