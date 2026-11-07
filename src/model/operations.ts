import { formatDay, parseDay } from './dates';
import { isMilestone, type Entry, type IsoDate, type Project, type Timeline } from './types';

/**
 * Pure editing operations on a Project. Each returns a new Project (never mutates),
 * so they are easy to test and the UI store just calls them.
 */

export const TIMELINE_PALETTE = [
  '#2563eb', // blue
  '#db2777', // pink
  '#059669', // green
  '#d97706', // amber
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#dc2626', // red
  '#4b5563', // grey
] as const;

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nextTimelineColor(timelines: readonly Timeline[]): string {
  const used = new Set(timelines.map((t) => t.color.toLowerCase()));
  return TIMELINE_PALETTE.find((c) => !used.has(c)) ?? TIMELINE_PALETTE[timelines.length % TIMELINE_PALETTE.length]!;
}

const sortedTimelines = (p: Project) => [...p.timelines].sort((a, b) => a.order - b.order);

// ---------- Timelines

export function addTimeline(p: Project, name?: string): { project: Project; id: string } {
  const id = newId();
  const order = p.timelines.reduce((m, t) => Math.max(m, t.order + 1), 0);
  const timeline: Timeline = {
    id,
    name: name?.trim() || `Timeline ${p.timelines.length + 1}`,
    color: nextTimelineColor(p.timelines),
    order,
  };
  return { project: { ...p, timelines: [...p.timelines, timeline] }, id };
}

export function updateTimeline(p: Project, id: string, patch: Partial<Omit<Timeline, 'id'>>): Project {
  return { ...p, timelines: p.timelines.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

/** Removes the timeline and all of its entries. */
export function deleteTimeline(p: Project, id: string): Project {
  return {
    ...p,
    timelines: p.timelines.filter((t) => t.id !== id),
    entries: p.entries.filter((e) => e.timelineId !== id),
  };
}

/** Moves a timeline up (delta −1) or down (+1); orders are renumbered 0..n-1. */
export function moveTimeline(p: Project, id: string, delta: number): Project {
  const list = sortedTimelines(p);
  const from = list.findIndex((t) => t.id === id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= list.length) return p;
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved!);
  return { ...p, timelines: list.map((t, order) => ({ ...t, order })) };
}

// ---------- Entries

/** Adds an entry: one week starting `today`, on the given (or first) timeline. Creates a timeline if none exist. */
export function addEntry(p: Project, today: IsoDate, init: Partial<Entry> = {}): { project: Project; id: string } {
  let project = p;
  let timelineId = init.timelineId ?? sortedTimelines(p)[0]?.id;
  if (!timelineId) {
    const added = addTimeline(project);
    project = added.project;
    timelineId = added.id;
  }
  const startDay = parseDay(init.start ?? today) ?? parseDay(today)!;
  const id = newId();
  const entry: Entry = {
    name: 'New entry',
    start: formatDay(startDay),
    end: formatDay(startDay + 6),
    ...init,
    id,
    timelineId,
  };
  return { project: { ...project, entries: [...project.entries, entry] }, id };
}

/**
 * Updates an entry. If it was a milestone and only `start` changes, `end` moves with it,
 * so it stays a milestone.
 */
export function updateEntry(p: Project, id: string, patch: Partial<Omit<Entry, 'id'>>): Project {
  return {
    ...p,
    entries: p.entries.map((e) => {
      if (e.id !== id) return e;
      const next = { ...e, ...patch };
      if (patch.start !== undefined && patch.end === undefined && isMilestone(e)) next.end = patch.start;
      return next;
    }),
  };
}

/** Turns an entry into a milestone (end = start) or back into a one-week bar. */
export function setMilestone(p: Project, id: string, milestone: boolean): Project {
  const e = p.entries.find((x) => x.id === id);
  if (!e) return p;
  if (milestone) return updateEntry(p, id, { end: e.start });
  const start = parseDay(e.start);
  if (start === null || !isMilestone(e)) return p;
  return updateEntry(p, id, { end: formatDay(start + 6) });
}

export function deleteEntry(p: Project, id: string): Project {
  return { ...p, entries: p.entries.filter((e) => e.id !== id) };
}

/** Inserts a copy right after the original. */
export function duplicateEntry(p: Project, id: string): { project: Project; id: string } {
  const idx = p.entries.findIndex((e) => e.id === id);
  if (idx === -1) return { project: p, id };
  const copy: Entry = { ...p.entries[idx]!, id: newId(), name: `${p.entries[idx]!.name} (copy)` };
  const entries = [...p.entries];
  entries.splice(idx + 1, 0, copy);
  return { project: { ...p, entries }, id: copy.id };
}

/** Sorts entries by timeline order, then start date, then end date. Invalid dates go last. */
export function sortEntries(p: Project): Project {
  const order = new Map(p.timelines.map((t) => [t.id, t.order]));
  const day = (iso: string) => parseDay(iso) ?? Number.MAX_SAFE_INTEGER;
  const entries = [...p.entries].sort(
    (a, b) =>
      (order.get(a.timelineId) ?? Infinity) - (order.get(b.timelineId) ?? Infinity) ||
      day(a.start) - day(b.start) ||
      day(a.end) - day(b.end),
  );
  return { ...p, entries };
}

export function emptyProject(settings: Project['settings']): Project {
  return { entries: [], timelines: [{ id: newId(), name: 'Timeline 1', color: TIMELINE_PALETTE[0], order: 0 }], settings };
}
