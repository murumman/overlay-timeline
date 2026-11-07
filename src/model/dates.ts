import type { IsoDate } from './types';

/**
 * Dates are handled as whole "day numbers" (days since 1970-01-01, UTC).
 * This keeps all date math integer-based and immune to time zones / daylight saving.
 */
export type DayNumber = number;

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses "YYYY-MM-DD" into a day number, or returns null if it is not a real calendar date. */
export function parseDay(iso: IsoDate): DayNumber | null {
  const m = ISO_RE.exec(iso.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  // Reject rollovers such as 2026-02-30.
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return ms / MS_PER_DAY;
}

export function formatDay(day: DayNumber): IsoDate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function dayParts(day: DayNumber): { year: number; month: number; date: number; weekday: number } {
  const d = new Date(day * MS_PER_DAY);
  // weekday: 0 = Monday … 6 = Sunday
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate(), weekday: (d.getUTCDay() + 6) % 7 };
}

export function fromParts(year: number, month: number, date: number): DayNumber {
  return Date.UTC(year, month, date) / MS_PER_DAY;
}

/** Today's date in the local calendar, as an ISO date. */
export function todayIso(now: Date = new Date()): IsoDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
