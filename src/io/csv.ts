import { formatDay, fromParts, parseDay } from '../model/dates';
import { newId, nextTimelineColor } from '../model/operations';
import type { Entry, IsoDate, Project, Timeline } from '../model/types';

// ---------------------------------------------------------------- export

const EXPORT_HEADER = ['Name', 'Start', 'End', 'Timeline', 'Color', 'Notes'];

function csvCell(v: string, delimiter: string): string {
  return /["\r\n]/.test(v) || v.includes(delimiter) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Entries as CSV, one row per entry, timelines referenced by name.
 * Starts with a byte-order mark so Excel reads umlauts correctly.
 */
export function projectToCsv(p: Project, delimiter: ',' | ';' = ','): string {
  const timelineName = new Map(p.timelines.map((t) => [t.id, t.name]));
  const order = new Map(p.timelines.map((t) => [t.id, t.order]));
  const entries = [...p.entries].sort((a, b) => (order.get(a.timelineId) ?? 0) - (order.get(b.timelineId) ?? 0));
  const rows = [
    EXPORT_HEADER,
    ...entries.map((e) => [e.name, e.start, e.end, timelineName.get(e.timelineId) ?? '', e.color ?? '', e.notes ?? '']),
  ];
  return '﻿' + rows.map((r) => r.map((c) => csvCell(c, delimiter)).join(delimiter)).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- parse

/** Guesses the delimiter from the header line: ';' (German Excel), tab, or ','. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const candidates = [';', '\t', ','].map((d) => [d, count(d)] as const);
  const best = candidates.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] > 0 ? best[0] : ',';
}

/** RFC 4180 style parser: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === '') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---------------------------------------------------------------- import

/** Accepts YYYY-MM-DD, YYYY/MM/DD and German DD.MM.YYYY (also D.M.YY). Returns null otherwise. */
export function normalizeDate(raw: string): IsoDate | null {
  const s = raw.trim();
  if (!s) return null;
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (m) return checked(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return checked(y, Number(m[2]), Number(m[1]));
  }
  return null;
}

function checked(y: number, mo: number, d: number): IsoDate | null {
  const iso = formatDay(fromParts(y, mo - 1, d));
  return parseDay(iso) !== null && iso === `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` ? iso : null;
}

type Column = 'name' | 'start' | 'end' | 'timeline' | 'color' | 'notes';

const ALIASES: Record<Column, string[]> = {
  name: ['name', 'title', 'task', 'entry', 'milestone', 'titel', 'aufgabe', 'bezeichnung'],
  start: ['start', 'start date', 'startdate', 'from', 'begin', 'date', 'beginn', 'startdatum', 'von', 'datum'],
  end: ['end', 'end date', 'enddate', 'to', 'finish', 'due', 'ende', 'enddatum', 'bis'],
  timeline: ['timeline', 'group', 'category', 'row', 'lane', 'workstream', 'gruppe', 'kategorie', 'zeile'],
  color: ['color', 'colour', 'farbe'],
  notes: ['notes', 'note', 'description', 'comment', 'notizen', 'beschreibung', 'kommentar'],
};

function mapHeader(header: string[]): Partial<Record<Column, number>> {
  const map: Partial<Record<Column, number>> = {};
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase().replace(/[_-]+/g, ' ');
    for (const col of Object.keys(ALIASES) as Column[]) {
      if (map[col] === undefined && ALIASES[col].includes(key)) map[col] = i;
    }
  });
  return map;
}

export type CsvImportResult = {
  entries: Entry[];
  timelines: Timeline[];
  /** Human-readable notes about skipped rows or assumptions. */
  warnings: string[];
};

/**
 * Reads entries from CSV. Needs at least a Name and Start column.
 * Missing End → milestone. Timelines are matched by name (case-insensitive) against
 * `existing`; unknown names become new timelines. Rows without a timeline go to "Imported".
 */
export function csvToEntries(text: string, existing: readonly Timeline[] = []): CsvImportResult {
  const rows = parseCsv(text);
  const warnings: string[] = [];
  if (rows.length === 0) return { entries: [], timelines: [...existing], warnings: ['The file is empty.'] };

  const cols = mapHeader(rows[0]!);
  if (cols.name === undefined || cols.start === undefined) {
    return {
      entries: [],
      timelines: [...existing],
      warnings: ['Could not find the "Name" and "Start" columns in the first row.'],
    };
  }

  const timelines = [...existing];
  const byName = new Map(timelines.map((t) => [t.name.trim().toLowerCase(), t]));
  const timelineFor = (rawName: string): Timeline => {
    const name = rawName.trim() || 'Imported';
    const key = name.toLowerCase();
    let t = byName.get(key);
    if (!t) {
      t = {
        id: newId(),
        name,
        color: nextTimelineColor(timelines),
        order: timelines.reduce((m, x) => Math.max(m, x.order + 1), 0),
      };
      timelines.push(t);
      byName.set(key, t);
    }
    return t;
  };

  const entries: Entry[] = [];
  const cell = (r: string[], c: Column) => (cols[c] === undefined ? '' : (r[cols[c]!] ?? '').trim());

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = cell(r, 'name');
    const start = normalizeDate(cell(r, 'start'));
    if (start === null) {
      warnings.push(`Row ${line} skipped: start date "${cell(r, 'start')}" not recognised.`);
      return;
    }
    const rawEnd = cell(r, 'end');
    let end = rawEnd ? normalizeDate(rawEnd) : start;
    if (end === null) {
      warnings.push(`Row ${line}: end date "${rawEnd}" not recognised, imported as a milestone.`);
      end = start;
    } else if (end < start) {
      warnings.push(`Row ${line}: end is before start, imported as a milestone.`);
      end = start;
    }
    const color = cell(r, 'color');
    const notes = cell(r, 'notes');
    entries.push({
      id: newId(),
      name: name || '(no name)',
      start,
      end,
      timelineId: timelineFor(cell(r, 'timeline')).id,
      ...(/^#[0-9a-f]{6}$/i.test(color) ? { color } : {}),
      ...(notes ? { notes } : {}),
    });
  });

  return { entries, timelines, warnings };
}
