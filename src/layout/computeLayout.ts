import { dayParts, formatDay, fromParts, parseDay, todayIso, type DayNumber } from '../model/dates';
import { isMilestone, type Entry, type IsoDate, type Project, type Settings, type TimeScale } from '../model/types';
import { isDrawable, validateEntry, type EntryIssue } from '../model/validation';
import { packLanes, type Extent } from './lanes';
import { ceilToUnit, createTimeScale, effectiveScale, floorToUnit, generateTicks, labelStep } from './scale';
import { estimateTextWidth, truncateText } from './text';
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
  /** A collapsed row: a thin strip with small shapes and no labels. */
  collapsedHeight: 24,
  collapsedBarHeight: 8,
  collapsedMilestoneSize: 10,
  fontSize: 12,
  labelGap: 5,
  insidePadding: 6,
  /** Minimum horizontal gap between two items in the same lane. */
  itemGap: 8,
  /** Labels shorter than this (after shortening with "…") are hidden instead. */
  minLabelWidth: 28,
  minPlotWidth: 120,
  /** Smallest zoom window, in days. */
  minZoomDays: 3,
} as const;

export type LayoutOptions = {
  /** Total width of the drawing in pixels. */
  width: number;
  /** Date used for the "today" line; defaults to the current date. */
  today?: IsoDate;
  /** Zoom window (day numbers, end exclusive). Overrides the fitted / fixed span while set. */
  view?: { start: DayNumber; end: DayNumber } | null;
};

/** Horizontal geometry of one entry before lanes / y-positions are known. */
type Draft = {
  entry: Entry;
  kind: 'bar' | 'milestone';
  startDay: DayNumber;
  x: number;
  width: number;
  /** Width of the (possibly shortened) label text. */
  textWidth: number;
  label: Omit<LayoutLabel, 'y'>;
};

type Domain = { start: DayNumber; end: DayNumber; unit: TimeScale };

/**
 * The unzoomed time range: a fixed span of years, or fitted to the entries
 * (snapped to whole scale units, with at least a day of breathing room).
 */
