import { dayParts, formatDay, fromParts, parseDay, todayIso, type DayNumber } from '../model/dates';
import { isMilestone, type Entry, type IsoDate, type Project, type TimeScale } from '../model/types';
import { isDrawable, validateEntry, type EntryIssue } from '../model/validation';
import { packLanes, type Extent } from './lanes';
import { ceilToUnit, createTimeScale, effectiveScale, floorToUnit, generateTicks, labelStep } from './scale';
import { estimateTextWidth } from './text';
import type { AxisTick, LayoutItem, LayoutLabel, LayoutResult, LayoutRow } from './types';

export const LAYOUT = {
  rowHeaderWidth: 160,
  rightPadding: 16,
  /** Room under the plot for the "Today" label. */
  bottomPadding: 20,
  axisHeight: 36,
  laneHeight: 28,
  barHeight: 18,
  milestoneSize: 14,
  rowPadding: 8,
  /** Extra vertical band above and below the line in single-line mode, for labels. */
  labelBand: 16,
  fontSize: 12,
  labelGap: 5,
  insidePadding: 6,
  /** Minimum horizontal gap between two items in the same lane. */
  itemGap: 8,
  minPlotWidth: 120,
} as const;

export type LayoutOptions = {
  /** Total width of the drawing in pixels. */
  width: number;
  /** Date used for the "today" line; defaults to the current date. */
  today?: IsoDate;
};

/** Horizontal geometry of one entry before lanes / y-positions are known. */
type Draft = {
  entry: Entry;
  kind: 'bar' | 'milestone';
  startDay: DayNumber;
  x: number;
  width: number;
  textWidth: number;
  label: Omit<LayoutLabel, 'y'>;
};

