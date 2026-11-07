import { describe, expect, it } from 'vitest';
import { dayParts, formatDay, parseDay } from './dates';
import { isMilestone, type Entry, type Timeline } from './types';
import { isDrawable, validateEntry } from './validation';

const timelines: Timeline[] = [{ id: 't', name: 'T', color: '#000000', order: 0 }];
const entry = (patch: Partial<Entry>): Entry => ({
  id: 'e',
  name: 'E',
  start: '2026-03-01',
  end: '2026-03-05',
  timelineId: 't',
  ...patch,
});

describe('dates', () => {
  it('round-trips ISO dates', () => {
    for (const iso of ['1970-01-01', '2024-02-29', '2026-03-29', '2026-10-25', '2026-12-31']) {
      expect(formatDay(parseDay(iso)!)).toBe(iso);
    }
  });

  it('counts whole days across daylight-saving changes', () => {
    expect(parseDay('2026-03-30')! - parseDay('2026-03-28')!).toBe(2);
    expect(parseDay('2026-10-26')! - parseDay('2026-10-24')!).toBe(2);
  });

  it('rejects malformed and impossible dates', () => {
    expect(parseDay('2026-02-30')).toBeNull();
    expect(parseDay('2026-13-01')).toBeNull();
    expect(parseDay('01.03.2026')).toBeNull();
    expect(parseDay('')).toBeNull();
  });

  it('reports Monday as weekday 0', () => {
    expect(dayParts(parseDay('2026-11-02')!).weekday).toBe(0); // a Monday
    expect(dayParts(parseDay('2026-11-08')!).weekday).toBe(6); // a Sunday
  });
});

describe('isMilestone', () => {
  it('is true only when start equals end', () => {
    expect(isMilestone({ start: '2026-01-01', end: '2026-01-01' })).toBe(true);
    expect(isMilestone({ start: '2026-01-01', end: '2026-01-02' })).toBe(false);
  });
});

describe('validation', () => {
  it('accepts a valid entry', () => {
    expect(validateEntry(entry({}), timelines)).toEqual([]);
  });

  it('flags end before start', () => {
    const issues = validateEntry(entry({ end: '2026-02-01' }), timelines);
    expect(issues.map((i) => i.field)).toEqual(['end']);
    expect(isDrawable(entry({ end: '2026-02-01' }), timelines)).toBe(false);
  });

  it('flags an unknown timeline', () => {
    expect(validateEntry(entry({ timelineId: 'nope' }), timelines)[0]?.field).toBe('timelineId');
  });

  it('still draws an entry with an empty name', () => {
    expect(isDrawable(entry({ name: '  ' }), timelines)).toBe(true);
  });
});
