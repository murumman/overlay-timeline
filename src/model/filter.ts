import { parseDay } from './dates';
import { isMilestone, type Entry, type IsoDate, type Project } from './types';

/** All set fields must match. Unset fields don't filter. */
export type EntryFilter = {
  /** Case-insensitive text contained in the name. */
  name?: string;
  kind?: 'milestone' | 'bar';
  startFrom?: IsoDate;
  startTo?: IsoDate;
  endFrom?: IsoDate;
  endTo?: IsoDate;
  /** Only these timelines. Empty or undefined = all. */
  timelineIds?: string[];
};

export type FilterField = 'name' | 'kind' | 'start' | 'end' | 'timeline';

export function isFieldActive(f: EntryFilter, field: FilterField): boolean {
  switch (field) {
    case 'name':
      return !!f.name?.trim();
    case 'kind':
      return !!f.kind;
    case 'start':
      return !!(f.startFrom || f.startTo);
    case 'end':
      return !!(f.endFrom || f.endTo);
    case 'timeline':
      return !!f.timelineIds?.length;
  }
}

export function isFilterActive(f: EntryFilter): boolean {
  return (['name', 'kind', 'start', 'end', 'timeline'] as const).some((k) => isFieldActive(f, k));
}

/** The filter with one field cleared. */
export function clearField(f: EntryFilter, field: FilterField): EntryFilter {
  const next = { ...f };
  if (field === 'name') delete next.name;
  if (field === 'kind') delete next.kind;
  if (field === 'start') delete next.startFrom, delete next.startTo;
  if (field === 'end') delete next.endFrom, delete next.endTo;
  if (field === 'timeline') delete next.timelineIds;
  return next;
}

/** True if `iso` is a valid date within [from, to] (either bound optional). */
function inRange(iso: IsoDate, from?: IsoDate, to?: IsoDate): boolean {
  if (!from && !to) return true;
  if (parseDay(iso) === null) return false;
  return (!from || iso >= from) && (!to || iso <= to);
}

export function matchesFilter(e: Entry, f: EntryFilter): boolean {
  const q = f.name?.trim().toLowerCase();
  if (q && !e.name.toLowerCase().includes(q)) return false;
  if (f.kind && (f.kind === 'milestone') !== isMilestone(e)) return false;
  if (!inRange(e.start, f.startFrom, f.startTo)) return false;
  if (!inRange(e.end, f.endFrom, f.endTo)) return false;
  if (f.timelineIds?.length && !f.timelineIds.includes(e.timelineId)) return false;
  return true;
}

/**
 * The project as seen through the filter: only matching entries, and if timelines
 * are filtered, only those timelines (rows).
 */
export function applyFilter(p: Project, f: EntryFilter): Project {
  if (!isFilterActive(f)) return p;
  const ids = f.timelineIds?.length ? new Set(f.timelineIds) : null;
  return {
    ...p,
    entries: p.entries.filter((e) => matchesFilter(e, f)),
    timelines: ids ? p.timelines.filter((t) => ids.has(t.id)) : p.timelines,
  };
}
