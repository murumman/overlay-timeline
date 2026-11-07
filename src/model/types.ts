/** ISO calendar date, e.g. "2026-03-01". Always interpreted as a whole day (no time zone). */
export type IsoDate = string;

export type Entry = {
  id: string;
  name: string;
  start: IsoDate;
  /** Inclusive end date. Equal to `start` → the entry is a milestone. */
  end: IsoDate;
  /** Which timeline (row) the entry is drawn on. */
  timelineId: string;
  /** Optional colour override; defaults to the timeline's colour. */
  color?: string;
  notes?: string;
};

export type Timeline = {
  id: string;
  name: string;
  color: string;
  /** Rows are drawn in ascending order. */
  order: number;
  collapsed?: boolean;
};

export type OverlapMode = 'sublanes' | 'singleLine';
export type TimeScale = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'decade';
/** Finest to coarsest. */
export const TIME_SCALES: readonly TimeScale[] = ['day', 'week', 'month', 'quarter', 'year', 'decade'];

export type Settings = {
  /** sublanes: overlapping entries stack inside their row. singleLine: everything on one line. */
  overlapMode: OverlapMode;
  /** Tick unit of the time axis; 'auto' picks a readable one for the visible span. */
  scale: TimeScale | 'auto';
  showToday: boolean;
  /** Fixed visible span in years. Undefined = fit to the entries. */
  spanYears?: number;
  /** First year of the fixed span. Undefined = year of the earliest entry (or the current year). */
  spanStartYear?: number;
};

export type Project = {
  entries: Entry[];
  timelines: Timeline[];
  settings: Settings;
};

export const isMilestone = (e: Pick<Entry, 'start' | 'end'>): boolean => e.start === e.end;
