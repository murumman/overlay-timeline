import type { Entry, Project, Settings, Timeline } from '../model/types';

/**
 * Turns the rows of a Notion database into a Project.
 *
 * Runs in the GitHub sync script (plain Node, which strips types but resolves no extension-less
 * imports), so this file must only have `import type` imports.
 *
 * Only the fields the chart needs are copied. Everything else in the database stays private.
 */

/** Which Notion property feeds which field. Unset fields are detected automatically. */
export type NotionMapping = {
  /** Title property (every database has exactly one). */
  name?: string;
  /** Date property. If it has an end date, that is the entry's end. */
  date?: string;
  /** Optional separate end-date property (for databases with "Start" and "End" columns). */
  end?: string;
  /** Select, status, multi-select or text property that decides the row. */
  timeline?: string;
  /** Text property copied into the tooltip. Never detected automatically, since notes may be private. */
  notes?: string;
};

export type NotionConvertOptions = {
  mapping?: NotionMapping;
  /** Database schema (`GET /v1/databases/{id}`): gives the order and colours of select options. */
  schema?: unknown;
  settings?: Partial<Settings>;
};

export type NotionConvertResult =
  | { ok: true; project: Project; warnings: string[]; used: Required<Pick<NotionMapping, 'name' | 'date'>> & NotionMapping }
  | { ok: false; error: string };

/** Notion's named colours as chart colours (Notion's own text colours, readable on white and dark). */
export const NOTION_COLORS: Record<string, string> = {
  default: '#4b5563',
  gray: '#787774',
  brown: '#9f6b53',
  orange: '#d9730d',
  yellow: '#cb912f',
  green: '#448361',
  blue: '#337ea9',
  purple: '#9065b0',
  pink: '#c14c8a',
  red: '#d44c47',
};
/** For rows whose value has no Notion colour (text properties). */
const FALLBACK_COLORS = ['#337ea9', '#c14c8a', '#448361', '#d9730d', '#9065b0', '#d44c47', '#9f6b53', '#cb912f'];