function baseDomain(drawable: Entry[], settings: Settings, plotWidth: number, todayDay: DayNumber): Domain {
  let minDay: DayNumber;
  let maxDayExcl: DayNumber;
  if (drawable.length > 0) {
    minDay = Math.min(...drawable.map((e) => parseDay(e.start)!));
    maxDayExcl = Math.max(...drawable.map((e) => parseDay(e.end)! + 1));
  } else {
    minDay = todayDay - 30;
    maxDayExcl = todayDay + 30;
  }

  if (settings.spanYears && settings.spanYears > 0) {
    const startYear = settings.spanStartYear ?? dayParts(drawable.length > 0 ? minDay : todayDay).year;
    const start = fromParts(startYear, 0, 1);
    const end = fromParts(startYear + settings.spanYears, 0, 1);
    return { start, end, unit: effectiveScale(settings.scale, end - start, plotWidth) };
  }
  const unit = effectiveScale(settings.scale, maxDayExcl - minDay + 2, plotWidth);
  return { start: floorToUnit(minDay - 1, unit), end: ceilToUnit(maxDayExcl + 1, unit), unit };
}

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
  const plotWidth = plotX1 - plotX0;
  const todayDay = parseDay(options.today ?? todayIso()) ?? parseDay(todayIso())!;

  const base = baseDomain(drawable, settings, plotWidth, todayDay);
  const view = options.view;
  const zoomed = !!view && view.end - view.start >= L.minZoomDays && (view.start !== base.start || view.end !== base.end);
  const domainStart = zoomed ? Math.round(view.start) : base.start;
  const domainEnd = zoomed ? Math.round(view.end) : base.end;
  const unit = zoomed ? effectiveScale(settings.scale, domainEnd - domainStart, plotWidth) : base.unit;
  const scale = createTimeScale(domainStart, domainEnd, plotX0, plotX1);

  // Entries entirely outside the visible range are not drawn; partly visible bars are clipped.
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
    const collapsed = !!tl.collapsed;
    const entries = visible.filter((e) => e.timelineId === tl.id);
    const drafts = entries.map((e) =>
      draftHorizontal(e, scale.toX, [domainStart, domainEnd], plotX0, plotX1, settings.overlapMode),
    );

    let laneOf: (d: Draft) => number = () => 0;
    let laneCount = 1;
    let rowHeight: number;
    let centerY: (lane: number) => number;

    if (collapsed) {
      rowHeight = L.collapsedHeight;
      const lineY = y + L.collapsedHeight / 2;
      centerY = () => lineY;
      for (const d of drafts) d.label = { ...d.label, hidden: true };
    } else if (settings.overlapMode === 'sublanes') {
      const extents: Extent[] = drafts.map((d) => ({ id: d.entry.id, ...horizontalExtent(d) }));
      const packed = packLanes(extents, L.itemGap);
      laneCount = packed.laneCount;
      laneOf = (d) => packed.lanes.get(d.entry.id)!;
      rowHeight = L.rowPadding * 2 + laneCount * L.laneHeight;
      const rowY = y;
      centerY = (lane) => rowY + L.rowPadding + lane * L.laneHeight + L.laneHeight / 2;
    } else {
      rowHeight = L.rowPadding * 2 + L.labelBand * 2 + L.laneHeight;
      const lineY = y + L.rowPadding + L.labelBand + L.laneHeight / 2;
      centerY = () => lineY;
      assignAboveBelow(drafts);
    }

    rows.push({
      timelineId: tl.id,
      name: tl.name,
      label: truncateText(tl.name, L.rowHeaderWidth - 40, L.fontSize) || '…',
      collapsed,
      color: tl.color,
      y,
      height: rowHeight,
      laneCount,
    });

    for (const d of drafts) {
      const lane = laneOf(d);
      const cy = centerY(lane);
      const isBar = d.kind === 'bar';
      const barH = collapsed ? L.collapsedBarHeight : L.barHeight;
      const msSize = collapsed ? L.collapsedMilestoneSize : L.milestoneSize;
      const shapeHalf = (isBar ? barH : msSize) / 2;
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
        y: isBar ? cy - barH / 2 : cy,
        width: isBar ? d.width : msSize,
        height: isBar ? barH : msSize,
        lane,
        color: d.entry.color ?? tl.color,
        opacity: isBar && (collapsed || settings.overlapMode === 'singleLine') ? 0.75 : 1,
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
    baseDomain: { start: formatDay(base.start), end: formatDay(base.end) },
    zoomed,
    scale: unit,
    rows,
    items,
    ticks,
    today,
    skipped,
    outOfRange,
  };
}

