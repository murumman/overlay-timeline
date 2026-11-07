/** Horizontal space an item occupies (its shape plus its label), in pixels. */
export type Extent = { id: string; start: number; end: number };

export type LaneAssignment = { lanes: Map<string, number>; laneCount: number };

/**
 * Greedy interval packing: sort by start and put each item in the first lane
 * whose last item ends at least `gap` before this one starts.
 * This is optimal for interval graphs (uses the minimum number of lanes).
 */
export function packLanes(extents: readonly Extent[], gap = 0): LaneAssignment {
  const sorted = [...extents].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();

  for (const e of sorted) {
    let lane = laneEnds.findIndex((end) => end + gap <= e.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e.end);
    } else {
      laneEnds[lane] = e.end;
    }
    lanes.set(e.id, lane);
  }
  return { lanes, laneCount: Math.max(1, laneEnds.length) };
}
