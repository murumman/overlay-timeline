import { describe, expect, it } from 'vitest';
import { applyFilter, clearField, isFilterActive, matchesFilter } from './filter';
import { sampleProject } from './sample-data';

const ids = (f: Parameters<typeof applyFilter>[1]) => applyFilter(sampleProject, f).entries.map((e) => e.id);

describe('entry filter', () => {
  it('passes everything when empty', () => {
    expect(isFilterActive({})).toBe(false);
    expect(isFilterActive({ name: '  ', timelineIds: [] })).toBe(false);
    expect(applyFilter(sampleProject, {})).toBe(sampleProject);
  });

  it('filters by name, ignoring case', () => {
    expect(ids({ name: 'LAUNCH' }).sort()).toEqual(['m2', 'm4', 'p5']);
  });

  it('filters milestones or bars', () => {
    const milestones = ids({ kind: 'milestone' });
    expect(milestones).toContain('p4');
    expect(milestones).not.toContain('p1');
    expect(ids({ kind: 'bar' })).not.toContain('p4');
  });

  it('filters by start and end date ranges (inclusive)', () => {
    expect(ids({ startFrom: '2026-06-15', startTo: '2026-06-30' }).sort()).toEqual(['f4', 'm4', 'p5']);
    expect(ids({ endTo: '2026-01-31' })).toEqual(['h1']);
  });

  it('excludes entries with invalid dates only when a date filter is set', () => {
    const bad = { id: 'x', name: 'x', start: '', end: '', timelineId: 'product' };
    expect(matchesFilter(bad, {})).toBe(true);
    expect(matchesFilter(bad, { startFrom: '2026-01-01' })).toBe(false);
  });

  it('limits entries and rows to the chosen timelines', () => {
    const p = applyFilter(sampleProject, { timelineIds: ['hiring'] });
    expect(p.timelines.map((t) => t.id)).toEqual(['hiring']);
    expect(p.entries.every((e) => e.timelineId === 'hiring')).toBe(true);
  });

  it('keeps all rows when only entry fields are filtered', () => {
    expect(applyFilter(sampleProject, { name: 'launch' }).timelines).toHaveLength(sampleProject.timelines.length);
  });

  it('combines fields with AND', () => {
    expect(ids({ name: 'launch', kind: 'milestone' })).toEqual(['p5']);
  });

  it('clears one field at a time', () => {
    const f = clearField({ name: 'a', startFrom: '2026-01-01', startTo: '2026-02-01' }, 'start');
    expect(f).toEqual({ name: 'a' });
  });
});
