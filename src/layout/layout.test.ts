import { describe, expect, it } from 'vitest';
import { formatDay, parseDay } from '../model/dates';
import { sampleProject } from '../model/sample-data';
import type { Entry, Project } from '../model/types';
import { computeLayout, LAYOUT } from './computeLayout';
import { packLanes } from './lanes';
import { ceilToUnit, createTimeScale, floorToUnit, generateTicks } from './scale';
import { estimateTextWidth } from './text';

const d = (iso: string) => parseDay(iso)!;

const project = (entries: Entry[], overlapMode: Project['settings']['overlapMode'] = 'sublanes'): Project => ({
  timelines: [
    { id: 'b', name: 'Second', color: '#059669', order: 1 },
    { id: 'a', name: 'First', color: '#2563eb', order: 0 },
  ],
  entries,
  settings: { overlapMode, scale: 'month', showToday: true },
});
const e = (id: string, start: string, end: string, timelineId = 'a'): Entry => ({ id, name: id, start, end, timelineId });

describe('packLanes', () => {
  it('puts non-overlapping items in one lane', () => {
    const r = packLanes([
      { id: '1', start: 0, end: 10 },
      { id: '2', start: 20, end: 30 },
      { id: '3', start: 40, end: 50 },
    ]);
    expect(r.laneCount).toBe(1);
  });

  it('needs three lanes for three mutually overlapping items', () => {
    const r = packLanes([
      { id: '1', start: 0, end: 30 },
      { id: '2', start: 10, end: 40 },
      { id: '3', start: 20, end: 50 },
    ]);
    expect(r.laneCount).toBe(3);
    expect(new Set(r.lanes.values()).size).toBe(3);
  });

  it('reuses a freed lane', () => {
    const r = packLanes([
      { id: '1', start: 0, end: 10 },
      { id: '2', start: 5, end: 30 },
      { id: '3', start: 12, end: 20 },
    ]);
    expect(r.laneCount).toBe(2);
    expect(r.lanes.get('3')).toBe(0);
  });

  it('respects the minimum gap', () => {
    const items = [
      { id: '1', start: 0, end: 10 },
      { id: '2', start: 12, end: 20 },
    ];
    expect(packLanes(items, 0).laneCount).toBe(1);
    expect(packLanes(items, 5).laneCount).toBe(2);
  });

  it('reports at least one lane for an empty row', () => {
    expect(packLanes([]).laneCount).toBe(1);
  });
});

describe('time scale', () => {
  it('maps dates linearly to x', () => {
    const s = createTimeScale(d('2026-01-01'), d('2026-01-11'), 100, 200);
    expect(s.toX(d('2026-01-01'))).toBe(100);
    expect(s.toX(d('2026-01-06'))).toBe(150);
    expect(s.toX(d('2026-01-11'))).toBe(200);
  });

  it('snaps to unit boundaries', () => {
    expect(formatDay(floorToUnit(d('2026-11-07'), 'week'))).toBe('2026-11-02');
    expect(formatDay(floorToUnit(d('2026-11-07'), 'month'))).toBe('2026-11-01');
    expect(formatDay(floorToUnit(d('2026-11-07'), 'quarter'))).toBe('2026-10-01');
    expect(formatDay(ceilToUnit(d('2026-11-07'), 'month'))).toBe('2026-12-01');
    expect(formatDay(ceilToUnit(d('2026-12-01'), 'month'))).toBe('2026-12-01');
  });

  it('generates month ticks with the year on January and on the first tick', () => {
    const ticks = generateTicks(d('2025-11-15'), d('2026-02-10'), 'month');
    expect(ticks.map((t) => t.label)).toEqual(['Dec 2025', 'Jan 2026', 'Feb']);
    expect(ticks.map((t) => t.major)).toEqual([false, true, false]);
  });

  it('generates quarter ticks', () => {
    const ticks = generateTicks(d('2026-01-01'), d('2026-12-31'), 'quarter');
    expect(ticks.map((t) => t.label)).toEqual(['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026']);
  });
});

