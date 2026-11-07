import { dayParts, fromParts, MONTHS_SHORT, type DayNumber } from '../model/dates';
import { TIME_SCALES, type TimeScale } from '../model/types';

export type TimeScaleFn = {
  toX: (day: DayNumber) => number;
  pxPerDay: number;
};

/** Linear mapping of the day range [startDay, endDay] onto [x0, x1]. */
export function createTimeScale(startDay: DayNumber, endDay: DayNumber, x0: number, x1: number): TimeScaleFn {
  const span = Math.max(1, endDay - startDay);
  const pxPerDay = (x1 - x0) / span;
  return { toX: (day) => x0 + (day - startDay) * pxPerDay, pxPerDay };
}

/** Approximate length of one unit in days (for choosing a scale). */
export const UNIT_DAYS: Record<TimeScale, number> = {
  day: 1,
  week: 7,
  month: 30.44,
  quarter: 91.3,
  year: 365.25,
  decade: 3652.5,
};

/** Minimum pixel distance between ticks for the automatic scale. */
const AUTO_MIN_TICK_PX = 50;
/** Hard upper limit on grid lines, so a too-fine scale on a long span stays fast. */
const MAX_TICKS_PER_PX = 1 / 4;

/**
 * The scale actually used: for 'auto', the finest unit whose ticks are at least
 * AUTO_MIN_TICK_PX apart; for an explicit unit, that unit unless it would produce
 * far too many grid lines, in which case the next coarser one that fits.
 */
export function effectiveScale(requested: TimeScale | 'auto', spanDays: number, plotWidth: number): TimeScale {
  const pxPerDay = plotWidth / Math.max(1, spanDays);
  const startIdx = requested === 'auto' ? 0 : TIME_SCALES.indexOf(requested);
  for (const s of TIME_SCALES.slice(startIdx)) {
    const tickPx = UNIT_DAYS[s] * pxPerDay;
    const ok = requested === 'auto' ? tickPx >= AUTO_MIN_TICK_PX : spanDays / UNIT_DAYS[s] <= plotWidth * MAX_TICKS_PER_PX;
    if (ok) return s;
  }
  return 'decade';
}

/** Start of the scale unit that contains `day` (weeks start on Monday). */
export function floorToUnit(day: DayNumber, scale: TimeScale): DayNumber {
  const p = dayParts(day);
  switch (scale) {
    case 'day':
      return day;
    case 'week':
      return day - p.weekday;
    case 'month':
      return fromParts(p.year, p.month, 1);
    case 'quarter':
      return fromParts(p.year, p.month - (p.month % 3), 1);
    case 'year':
      return fromParts(p.year, 0, 1);
    case 'decade':
      return fromParts(p.year - mod(p.year, 10), 0, 1);
  }
}

/** The unit boundary strictly after `boundary` (which must itself be a boundary). */
export function nextBoundary(boundary: DayNumber, scale: TimeScale): DayNumber {
  const p = dayParts(boundary);
  switch (scale) {
    case 'day':
      return boundary + 1;
    case 'week':
      return boundary + 7;
    case 'month':
      return fromParts(p.year, p.month + 1, 1);
    case 'quarter':
      return fromParts(p.year, p.month + 3, 1);
    case 'year':
      return fromParts(p.year + 1, 0, 1);
    case 'decade':
      return fromParts(p.year + 10, 0, 1);
  }
}

/** Smallest unit boundary ≥ `day`. */
export function ceilToUnit(day: DayNumber, scale: TimeScale): DayNumber {
  const f = floorToUnit(day, scale);
  return f === day ? day : nextBoundary(f, scale);
}

export type RawTick = {
  day: DayNumber;
  label: string;
  major: boolean;
  /** Running unit number (e.g. the year for 'year'), so thinned labels land on round values. */
  seq: number;
};

/** One tick per unit boundary in [startDay, endDay]. */
export function generateTicks(startDay: DayNumber, endDay: DayNumber, scale: TimeScale): RawTick[] {
  const ticks: RawTick[] = [];
  let first = true;
  let index = 0;
  for (let d = ceilToUnit(startDay, scale); d <= endDay; d = nextBoundary(d, scale)) {
    const p = dayParts(d);
    const mon = MONTHS_SHORT[p.month]!;
    let label: string;
    let major: boolean;
    let seq: number;
    switch (scale) {
      case 'day':
        major = p.date === 1;
        label = major || first ? `${p.date} ${mon}` : String(p.date);
        seq = index;
        break;
      case 'week':
        major = p.date <= 7; // first week starting in a new month
        label = `${p.date} ${mon}`;
        seq = index;
        break;
      case 'month':
        major = p.month === 0;
        label = major || first ? `${mon} ${p.year}` : mon;
        seq = p.year * 12 + p.month;
        break;
      case 'quarter':
        major = p.month === 0;
        label = `Q${p.month / 3 + 1} ${p.year}`;
        seq = p.year * 4 + p.month / 3;
        break;
      case 'year':
        major = mod(p.year, 10) === 0;
        label = String(p.year);
        seq = p.year;
        break;
      case 'decade':
        major = mod(p.year, 100) === 0;
        label = `${p.year}s`;
        seq = p.year / 10;
        break;
    }
    ticks.push({ day: d, label, major, seq });
    first = false;
    index++;
  }
  return ticks;
}

/** "Round" label intervals per scale, e.g. every 1, 2, 5 or 10 years. */
export const LABEL_STEPS: Record<TimeScale, readonly number[]> = {
  day: [1, 2, 7, 14],
  week: [1, 2, 4, 8, 13],
  month: [1, 2, 3, 6, 12],
  quarter: [1, 2, 4, 8],
  year: [1, 2, 5, 10, 20, 50],
  decade: [1, 2, 5, 10],
};

/** Smallest round step ≥ `needed` (or the largest available). */
export function labelStep(scale: TimeScale, needed: number): number {
  const steps = LABEL_STEPS[scale];
  return steps.find((s) => s >= needed) ?? Math.ceil(needed / steps[steps.length - 1]!) * steps[steps.length - 1]!;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
