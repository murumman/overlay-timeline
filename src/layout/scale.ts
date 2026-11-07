import { dayParts, fromParts, MONTHS_SHORT, type DayNumber } from '../model/dates';
import type { TimeScale } from '../model/types';

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

/** Start of the scale unit (day / week (Monday) / month / quarter) that contains `day`. */
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
  }
}

/** Smallest unit boundary ≥ `day`. */
export function ceilToUnit(day: DayNumber, scale: TimeScale): DayNumber {
  const f = floorToUnit(day, scale);
  return f === day ? day : nextBoundary(f, scale);
}

export type RawTick = { day: DayNumber; label: string; major: boolean };

/** One tick per unit boundary in [startDay, endDay]. `major` marks year (or month, for day/week scale) starts. */
export function generateTicks(startDay: DayNumber, endDay: DayNumber, scale: TimeScale): RawTick[] {
  const ticks: RawTick[] = [];
  let first = true;
  for (let d = ceilToUnit(startDay, scale); d <= endDay; d = nextBoundary(d, scale)) {
    const p = dayParts(d);
    const mon = MONTHS_SHORT[p.month]!;
    let label: string;
    let major: boolean;
    switch (scale) {
      case 'day':
        major = p.date === 1;
        label = major || first ? `${p.date} ${mon}` : String(p.date);
        break;
      case 'week':
        major = p.date <= 7; // first week starting in a new month
        label = `${p.date} ${mon}`;
        break;
      case 'month':
        major = p.month === 0;
        label = major || first ? `${mon} ${p.year}` : mon;
        break;
      case 'quarter':
        major = p.month === 0;
        label = `Q${p.month / 3 + 1} ${p.year}`;
        break;
    }
    ticks.push({ day: d, label, major });
    first = false;
  }
  return ticks;
}
