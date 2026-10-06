/** Babylon scales client dimensions by the inverse hardware scaling level. */
export function renderScale(devicePixelRatio: number): number {
  return 1 / Math.min(1.5, Math.max(1, devicePixelRatio || 1));
}

/** Use an integer number of refresh intervals, avoiding 60-on-144 Hz cadence jitter. */
export function playbackFps(refreshHz: number): number {
  const refresh = Math.max(30, Math.min(360, refreshHz || 60));
  return refresh / Math.ceil(refresh / 90);
}

export function measuredRefresh(intervals: readonly number[]): number {
  if (intervals.length < 24) return 60;
  const sorted = [...intervals].sort((a, b) => a - b);
  const measured = 1000 / sorted[Math.floor(sorted.length / 2)];
  const standards = [30, 60, 75, 90, 100, 120, 144, 165, 180, 200, 240, 360];
  const nearest = standards.reduce(
    (best, value) => (Math.abs(value - measured) < Math.abs(best - measured) ? value : best),
    60,
  );
  return Math.abs(nearest - measured) / nearest < 0.06
    ? nearest
    : Math.max(30, Math.min(360, measured));
}
