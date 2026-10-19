// The number shown at `progress` (0 to 1) of a count up to `target`. Eases out, so the
// count slows as it lands, and always lands exactly on the target.
export function countUpValue(target: number, progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  const eased = 1 - Math.pow(1 - t, 3);
  return Math.round(target * eased);
}
