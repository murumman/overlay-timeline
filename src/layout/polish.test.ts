import { describe, expect, it } from 'vitest';
import { parseDay } from '../model/dates';
import { sampleProject } from '../model/sample-data';
import type { Entry, Project } from '../model/types';
import { computeLayout, LAYOUT } from './computeLayout';
import { estimateTextWidth, truncateText } from './text';
import { panView, zoomView } from './zoom';

const d = (iso: string) => parseDay(iso)!;
const e = (id: string, name: string, start: string, end: string, timelineId = 'a'): Entry => ({ id, name, start, end, timelineId });
const project = (entries: Entry[], extra: Partial<Project['settings']> = {}, collapsed = false): Project => ({
  timelines: [{ id: 'a', name: 'A', color: '#2563eb', order: 0, ...(collapsed ? { collapsed } : {}) }],
  entries,
  settings: { overlapMode: 'sublanes', scale: 'auto', showToday: false, ...extra },
});

describe('truncateText', () => {
  it('keeps text that fits and shortens text that does not', () => {
    expect(truncateText('Short', 200, 12)).toBe('Short');
    const t = truncateText('A rather long milestone name', 80, 12);
    expect(t.endsWith('…')).toBe(true);
    expect(estimateTextWidth(t, 12)).toBeLessThanOrEqual(80);
  });

  it('returns empty when nothing fits', () => {
    expect(truncateText('Hello', 3, 12)).toBe('');
  });
});

describe('zoom maths', () => {
  const base = { start: 0, end: 100 };

  it('zooms in around the anchor', () => {
    expect(zoomView(base, base, 0.5, 0.5)).toEqual({ start: 25, end: 75 });
    expect(zoomView(base, base, 0.5, 0)).toEqual({ start: 0, end: 50 });
  });

  it('returns null when zooming out to the full range', () => {
    expect(zoomView({ start: 20, end: 80 }, base, 2)).toBeNull();
  });

  it('never zooms in below the minimum window', () => {
    const v = zoomView({ start: 10, end: 14 }, base, 0.1)!;
    expect(v.end - v.start).toBe(LAYOUT.minZoomDays);
  });

  it('pans but stays inside the full range', () => {
    expect(panView({ start: 10, end: 30 }, base, 5)).toEqual({ start: 15, end: 35 });
    expect(panView({ start: 10, end: 30 }, base, -50)).toEqual({ start: 0, end: 20 });
    expect(panView({ start: 70, end: 90 }, base, 50)).toEqual({ start: 80, end: 100 });
  });
});

describe('zoomed layout', () => {
  it('shows only the zoom window and reports the unzoomed range', () => {
    const view = { start: d('2026-03-01'), end: d('2026-04-01') };
    const r = computeLayout(sampleProject, { width: 1100, view });
    expect(r.zoomed).toBe(true);
    expect(r.domain).toEqual({ start: '2026-03-01', end: '2026-04-01' });
    expect(r.baseDomain).toEqual(computeLayout(sampleProject, { width: 1100 }).domain);
    expect(r.outOfRange).toContain('p5'); // Launch, in June
    expect(r.scale).toBe('week'); // a month at this width gets a finer scale
  });

  it('ignores a view equal to the full range', () => {
    const full = computeLayout(sampleProject, { width: 1100 });
    const r = computeLayout(sampleProject, { width: 1100, view: { start: d(full.domain.start), end: d(full.domain.end) } });
    expect(r.zoomed).toBe(false);
  });
});

describe('collapsed rows', () => {
  const entries = [e('1', 'One', '2026-01-01', '2026-03-01'), e('2', 'Two', '2026-02-01', '2026-04-01'), e('3', 'M', '2026-02-10', '2026-02-10')];

  it('become a thin strip with all items on one line and no labels', () => {
    const r = computeLayout(project(entries, {}, true), { width: 1000 });
    expect(r.rows[0]).toMatchObject({ collapsed: true, height: LAYOUT.collapsedHeight, laneCount: 1 });
    expect(r.items.every((i) => i.lane === 0 && i.label.hidden)).toBe(true);
    expect(r.items.find((i) => i.kind === 'bar')!.height).toBe(LAYOUT.collapsedBarHeight);
  });

  it('are taller again when expanded', () => {
    const r = computeLayout(project(entries), { width: 1000 });
    expect(r.rows[0]!.collapsed).toBe(false);
    expect(r.rows[0]!.height).toBeGreaterThan(LAYOUT.collapsedHeight);
  });
});

describe('label collisions', () => {
  it('hides a single-line label when both above and below are taken', () => {
    const crowded = [
      e('1', 'First milestone', '2026-03-01', '2026-03-01'),
      e('2', 'Second milestone', '2026-03-02', '2026-03-02'),
      e('3', 'Third milestone', '2026-03-03', '2026-03-03'),
    ];
    // Viewed across a whole year, the three are only a few pixels apart.
    const r = computeLayout(project(crowded, { overlapMode: 'singleLine', spanYears: 1, spanStartYear: 2026 }), { width: 800 });
    const placements = r.items.map((i) => (i.label.hidden ? 'hidden' : i.label.placement)).sort();
    expect(placements).toEqual(['above', 'below', 'hidden']);
  });

  it('shortens a long label with "…" instead of letting it run off the chart', () => {
    const long = 'An extremely long description of a milestone that will never fit';
    const r = computeLayout(project([e('1', long, '2026-06-01', '2026-06-01'), e('2', 'x', '2026-01-01', '2026-12-31')]), {
      width: 500,
    });
    const m = r.items.find((i) => i.entryId === '1')!;
    expect(m.name).toBe(long); // full name kept for the tooltip
    expect(m.label.text.endsWith('…') || m.label.hidden).toBe(true);
  });

  it('shortens long row names', () => {
    const p = project([]);
    p.timelines[0]!.name = 'A timeline with a very very long name indeed';
    const r = computeLayout(p, { width: 800 });
    expect(r.rows[0]!.label.endsWith('…')).toBe(true);
    expect(r.rows[0]!.name).toBe(p.timelines[0]!.name);
  });
});
