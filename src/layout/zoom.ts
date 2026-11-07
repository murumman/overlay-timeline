import { LAYOUT } from './computeLayout';

/** A visible time window in day numbers (end exclusive). */
export type View = { start: number; end: number };

/**
 * Zooms `current` by `factor` (< 1 = zoom in, > 1 = zoom out), keeping the day under
 * `anchor` (0 = left edge … 1 = right edge) in place. The result stays inside `base`.
 * Returns null when zoomed out back to (or beyond) the full range.
 */
export function zoomView(current: View, base: View, factor: number, anchor = 0.5): View | null {
  const baseSpan = base.end - base.start;
  const span = current.end - current.start;
  const newSpan = Math.max(LAYOUT.minZoomDays, Math.min(baseSpan, span * factor));
  if (newSpan >= baseSpan) return null;
  const a = Math.min(1, Math.max(0, anchor));
  const anchorDay = current.start + a * span;
  return clampView({ start: anchorDay - a * newSpan, end: anchorDay - a * newSpan + newSpan }, base);
}

/** Moves the window by `days` (positive = later), without leaving `base`. */
export function panView(current: View, base: View, days: number): View {
  return clampView({ start: current.start + days, end: current.end + days }, base);
}

function clampView(v: View, base: View): View {
  const span = v.end - v.start;
  const start = Math.min(Math.max(v.start, base.start), base.end - span);
  return { start, end: start + span };
}
