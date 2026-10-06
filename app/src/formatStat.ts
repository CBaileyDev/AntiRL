/** Presentation only: retain full precision in stored telemetry and calculations. */
export function formatStat(value: number | null | undefined, digits = 1, missing = "N/A"): string {
  return value == null || !Number.isFinite(value) ? missing : String(Number(value.toFixed(digits)));
}