const DEFAULT_SETTINGS: Settings = { overlapMode: 'sublanes', scale: 'auto', showToday: true };
const MAX_TEXT = 300;
const MAX_NOTES = 2000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Accepts a database link (with or without view id) or the bare id, with or without dashes. */
export function parseDatabaseId(input: string): string | null {
  const path = input.trim().split(/[?#]/)[0] ?? '';
  const matches = path.replace(/-/g, '').match(/[0-9a-f]{32}/gi);
  const raw = matches?.[matches.length - 1]?.toLowerCase();
  if (!raw) return null;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

const plainText = (rich: unknown): string =>
  Array.isArray(rich) ? rich.map((r) => (isObj(r) ? (str(r.plain_text) ?? '') : '')).join('') : '';

/** "2026-03-01T10:00:00.000+01:00" → "2026-03-01" (the date where the event happens). */
const toDay = (v: unknown): string | undefined => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined;
};

/** A property's type as Notion reports it, from the schema or from a row. */
function propertyTypes(schema: unknown, rows: Obj[]): Map<string, string> {
  const types = new Map<string, string>();
  const add = (props: unknown) => {
    if (!isObj(props)) return;
    for (const [name, p] of Object.entries(props)) if (isObj(p) && str(p.type) && !types.has(name)) types.set(name, p.type as string);
  };
  if (isObj(schema)) add(schema.properties);
  for (const r of rows) add(r.properties);
  return types;
}

/** Reads a date value: date properties, and formulas or rollups that return a date. */
function dateValue(prop: unknown): { start?: string; end?: string } {
  if (!isObj(prop)) return {};
  let d: unknown = prop.date;
  if (prop.type === 'formula' && isObj(prop.formula)) d = prop.formula.date;
  if (prop.type === 'rollup' && isObj(prop.rollup)) d = prop.rollup.date;
  if (!isObj(d)) return {};
  return { start: toDay(d.start), end: toDay(d.end) };
}

/** The row's timeline value(s) with Notion colour, if any. */
function choiceValues(prop: unknown): { name: string; color?: string }[] {
  if (!isObj(prop)) return [];
  const one = (v: unknown) => (isObj(v) && str(v.name) ? [{ name: (v.name as string).trim(), color: str(v.color) }] : []);
  switch (prop.type) {
    case 'select':
      return one(prop.select);
    case 'status':
      return one(prop.status);
    case 'multi_select':
      return Array.isArray(prop.multi_select) ? prop.multi_select.flatMap(one) : [];
    case 'rich_text':
      return plainText(prop.rich_text).trim() ? [{ name: plainText(prop.rich_text).trim() }] : [];
    case 'formula':
      return isObj(prop.formula) && str(prop.formula.string)?.trim() ? [{ name: (prop.formula.string as string).trim() }] : [];
    default:
      return [];
  }
}

/** Option order and colours from the schema, so rows appear in the order set up in Notion. */
function schemaOptions(schema: unknown, property: string): { name: string; color?: string }[] {
  if (!isObj(schema) || !isObj(schema.properties)) return [];
  const p = schema.properties[property];
  if (!isObj(p) || !str(p.type)) return [];
  const conf = p[p.type as string];
  if (!isObj(conf) || !Array.isArray(conf.options)) return [];
  return conf.options.flatMap((o) => (isObj(o) && str(o.name) ? [{ name: (o.name as string).trim(), color: str(o.color) }] : []));
}

/**
 * Converts query results (the `results` of `POST /v1/databases/{id}/query`, all pages joined).
 * Rows without a date are skipped with a warning; a row with only a start date is a milestone.
 */
export function notionToProject(rows: unknown[], options: NotionConvertOptions = {}): NotionConvertResult {
  const pages = rows.filter(isObj).filter((r) => r.archived !== true && r.in_trash !== true);
  const types = propertyTypes(options.schema, pages);
  const names = [...types.keys()];
  const ofType = (...t: string[]) => names.filter((n) => t.includes(types.get(n)!));
  const m = options.mapping ?? {};

  for (const [field, prop] of Object.entries(m)) {
    if (prop !== undefined && !types.has(prop)) {
      return { ok: false, error: `The database has no property "${prop}" (set as "${field}"). Properties: ${names.join(', ') || 'none'}.` };
    }
  }

  const name = m.name ?? ofType('title')[0];
  if (!name) return { ok: false, error: 'The database has no title property.' };

  // Dates: an explicit mapping, else "Start"/"End" pairs, else the first date property.
  const dates = ofType('date');
  let date = m.date;
  let end = m.end;
  if (!date) {
    const startProp = dates.find((n) => /start|begin|from|von|beginn/i.test(n));
    const endProp = dates.find((n) => n !== startProp && /end|finish|until|due|to\b|bis/i.test(n));
    if (startProp && endProp) [date, end] = [startProp, end ?? endProp];
    else date = dates[0] ?? ofType('formula', 'rollup')[0];
  }
  if (!date) return { ok: false, error: `The database has no date property. Properties: ${names.join(', ')}.` };

  const timeline = m.timeline ?? ofType('select')[0] ?? ofType('status')[0] ?? ofType('multi_select')[0];

  const warnings: string[] = [];
  const order = schemaOptions(options.schema, timeline ?? '');
  const optionColor = new Map(order.map((o) => [o.name, o.color]));
  const usedTimelines = new Map<string, { color?: string }>();
  const entries: Entry[] = [];
  const noTimeline = timeline ? `No ${timeline}` : 'All entries';
  let multiValue = 0;
  let noDate = 0;
  let badRange = 0;

  for (const page of pages) {
    const props = isObj(page.properties) ? page.properties : {};
    const title = plainText(isObj(props[name]) ? props[name].title : undefined).trim() || 'Untitled';
    const d = dateValue(props[date]);
    const start = d.start;
    const finish = (end ? dateValue(props[end]).start : undefined) ?? d.end ?? start;
    if (!start || !finish) {
      noDate++;
      continue;
    }
    if (finish < start) {
      badRange++;
      continue;
    }

    const choices = timeline ? choiceValues(props[timeline]) : [];
    if (choices.length > 1) multiValue++;
    const row = choices[0]?.name || noTimeline;
    if (!usedTimelines.has(row)) usedTimelines.set(row, { color: choices[0]?.color ?? optionColor.get(row) });

    const notes = m.notes && isObj(props[m.notes]) ? choiceValues(props[m.notes])[0]?.name : undefined;
    entries.push({
      id: str(page.id) ?? `n${entries.length}`,
      name: title.slice(0, MAX_TEXT),
      start,
      end: finish,
      timelineId: row,
      ...(notes ? { notes: notes.slice(0, MAX_NOTES) } : {}),
    });
  }

  if (noDate) warnings.push(`${noDate} ${noDate === 1 ? 'row has' : 'rows have'} no date in "${date}" and ${noDate === 1 ? 'was' : 'were'} skipped.`);
  if (badRange) warnings.push(`${badRange} ${badRange === 1 ? 'row ends' : 'rows end'} before ${badRange === 1 ? 'it starts' : 'they start'} and ${badRange === 1 ? 'was' : 'were'} skipped.`);
  if (multiValue) warnings.push(`${multiValue} ${multiValue === 1 ? 'row has' : 'rows have'} several "${timeline}" values; only the first is used.`);

  // Rows in Notion's option order; values not in the schema follow alphabetically; "No …" comes last.
  const rank = new Map(order.map((o, i) => [o.name, i]));
  const rowNames = [...usedTimelines.keys()].sort((a, b) => {
    if (a === noTimeline || b === noTimeline) return a === noTimeline ? 1 : -1;
    const ra = rank.get(a) ?? Infinity;
    const rb = rank.get(b) ?? Infinity;
    return ra !== rb ? ra - rb : a.localeCompare(b);
  });

  let fallback = 0;
  const timelines: Timeline[] = rowNames.map((row, i) => {
    const notionColor = usedTimelines.get(row)?.color;
    const color =
      row === noTimeline
        ? NOTION_COLORS.gray!
        : notionColor && notionColor !== 'default' && NOTION_COLORS[notionColor]
          ? NOTION_COLORS[notionColor]!
          : FALLBACK_COLORS[fallback++ % FALLBACK_COLORS.length]!;
    return { id: `t${i}`, name: row.slice(0, MAX_TEXT), color, order: i };
  });
  const idOf = new Map(rowNames.map((row, i) => [row, `t${i}`]));
  for (const e of entries) e.timelineId = idOf.get(e.timelineId)!;
  entries.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  return {
    ok: true,
    project: { entries, timelines, settings: { ...DEFAULT_SETTINGS, ...options.settings } },
    warnings,
    used: { name, date, ...(end ? { end } : {}), ...(timeline ? { timeline } : {}), ...(m.notes ? { notes: m.notes } : {}) },
  };
}