/** A label shortened to `room` pixels, or hidden if too little would remain. */
function fitLabel(text: string, room: number): { text: string; width: number; hidden: boolean } {
  const t = truncateText(text, room, LAYOUT.fontSize);
  const width = estimateTextWidth(t, LAYOUT.fontSize);
  return t && (t === text || width >= LAYOUT.minLabelWidth) ? { text: t, width, hidden: false } : { text, width: 0, hidden: true };
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
  const fullWidth = estimateTextWidth(entry.name, L.fontSize);
  const plotWidth = plotX1 - plotX0;

  /** Builds the draft, shortening the label to `room` px if needed. */
  const make = (
    kind: Draft['kind'],
    x: number,
    width: number,
    room: number,
    label: Omit<Draft['label'], 'text'>,
  ): Draft => {
    const f = fitLabel(entry.name, room);
    return {
      entry,
      kind,
      startDay,
      x,
      width,
      textWidth: f.width,
      label: { ...label, text: f.text, ...(f.hidden ? { hidden: true } : {}) },
    };
  };

  if (isMilestone(entry)) {
    const cx = toX(startDay);
    const half = L.milestoneSize / 2;
    if (mode === 'singleLine') {
      // Above/below is decided later; centred on the diamond and kept inside the plot.
      const w = Math.min(fullWidth, plotWidth);
      const x = clamp(cx, plotX0 + w / 2, plotX1 - w / 2);
      return make('milestone', cx, L.milestoneSize, plotWidth, { x, anchor: 'middle', placement: 'above' });
    }
    const roomRight = plotX1 - (cx + half + L.labelGap);
    const roomLeft = cx - half - L.labelGap - plotX0;
    return fullWidth <= roomRight || roomRight >= roomLeft
      ? make('milestone', cx, L.milestoneSize, roomRight, { x: cx + half + L.labelGap, anchor: 'start', placement: 'right' })
      : make('milestone', cx, L.milestoneSize, roomLeft, { x: cx - half - L.labelGap, anchor: 'end', placement: 'left' });
  }

  // Clip to the visible window.
  const x = toX(Math.max(startDay, domainStart));
  const width = Math.max(2, toX(Math.min(parseDay(entry.end)! + 1, domainEnd)) - x);
  const roomInside = width - 2 * L.insidePadding;
  if (fullWidth <= roomInside) {
    return make('bar', x, width, roomInside, { x: x + L.insidePadding, anchor: 'start', placement: 'inside' });
  }
  if (mode === 'singleLine') {
    const roomFromStart = plotX1 - x;
    const roomToEnd = x + width - plotX0;
    return fullWidth <= roomFromStart || roomFromStart >= roomToEnd
      ? make('bar', x, width, roomFromStart, { x, anchor: 'start', placement: 'above' })
      : make('bar', x, width, roomToEnd, { x: x + width, anchor: 'end', placement: 'above' });
  }
  const roomRight = plotX1 - (x + width + L.labelGap);
  const roomLeft = x - L.labelGap - plotX0;
  if (fullWidth <= roomRight) {
    return make('bar', x, width, roomRight, { x: x + width + L.labelGap, anchor: 'start', placement: 'right' });
  }
  if (fullWidth <= roomLeft) {
    return make('bar', x, width, roomLeft, { x: x - L.labelGap, anchor: 'end', placement: 'left' });
  }
  // Fits nowhere in full: shorten it where there is the most room (possibly inside the bar).
  const best = Math.max(roomRight, roomLeft, roomInside);
  if (best === roomInside) return make('bar', x, width, roomInside, { x: x + L.insidePadding, anchor: 'start', placement: 'inside' });
  return best === roomRight
    ? make('bar', x, width, roomRight, { x: x + width + L.labelGap, anchor: 'start', placement: 'right' })
    : make('bar', x, width, roomLeft, { x: x - L.labelGap, anchor: 'end', placement: 'left' });
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
  if (d.label.placement === 'inside' || d.label.hidden) return shape;
  const lab = labelSpan(d);
  return { start: Math.min(shape.start, lab.start), end: Math.max(shape.end, lab.end) };
}

/**
 * Single-line mode: put each outside label above the line unless it would collide with the
 * previous label above, then try below. If both sides are taken, the label is hidden
 * (the name still shows in the tooltip) instead of overlapping another one.
 */
function assignAboveBelow(drafts: Draft[]): void {
  const outside = drafts
    .filter((d) => d.label.placement !== 'inside' && !d.label.hidden)
    .sort((a, b) => labelSpan(a).start - labelSpan(b).start);
  let aboveEnd = -Infinity;
  let belowEnd = -Infinity;
  for (const d of outside) {
    const span = labelSpan(d);
    if (span.start >= aboveEnd + LAYOUT.itemGap) {
      d.label = { ...d.label, placement: 'above' };
      aboveEnd = span.end;
    } else if (span.start >= belowEnd + LAYOUT.itemGap) {
      d.label = { ...d.label, placement: 'below' };
      belowEnd = span.end;
    } else {
      d.label = { ...d.label, placement: 'above', hidden: true };
    }
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
