import { describe, expect, it } from 'vitest';
import { sampleProject } from '../model/sample-data';
import { csvToEntries, detectDelimiter, normalizeDate, parseCsv, projectToCsv } from './csv';

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, delimiters and newlines inside quotes', () => {
    const rows = parseCsv('a,b,c\r\n"x, y","say ""hi""","line1\nline2"\n', ',');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line1\nline2'],
    ]);
  });

  it('skips blank lines and a byte-order mark', () => {
    expect(parseCsv('﻿a,b\n\n1,2\n', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('detects semicolons (German Excel) and tabs', () => {
    expect(detectDelimiter('Name;Start;Ende\n')).toBe(';');
    expect(detectDelimiter('Name\tStart\n')).toBe('\t');
    expect(detectDelimiter('Name,Start\n')).toBe(',');
  });
});

describe('normalizeDate', () => {
  it('accepts ISO and German formats', () => {
    expect(normalizeDate('2026-03-01')).toBe('2026-03-01');
    expect(normalizeDate('2026/3/1')).toBe('2026-03-01');
    expect(normalizeDate('01.03.2026')).toBe('2026-03-01');
    expect(normalizeDate('1.3.26')).toBe('2026-03-01');
  });

  it('rejects impossible or ambiguous dates', () => {
    expect(normalizeDate('31.02.2026')).toBeNull();
    expect(normalizeDate('03/01/2026')).toBeNull();
    expect(normalizeDate('soon')).toBeNull();
  });
});

describe('csvToEntries', () => {
  it('imports a German Excel file with aliases, milestones and new timelines', () => {
    const csv = 'Titel;Beginn;Ende;Gruppe\nKickoff;05.01.2026;;Projekt\nUmsetzung;12.01.2026;27.02.2026;Projekt\nBudget;01.02.2026;15.02.2026;Finanzen\n';
    const r = csvToEntries(csv);
    expect(r.warnings).toEqual([]);
    expect(r.timelines.map((t) => t.name)).toEqual(['Projekt', 'Finanzen']);
    expect(r.entries).toHaveLength(3);
    expect(r.entries[0]).toMatchObject({ name: 'Kickoff', start: '2026-01-05', end: '2026-01-05' });
    expect(r.entries[0]!.timelineId).toBe(r.entries[1]!.timelineId);
  });

  it('matches existing timelines by name, ignoring case', () => {
    const r = csvToEntries('Name,Start,End,Timeline\nX,2026-01-01,2026-01-02,product\n', sampleProject.timelines);
    expect(r.entries[0]!.timelineId).toBe('product');
    expect(r.timelines).toHaveLength(sampleProject.timelines.length);
  });

  it('puts rows without a timeline on "Imported"', () => {
    const r = csvToEntries('Name,Start\nX,2026-01-01\n');
    expect(r.timelines.map((t) => t.name)).toEqual(['Imported']);
  });

  it('skips rows with bad start dates and reports them', () => {
    const r = csvToEntries('Name,Start,End\nGood,2026-01-01,2026-01-03\nBad,tomorrow,2026-01-03\nBackwards,2026-01-10,2026-01-01\n');
    expect(r.entries.map((e) => e.name)).toEqual(['Good', 'Backwards']);
    expect(r.entries[1]!.end).toBe('2026-01-10');
    expect(r.warnings).toHaveLength(2);
  });

  it('explains a missing header', () => {
    const r = csvToEntries('foo,bar\n1,2\n');
    expect(r.entries).toEqual([]);
    expect(r.warnings[0]).toMatch(/Name.*Start/);
  });

  it('round-trips the sample project through export and import (both delimiters)', () => {
    for (const delim of [',', ';'] as const) {
      const r = csvToEntries(projectToCsv(sampleProject, delim));
      expect(r.warnings).toEqual([]);
      const simplify = (es: typeof r.entries, names: Map<string, string>) =>
        es.map((e) => [e.name, e.start, e.end, names.get(e.timelineId)]).sort();
      expect(simplify(r.entries, new Map(r.timelines.map((t) => [t.id, t.name])))).toEqual(
        simplify(sampleProject.entries, new Map(sampleProject.timelines.map((t) => [t.id, t.name]))),
      );
    }
  });

  it('quotes names containing the delimiter on export', () => {
    const p = { ...sampleProject, entries: [{ ...sampleProject.entries[0]!, name: 'Design; phase "A"' }] };
    expect(projectToCsv(p, ';')).toContain('"Design; phase ""A"""');
  });
});