export function computeLayout(project: Project, options: LayoutOptions): LayoutResult {
  const { settings } = project;
  const L = LAYOUT;
  const timelines = [...project.timelines].sort((a, b) => a.order - b.order);

  const drawable: Entry[] = [];
  const skipped: EntryIssue[] = [];
  for (const e of project.entries) {
    if (isDrawable(e, timelines)) drawable.push(e);
    else skipped.push(...validateEntry(e, timelines).filter((i) => i.field !== 'name'));
  }

  const plotX0 = L.rowHeaderWidth;
  const plotX1 = Math.max(options.width - L.rightPadding, plotX0 + L.minPlotWidth);

  // ---- Time domain: either a fixed span of years, or fitted to the entries
  //      (snapped to whole scale units, with at least a day of breathing room).
  const todayDay = parseDay(options.today ?? todayIso()) ?? parseDay(todayIso())!;
  let minDay: DayNumber;
  let maxDayExcl: DayNumber;
  if (drawable.length > 0) {
    minDay = Math.min(...drawable.map((e) => parseDay(e.start)!));
    maxDayExcl = Math.max(...drawable.map((e) => parseDay(e.end)! + 1));
  } else {
    minDay = todayDay - 30;
    maxDayExcl = todayDay + 30;
  }

  let domainStart: DayNumber;
  let domainEnd: DayNumber;
  let unit: TimeScale;
  if (settings.spanYears && settings.spanYears > 0) {
    const startYear = settings.spanStartYear ?? dayParts(drawable.length > 0 ? minDay : todayDay).year;
    domainStart = fromParts(startYear, 0, 1);
    domainEnd = fromParts(startYear + settings.spanYears, 0, 1);
    unit = effectiveScale(settings.scale, domainEnd - domainStart, plotX1 - plotX0);
  } else {
    unit = effectiveScale(settings.scale, maxDayExcl - minDay + 2, plotX1 - plotX0);
    domainStart = floorToUnit(minDay - 1, unit);
    domainEnd = ceilToUnit(maxDayExcl + 1, unit);
  }
  const scale = createTimeScale(domainStart, domainEnd, plotX0, plotX1);

  // Entries entirely outside a fixed span are not drawn; partly visible bars are clipped.
  const outOfRange: string[] = [];
  const visible = drawable.filter((e) => {
    const s = parseDay(e.start)!;
    const inside = isMilestone(e) ? s >= domainStart && s <= domainEnd : s < domainEnd && parseDay(e.end)! + 1 > domainStart;
    if (!inside) outOfRange.push(e.id);
    return inside;
  });

  // ---- Rows and items
  const rows: LayoutRow[] = [];
  const items: LayoutItem[] = [];
  let y = L.axisHeight;

  for (const tl of timelines) {
    const entries = visible.filter((e) => e.timelineId === tl.id);
    const drafts = entries.map((e) =>
      draftHorizontal(e, scale.toX, [domainStart, domainEnd], plotX0, plotX1, settings.overlapMode),
    );

    let laneOf: (d: Draft) => number;
    let laneCount: number;
    let rowHeight: number;
    let centerY: (lane: number) => number;

    if (settings.overlapMode === 'sublanes') {
      const extents: Extent[] = drafts.map((d) => ({ id: d.entry.id, ...horizontalExtent(d) }));
      const packed = packLanes(extents, L.itemGap);
      laneCount = packed.laneCount;
      laneOf = (d) => packed.lanes.get(d.entry.id)!;
      rowHeight = L.rowPadding * 2 + laneCount * L.laneHeight;
      const rowY = y;
      centerY = (lane) => rowY + L.rowPadding + lane * L.laneHeight + L.laneHeight / 2;
    } else {
      laneCount = 1;
      laneOf = () => 0;
      rowHeight = L.rowPadding * 2 + L.labelBand * 2 + L.laneHeight;
      const lineY = y + L.rowPadding + L.labelBand + L.laneHeight / 2;
      centerY = () => lineY;
      assignAboveBelow(drafts);
    }

    rows.push({ timelineId: tl.id, name: tl.name, color: tl.color, y, height: rowHeight, laneCount });

    for (const d of drafts) {
      const lane = laneOf(d);
      const cy = centerY(lane);
      const isBar = d.kind === 'bar';
      const shapeHalf = (isBar ? L.barHeight : L.milestoneSize) / 2;
      const labelY =
        d.label.placement === 'above'
          ? cy - shapeHalf - 3 - L.fontSize / 2
          : d.label.placement === 'below'
            ? cy + shapeHalf + 3 + L.fontSize / 2
            : cy;

      items.push({
        entryId: d.entry.id,
        timelineId: tl.id,
        kind: d.kind,
        name: d.entry.name,
        start: d.entry.start,
        end: d.entry.end,
        x: d.x,
        y: isBar ? cy - L.barHeight / 2 : cy,
        width: isBar ? d.width : L.milestoneSize,
        height: isBar ? L.barHeight : L.milestoneSize,
        lane,
        color: d.entry.color ?? tl.color,
        opacity: isBar && settings.overlapMode === 'singleLine' ? 0.75 : 1,
        label: { ...d.label, y: labelY },
      });
    }
    y += rowHeight;
  }

  const plotY1 = y;
  const ticks = buildTicks(domainStart, domainEnd, unit, scale.toX, plotX1);
  const today =
    settings.showToday && todayDay >= domainStart && todayDay <= domainEnd
      ? { x: scale.toX(todayDay), date: formatDay(todayDay) }
      : null;

  return {
    width: plotX1 + L.rightPadding,
    height: plotY1 + L.bottomPadding,
    fontSize: L.fontSize,
    plot: { x0: plotX0, x1: plotX1, y0: L.axisHeight, y1: plotY1 },
    axis: { y: 0, height: L.axisHeight },
    rowHeader: { width: L.rowHeaderWidth },
    domain: { start: formatDay(domainStart), end: formatDay(domainEnd) },
    scale: unit,
    rows,
    items,
    ticks,
    today,
    skipped,
    outOfRange,
  };
}

