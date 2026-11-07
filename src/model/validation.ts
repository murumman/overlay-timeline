import { parseDay } from './dates';
import type { Entry, Timeline } from './types';

export type EntryIssue = { entryId: string; field: 'name' | 'start' | 'end' | 'timelineId'; message: string };

export function validateEntry(entry: Entry, timelines: readonly Timeline[]): EntryIssue[] {
  const issues: EntryIssue[] = [];
  const add = (field: EntryIssue['field'], message: string) => issues.push({ entryId: entry.id, field, message });

  if (!entry.name.trim()) add('name', 'Name is empty');

  const start = parseDay(entry.start);
  const end = parseDay(entry.end);
  if (start === null) add('start', `Start "${entry.start}" is not a valid date (YYYY-MM-DD)`);
  if (end === null) add('end', `End "${entry.end}" is not a valid date (YYYY-MM-DD)`);
  if (start !== null && end !== null && end < start) add('end', 'End is before start');

  if (!timelines.some((t) => t.id === entry.timelineId)) add('timelineId', 'Unknown timeline');

  return issues;
}

/** Entries that cannot be drawn (bad dates or unknown timeline). An empty name is allowed to draw. */
export function isDrawable(entry: Entry, timelines: readonly Timeline[]): boolean {
  return validateEntry(entry, timelines).every((i) => i.field === 'name');
}