describe('computeLayout', () => {
  it('orders rows by timeline order and draws same-timeline entries on the same row', () => {
    const r = computeLayout(
      project([e('x', '2026-01-05', '2026-01-20'), e('y', '2026-02-01', '2026-02-01'), e('z', '2026-01-10', '2026-01-12', 'b')]),
      { width: 1000, today: '2026-01-15' },
    );
    expect(r.rows.map((row) => row.name)).toEqual(['First', 'Second']);
    const byId = Object.fromEntries(r.items.map((i) => [i.entryId, i]));
    expect(byId.x!.timelineId).toBe('a');
    expect(byId.y!.timelineId).toBe('a');
    expect(r.rows[0]!.laneCount).toBe(1); // bar and later milestone share one line
  });

  it('turns start = end into a milestone and start < end into a bar', () => {
    const r = computeLayout(project([e('m', '2026-03-01', '2026-03-01'), e('b', '2026-04-01', '2026-04-30')]), {
      width: 1000,
    });
    expect(r.items.find((i) => i.entryId === 'm')!.kind).toBe('milestone');
    expect(r.items.find((i) => i.entryId === 'b')!.kind).toBe('bar');
  });

  it('treats the end date as inclusive', () => {
    const r = computeLayout(project([e('a1', '2026-03-01', '2026-03-01'), e('b1', '2026-03-01', '2026-03-10')]), {
      width: 1000,
    });
    const milestone = r.items.find((i) => i.entryId === 'a1')!;
    const bar = r.items.find((i) => i.entryId === 'b1')!;
    const pxPerDay = (r.plot.x1 - r.plot.x0) / (d(r.domain.end) - d(r.domain.start));
    expect(bar.x).toBeCloseTo(milestone.x);
    expect(bar.width).toBeCloseTo(10 * pxPerDay);
  });

  it('stacks overlapping bars into sub-lanes and grows the row', () => {
    const overlapping = [e('1', '2026-01-01', '2026-03-01'), e('2', '2026-02-01', '2026-04-01'), e('3', '2026-02-15', '2026-05-01')];
    const r = computeLayout(project(overlapping), { width: 1000 });
    expect(r.rows[0]!.laneCount).toBe(3);
    expect(r.rows[0]!.height).toBe(LAYOUT.rowPadding * 2 + 3 * LAYOUT.laneHeight);
    expect(new Set(r.items.map((i) => i.lane))).toEqual(new Set([0, 1, 2]));
  });

  it('keeps everything on one line in single-line mode', () => {
    const overlapping = [e('1', '2026-01-01', '2026-03-01'), e('2', '2026-02-01', '2026-04-01'), e('3', '2026-02-15', '2026-05-01')];
    const r = computeLayout(project(overlapping, 'singleLine'), { width: 1000 });
    expect(r.rows[0]!.laneCount).toBe(1);
    expect(r.items.every((i) => i.lane === 0)).toBe(true);
    expect(new Set(r.items.map((i) => i.y + i.height / 2)).size).toBe(1); // same centre line
    expect(r.items.every((i) => i.opacity < 1)).toBe(true); // overlaps stay visible
  });

  it('alternates crowded milestone labels above and below in single-line mode', () => {
    const r = computeLayout(project([e('Alpha milestone', '2026-03-01', '2026-03-01'), e('Beta milestone', '2026-03-03', '2026-03-03')], 'singleLine'), {
      width: 800,
    });
    expect(r.items.map((i) => i.label.placement).sort()).toEqual(['above', 'below']);
  });

  it('keeps items inside the plot area', () => {
    const r = computeLayout(sampleProject, { width: 900, today: '2026-03-15' });
    for (const i of r.items) {
      const left = i.kind === 'bar' ? i.x : i.x - i.width / 2;
      const right = i.kind === 'bar' ? i.x + i.width : i.x + i.width / 2;
      expect(left).toBeGreaterThanOrEqual(r.plot.x0);
      expect(right).toBeLessThanOrEqual(r.plot.x1);
    }
  });

  it('never overlaps two items (shape + label) in the same sub-lane', () => {
    const r = computeLayout(sampleProject, { width: 1100 });
    const rowsLanes = new Map<string, { s: number; e: number }[]>();
    for (const i of r.items) {
      const key = `${i.timelineId}:${i.lane}`;
      let s = i.kind === 'bar' ? i.x : i.x - i.width / 2;
      let end = i.kind === 'bar' ? i.x + i.width : i.x + i.width / 2;
      if (i.label.placement === 'right') end = i.label.x + estimateTextWidth(i.label.text, r.fontSize);
      if (i.label.placement === 'left') s = i.label.x - estimateTextWidth(i.label.text, r.fontSize);
      rowsLanes.set(key, [...(rowsLanes.get(key) ?? []), { s, e: end }]);
    }
    for (const spans of rowsLanes.values()) {
      spans.sort((a, b) => a.s - b.s);
      for (let k = 1; k < spans.length; k++) expect(spans[k]!.s).toBeGreaterThanOrEqual(spans[k - 1]!.e);
    }
  });

  it('skips invalid entries and reports why', () => {
    const r = computeLayout(project([e('ok', '2026-01-01', '2026-01-10'), e('bad', '2026-01-10', '2026-01-01'), e('lost', '2026-01-01', '2026-01-02', 'zzz')]), {
      width: 800,
    });
    expect(r.items.map((i) => i.entryId)).toEqual(['ok']);
    expect(r.skipped.map((s) => s.entryId).sort()).toEqual(['bad', 'lost']);
  });

  it('handles a project with no entries', () => {
    const r = computeLayout(project([]), { width: 800, today: '2026-06-15' });
    expect(r.items).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.today).not.toBeNull();
  });

  it('places the today line only when enabled and in range', () => {
    const p = project([e('x', '2026-01-05', '2026-02-20')]);
    expect(computeLayout(p, { width: 800, today: '2026-01-20' }).today).not.toBeNull();
    expect(computeLayout(p, { width: 800, today: '2030-01-01' }).today).toBeNull();
    expect(computeLayout({ ...p, settings: { ...p.settings, showToday: false } }, { width: 800, today: '2026-01-20' }).today).toBeNull();
  });
});