function draftHorizontal(
  entry: Entry,
  toX: (d: DayNumber) => number,
  [domainStart, domainEnd]: [DayNumber, DayNumber],
  plotX0: number,
  plotX1: number,
  mode: Project['settings']['overlapMode'],
): Draft {
  const L = LAYOUT;
  const startDay = parseDay(entry.start)!;
  const textWidth = estimateTextWidth(entry.name, L.fontSize);

  if (isMilestone(entry)) {
    const cx = toX(startDay);
    const half = L.milestoneSize / 2;
    let label: Draft['label'];
    if (mode === 'singleLine') {
      // Placement (above/below) is decided later; centred on the diamond, kept inside the plot.
      const x = clamp(cx, plotX0 + textWidth / 2, plotX1 - textWidth / 2);
      label = { text: entry.name, x, anchor: 'middle', placement: 'above' };
    } else if (cx + half + L.labelGap + textWidth <= plotX1) {
      label = { text: entry.name, x: cx + half + L.labelGap, anchor: 'start', placement: 'right' };
    } else {
      label = { text: entry.name, x: cx - half - L.labelGap, anchor: 'end', placement: 'left' };
    }
    return { entry, kind: 'milestone', startDay, x: cx, width: L.milestoneSize, textWidth, label };
  }

  // Clip to the visible window.
  const x = toX(Math.max(startDay, domainStart));
  const width = Math.max(2, toX(Math.min(parseDay(entry.end)! + 1, domainEnd)) - x);
  let label: Draft['label'];
  if (textWidth + 2 * L.insidePadding <= width) {
    label = { text: entry.name, x: x + L.insidePadding, anchor: 'start', placement: 'inside' };
  } else if (mode === 'singleLine') {
    const fitsFromStart = x + textWidth <= plotX1;
    label = fitsFromStart
      ? { text: entry.name, x, anchor: 'start', placement: 'above' }
      : { text: entry.name, x: x + width, anchor: 'end', placement: 'above' };
  } else if (x + width + L.labelGap + textWidth <= plotX1) {
    label = { text: entry.name, x: x + width + L.labelGap, anchor: 'start', placement: 'right' };
  } else {
    label = { text: entry.name, x: x - L.labelGap, anchor: 'end', placement: 'left' };
  }
  return { entry, kind: 'bar', startDay, x, width, textWidth, label };
}

/** Left/right pixel span of the label alone. */
function labelSpan(d: Draft): { start: number; end: number } {
  const { x, anchor } = d.label;
  if (anchor === 'start') return { start: x, end: x + d.textWidth };
  if (anchor === 'end') return { start: x - d.textWidth, end: x };
  return { start: x - d.textWidth / 2, end: x + d.textWidth / 2 };
}

/** Pixel span occupied by the shape and (if outside it) its label. Used for lane packing. */
function horizontalExtent(d: Draft): { start: number; end: number } {
  const shape =
    d.kind === 'milestone' ? { start: d.x - d.width / 2, end: d.x + d.width / 2 } : { start: d.x, end: d.x + d.width };
  if (d.label.placement === 'inside') return shape;
  const lab = labelSpan(d);
  return { start: Math.min(shape.start, lab.start), end: Math.max(shape.end, lab.end) };
}

/**
 * Single-line mode: put each outside label above the line unless it would collide with the
 * previous label above, then try below; if both collide, use the side that collides least.
 */
function assignAboveBelow(drafts: Draft[]): void {
  const outside = drafts
    .filter((d) => d.label.placement !== 'inside')
    .sort((a, b) => labelSpan(a).start - labelSpan(b).start);
  let aboveEnd = -Infinity;
  let belowEnd = -Infinity;
  for (const d of outside) {
    const span = labelSpan(d);
    const fitsAbove = span.start >= aboveEnd + LAYOUT.itemGap;
    const fitsBelow = span.start >= belowEnd + LAYOUT.itemGap;
    const above = fitsAbove || (!fitsBelow && aboveEnd <= belowEnd);
    d.label = { ...d.label, placement: above ? 'above' : 'below' };
    if (above) aboveEnd = span.end;
    else belowEnd = span.end;
  }
}

function buildTicks(
  startDay: DayNumber,
  endDay: DayNumber,
  scaleUnit: TimeScale,
  toX: (d: DayNumber) => number,
  plotX1: number,
): AxisTick[] {
  const raw = generateTicks(startDay, endDay, scaleUnit);
  if (raw.length === 0) return [];
  const spacing = raw.length > 1 ? toX(raw[1]!.day) - toX(raw[0]!.day) : Infinity;
  const widest = Math.max(...raw.map((t) => estimateTextWidth(t.label, LAYOUT.fontSize)));
  const every = labelStep(scaleUnit, Math.max(1, Math.ceil((widest + 12) / spacing)));

  return raw.map((t) => {
    const x = toX(t.day);
    const fits = x + 4 + estimateTextWidth(t.label, LAYOUT.fontSize) <= plotX1;
    return { x, date: formatDay(t.day), label: t.label, major: t.major, showLabel: t.seq % every === 0 && fits };
  });
}

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
