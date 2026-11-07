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
export type TimeScale = 'day' | 'week' | 'month' | 'quarter';

export type Settings = {
  /** sublanes: overlapping entries stack inside their row. singleLine: everything on one line. */
  overlapMode: OverlapMode;
  scale: TimeScale;
  showToday: boolean;
};

export type Project = {
  entries: Entry[];
  timelines: Timeline[];
  settings: Settings;
};

export const isMilestone = (e: Pick<Entry, 'start' | 'end'>): boolean => e.start === e.end;
