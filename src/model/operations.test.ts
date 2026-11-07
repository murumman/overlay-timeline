import { describe, expect, it } from 'vitest';
import * as ops from './operations';
import { sampleProject } from './sample-data';
import type { Project } from './types';

const base: Project = {
  timelines: [
    { id: 'a', name: 'A', color: '#2563eb', order: 0 },
    { id: 'b', name: 'B', color: '#db2777', order: 1 },
    { id: 'c', name: 'C', color: '#059669', order: 2 },
  ],
  entries: [
    { id: '1', name: 'one', start: '2026-03-10', end: '2026-03-20', timelineId: 'b' },
    { id: '2', name: 'two', start: '2026-03-01', end: '2026-03-01', timelineId: 'a' },
    { id: '3', name: 'three', start: '2026-02-01', end: '2026-02-05', timelineId: 'b' },
  ],
  settings: { overlapMode: 'sublanes', scale: 'month', showToday: true },
};

describe('entry operations', () => {
  it('adds a one-week entry on the first timeline, starting today', () => {
    const { project, id } = ops.addEntry(base, '2026-11-07');
    const e = project.entries.find((x) => x.id === id)!;
    expect(e).toMatchObject({ start: '2026-11-07', end: '2026-11-13', timelineId: 'a' });
    expect(base.entries).toHaveLength(3); // original untouched
  });

  it('creates a timeline when adding an entry to an empty project', () => {
    const { project, id } = ops.addEntry({ ...base, timelines: [], entries: [] }, '2026-11-07');
    expect(project.timelines).toHaveLength(1);
    expect(project.entries[0]!.timelineId).toBe(project.timelines[0]!.id);
    expect(project.entries[0]!.id).toBe(id);
  });

  it('keeps a milestone a milestone when its start moves', () => {
    const p = ops.updateEntry(base, '2', { start: '2026-04-15' });
    expect(p.entries.find((e) => e.id === '2')).toMatchObject({ start: '2026-04-15', end: '2026-04-15' });
  });

  it('does not move the end of a bar when its start changes', () => {
    const p = ops.updateEntry(base, '1', { start: '2026-03-12' });
    expect(p.entries.find((e) => e.id === '1')).toMatchObject({ start: '2026-03-12', end: '2026-03-20' });
  });

  it('toggles milestone on and off', () => {
    let p = ops.setMilestone(base, '1', true);
    expect(p.entries.find((e) => e.id === '1')).toMatchObject({ start: '2026-03-10', end: '2026-03-10' });
    p = ops.setMilestone(p, '1', false);
    expect(p.entries.find((e) => e.id === '1')).toMatchObject({ start: '2026-03-10', end: '2026-03-16' });
  });

  it('duplicates right after the original with a new id', () => {
    const { project, id } = ops.duplicateEntry(base, '1');
    expect(project.entries.map((e) => e.id)).toEqual(['1', id, '2', '3']);
    expect(project.entries[1]!.name).toBe('one (copy)');
  });

  it('deletes an entry', () => {
    expect(ops.deleteEntry(base, '2').entries.map((e) => e.id)).toEqual(['1', '3']);
  });

  it('sorts by timeline order, then start date', () => {
    expect(ops.sortEntries(base).entries.map((e) => e.id)).toEqual(['2', '3', '1']);
  });
});

describe('timeline operations', () => {
  it('adds a timeline with the next free palette colour and order', () => {
    const { project, id } = ops.addTimeline(base, 'New');
    const t = project.timelines.find((x) => x.id === id)!;
    expect(t).toMatchObject({ name: 'New', order: 3 });
    expect(base.timelines.map((x) => x.color)).not.toContain(t.color);
  });

  it('moves timelines up and down and renumbers order', () => {
    const p = ops.moveTimeline(base, 'c', -1);
    const names = [...p.timelines].sort((a, b) => a.order - b.order).map((t) => t.name);
    expect(names).toEqual(['A', 'C', 'B']);
    expect(ops.moveTimeline(base, 'a', -1)).toBe(base); // already at the top
  });

  it('deletes a timeline together with its entries', () => {
    const p = ops.deleteTimeline(base, 'b');
    expect(p.timelines.map((t) => t.id)).toEqual(['a', 'c']);
    expect(p.entries.map((e) => e.id)).toEqual(['2']);
  });

  it('sample data uses unique ids', () => {
    const ids = sampleProject.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
